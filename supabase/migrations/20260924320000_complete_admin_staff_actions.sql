begin;

create or replace function public.admin_update_staff_record(
  p_staff_id uuid,
  p_name text,
  p_role text,
  p_branch_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor public.profiles;
  target public.staff;
  branch_row public.branches;
  role_row public.roles;
  previous jsonb;
begin
  select * into actor from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.staff where id=p_staff_id and company_id=actor.company_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  select * into branch_row from public.branches where id=p_branch_id and company_id=actor.company_id;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if p_active and branch_row.status<>'ACTIVE' then raise exception 'BRANCH_INACTIVE'; end if;
  select * into role_row from public.roles where name=upper(btrim(p_role));
  if not found or role_row.name not in ('MANAGER','CASHIER','WAITER','KITCHEN') then raise exception 'INVALID_STAFF_ROLE'; end if;
  if nullif(btrim(p_name),'') is null or length(btrim(p_name))>150 then raise exception 'INVALID_STAFF_NAME'; end if;
  previous:=to_jsonb(target);
  update public.staff
  set name=btrim(p_name),role_id=role_row.id,branch_id=branch_row.id,active=p_active,updated_at=now(),updated_by=auth.uid()
  where id=target.id returning * into target;
  if not p_active then
    update public.terminal_staff_sessions
    set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
    where staff_record_id=target.id and status in ('ACTIVE','LOCKED');
  end if;
  perform public.write_pos_audit_diff(case when p_active then 'STAFF_UPDATED' else 'STAFF_DEACTIVATED' end,'STAFF',target.id,null,previous,to_jsonb(target));
  return jsonb_build_object('id',target.id,'name',target.name,'branchId',target.branch_id,'role',role_row.name,'status',case when target.active then 'ACTIVE' else 'INACTIVE' end);
end;
$$;

revoke all on function public.admin_update_staff_record(uuid,text,text,uuid,boolean) from public,anon;
grant execute on function public.admin_update_staff_record(uuid,text,text,uuid,boolean) to authenticated;

commit;
