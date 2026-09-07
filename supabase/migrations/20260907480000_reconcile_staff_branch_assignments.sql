-- Keep staff branch access in sync with the Admin > Staff edit form.
-- The primary branch is always retained; unchecked additional branches are
-- marked inactive rather than deleted so assignment history is retained.
create or replace function public.admin_update_staff(p_user_id uuid,p_payload jsonb)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare
  target public.profiles%rowtype;
  requested_role text;
  requested_status text;
  requested_role_id uuid;
  requested_branch_id uuid;
  active_admins integer;
  branch_id uuid;
  requested_branch_ids uuid[];
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.profiles where id=p_user_id for update;
  if not found or target.company_id is distinct from public.current_user_company_id() then raise exception 'USER_NOT_FOUND'; end if;
  requested_role:=upper(coalesce(nullif(btrim(p_payload->>'role'),''),target.role_name));
  requested_status:=upper(coalesce(nullif(btrim(p_payload->>'status'),''),target.status));
  if requested_status not in ('ACTIVE','INACTIVE','LOCKED') then raise exception 'INVALID_USER_STATUS'; end if;
  if p_payload ? 'username' and nullif(btrim(p_payload->>'username'),'') is not null and lower(btrim(p_payload->>'username')) !~ '^[a-z0-9._-]{3,50}$' then raise exception 'INVALID_USERNAME'; end if;
  select id into requested_role_id from public.roles where name=requested_role;
  if not found then raise exception 'INVALID_ROLE'; end if;
  requested_branch_id:=nullif(p_payload->>'branchId','')::uuid;
  if requested_branch_id is null then requested_branch_id:=target.branch_id; end if;
  if requested_branch_id is null or not public.can_access_branch(requested_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if not exists(select 1 from public.branches where id=requested_branch_id and company_id=target.company_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  if requested_role is distinct from target.role_name and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if target.role_name='ADMIN' and target.status='ACTIVE' and (requested_role<>'ADMIN' or requested_status<>'ACTIVE') then
    perform pg_advisory_xact_lock(hashtextextended('active-admin-roster',0));
    select count(*) into active_admins from public.profiles where company_id=target.company_id and role_name='ADMIN' and status='ACTIVE';
    if active_admins<=1 then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
  end if;

  perform set_config('app.admin_profile_write','allowed',true);
  update public.profiles
  set name=coalesce(nullif(left(btrim(p_payload->>'name'),150),''),name),
      username=case when p_payload ? 'username' then nullif(left(lower(btrim(p_payload->>'username')),50),'') else username end,
      role_id=requested_role_id,role_name=requested_role,status=requested_status,
      branch_id=requested_branch_id,updated_at=now()
  where id=p_user_id returning * into target;
  perform public.assign_user_branch(p_user_id,requested_branch_id,true);

  if target.status='ACTIVE' and p_payload ? 'additionalBranches' then
    select array_agg(distinct value::uuid) into requested_branch_ids
    from jsonb_array_elements_text(coalesce(p_payload->'additionalBranches','[]'::jsonb)) value
    where value::uuid <> requested_branch_id;
    requested_branch_ids:=coalesce(requested_branch_ids,'{}'::uuid[]);
    if exists (
      select 1 from unnest(requested_branch_ids) id
      where not public.can_access_branch(id)
         or not exists(select 1 from public.branches b where b.id=id and b.company_id=target.company_id and b.status='ACTIVE')
    ) then raise exception 'INVALID_BRANCH'; end if;
    update public.staff_branch_assignments as assignment
    set status='INACTIVE',is_primary=false,removed_at=now(),updated_at=now()
    where assignment.staff_id=p_user_id and assignment.status='ACTIVE' and assignment.branch_id<>requested_branch_id
      and not (assignment.branch_id=any(requested_branch_ids));
    foreach branch_id in array requested_branch_ids loop
      perform public.assign_user_branch(p_user_id,branch_id,false);
    end loop;
  elsif target.status='ACTIVE' then
    for branch_id in select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'additionalBranches','[]'::jsonb)) value where value::uuid<>requested_branch_id loop
      perform public.assign_user_branch(p_user_id,branch_id,false);
    end loop;
  end if;
  return target;
end $$;
