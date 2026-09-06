begin;
create or replace function public.set_primary_staff_branch(p_assignment_id uuid) returns public.staff_branch_assignments
language plpgsql security definer set search_path=public as $$
declare a public.staff_branch_assignments; old jsonb;
begin
 select * into a from public.staff_branch_assignments where id=p_assignment_id for update;
 if not found or a.status<>'ACTIVE' or not public.can_access_branch(a.branch_id) or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 old:=to_jsonb(a); update public.staff_branch_assignments set is_primary=false,updated_at=now() where staff_id=a.staff_id and is_primary; update public.staff_branch_assignments set is_primary=true,updated_at=now() where id=a.id returning * into a; update public.profiles set branch_id=a.branch_id,updated_at=now() where id=a.staff_id; perform public.write_pos_audit_diff('PRIMARY_BRANCH_CHANGED','STAFF_BRANCH_ASSIGNMENT',a.id,null,old,to_jsonb(a)); return a;
end $$;
revoke all on function public.set_primary_staff_branch(uuid) from public,anon;
grant execute on function public.set_primary_staff_branch(uuid) to authenticated;
commit;
