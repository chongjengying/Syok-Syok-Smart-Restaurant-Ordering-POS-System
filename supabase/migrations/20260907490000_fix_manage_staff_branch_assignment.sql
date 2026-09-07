-- Admin > Branch > Staff > Manage changes the primary branch through this
-- function. Mark the profile update as an authorized admin write so the
-- protected-profile trigger accepts it.
create or replace function public.assign_user_branch(
  p_user_id uuid,
  p_branch_id uuid,
  p_is_primary boolean default false
)
returns public.staff_branch_assignments
language plpgsql security definer set search_path=public as $$
declare
  result public.staff_branch_assignments;
  old jsonb;
begin
  if not public.has_pos_permission('user.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE') then raise exception 'STAFF_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  select to_jsonb(a) into old from public.staff_branch_assignments a where a.staff_id=p_user_id and a.branch_id=p_branch_id;
  if p_is_primary then update public.staff_branch_assignments set is_primary=false,updated_at=now() where staff_id=p_user_id and is_primary; end if;
  insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at,removed_at)
  values(p_user_id,p_branch_id,p_is_primary,'ACTIVE',auth.uid(),now(),null)
  on conflict(staff_id,branch_id) do update
    set is_primary=excluded.is_primary,status='ACTIVE',assigned_by=auth.uid(),assigned_at=coalesce(public.staff_branch_assignments.assigned_at,now()),removed_at=null,updated_at=now()
  returning * into result;
  perform set_config('app.admin_profile_write','allowed',true);
  update public.profiles
  set branch_id=(select branch_id from public.staff_branch_assignments where staff_id=p_user_id and is_primary and status='ACTIVE' limit 1),updated_at=now()
  where id=p_user_id;
  perform public.write_pos_audit_diff(
    case when old is null then 'STAFF_BRANCH_ASSIGNED' when (old->>'status')='INACTIVE' then 'STAFF_BRANCH_ACTIVATED' else 'STAFF_PRIMARY_BRANCH_CHANGED' end,
    'STAFF_BRANCH_ASSIGNMENT',result.id,null,old,to_jsonb(result)
  );
  return result;
end $$;
