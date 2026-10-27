begin;

create or replace function public.reassign_pos_terminal(p_terminal_id uuid,p_branch_id uuid)
returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; previous public.pos_terminals; b public.branches;
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or t.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  select * into b from public.branches where id=p_branch_id and company_id=t.company_id and status='ACTIVE' for share;
  if not found or not public.can_access_branch(b.id) then raise exception 'INVALID_BRANCH'; end if;
  if t.branch_id=b.id then return t; end if;
  if exists(select 1 from public.cashier_shifts where terminal_id=t.id and status='OPEN') then raise exception 'TERMINAL_HAS_OPEN_SHIFT'; end if;
  previous:=t;
  update public.pos_terminals set branch_id=b.id,status='INACTIVE',registration_status='UNREGISTERED',device_identifier=null,auth_user_id=null,authenticated_at=null,lock_status='UNLOCKED',updated_at=now()
  where id=t.id returning * into t;
  update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  perform public.write_pos_audit_diff('TERMINAL_REASSIGNED','TERMINAL',t.id,null,to_jsonb(previous),to_jsonb(t));
  return t;
end $$;

commit;
