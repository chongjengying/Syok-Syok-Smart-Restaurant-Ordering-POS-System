begin;
create or replace function public.assign_user_branch(p_user_id uuid,p_branch_id uuid) returns public.profiles language plpgsql security definer set search_path=public as $$
declare p public.profiles; old_row jsonb;
begin
  if not public.has_pos_permission('user.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  select * into p from public.profiles where id=p_user_id for update;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  -- An unassigned staff profile is a valid assignment target. When it already
  -- belongs to a branch, a manager may only move staff within their scope.
  if p.branch_id is not null and not public.can_access_branch(p.branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  old_row:=jsonb_build_object('branchId',p.branch_id);
  update public.profiles set branch_id=p_branch_id,updated_at=now() where id=p.id returning * into p;
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where staff_id=p.id and status in ('ACTIVE','LOCKED');
  perform public.write_pos_audit_diff('STAFF_ASSIGNED','PROFILE',p.id,null,old_row,jsonb_build_object('branchId',p_branch_id));
  return p;
end $$;
revoke all on function public.assign_user_branch(uuid,uuid) from public,anon;
grant execute on function public.assign_user_branch(uuid,uuid) to authenticated;
commit;
