begin;

create or replace function public.transition_pos_terminal(
  p_terminal_id uuid,
  p_action text,
  p_device_identifier text default null
) returns public.pos_terminals
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.pos_terminals;
  previous jsonb;
  action text := upper(trim(p_action));
begin
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if not public.can_access_branch(t.branch_id)
     or not public.has_pos_permission(case when action in ('DEACTIVATE','REVOKE','RETIRE') then 'terminal.deactivate' else 'terminal.update' end)
  then raise exception 'INSUFFICIENT_PERMISSION'; end if;

  previous := to_jsonb(t) - 'device_identifier';

  if action='ACTIVATE' then
    if t.registration_status<>'REGISTERED' or t.device_identifier is null then raise exception 'TERMINAL_NOT_REGISTERED'; end if;
    if t.registration_status='REVOKED' or t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED_OR_REVOKED'; end if;
    if not exists(
      select 1 from public.branches b
      join public.companies c on c.id=b.company_id
      where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE'
    ) then raise exception 'BRANCH_OR_COMPANY_INACTIVE'; end if;
    update public.pos_terminals
      set status='ACTIVE', lock_status='UNLOCKED', updated_at=now()
      where id=t.id returning * into t;
  elsif action='DEACTIVATE' then
    if t.registration_status='REVOKED' or t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED_OR_REVOKED'; end if;
    update public.pos_terminals set status='INACTIVE', updated_at=now() where id=t.id returning * into t;
  elsif action='REVOKE' then
    if t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED'; end if;
    update public.pos_terminals
      set registration_status='REVOKED', status='INACTIVE', device_identifier=null,
          lock_status='LOCKED', updated_at=now()
      where id=t.id returning * into t;
  elsif action='RETIRE' then
    update public.pos_terminals
      set status='ARCHIVED', registration_status='REVOKED', device_identifier=null,
          lock_status='LOCKED', updated_at=now()
      where id=t.id returning * into t;
  elsif action='LOCK' then
    if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_NOT_ACTIVE'; end if;
    update public.pos_terminals set lock_status='LOCKED', updated_at=now() where id=t.id returning * into t;
    update public.terminal_staff_sessions set status='LOCKED', last_activity_at=now()
      where terminal_id=t.id and status='ACTIVE';
  elsif action='UNLOCK' then
    if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_NOT_ACTIVE'; end if;
    update public.pos_terminals set lock_status='UNLOCKED', updated_at=now() where id=t.id returning * into t;
  else
    raise exception 'INVALID_TERMINAL_ACTION';
  end if;

  if action in ('DEACTIVATE','REVOKE','RETIRE') then
    update public.terminal_staff_sessions
      set status='ENDED', ended_at=now()
      where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  end if;

  perform public.write_pos_audit_diff('TERMINAL_'||action,'TERMINAL',t.id,null,previous,to_jsonb(t)-'device_identifier');
  return t;
end;
$$;

revoke all on function public.transition_pos_terminal(uuid,text,text) from public, anon;
grant execute on function public.transition_pos_terminal(uuid,text,text) to authenticated;

commit;
