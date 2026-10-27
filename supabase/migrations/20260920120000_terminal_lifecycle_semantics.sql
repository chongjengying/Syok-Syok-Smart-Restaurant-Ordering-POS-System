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

  if action='REVOKE' then
    if t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED'; end if;
    update public.pos_terminals
      set registration_status='REVOKED',
          status='INACTIVE',
          device_identifier=null,
          auth_user_id=null,
          authenticated_at=null,
          lock_status='LOCKED',
          updated_at=now()
      where id=t.id returning * into t;
  elsif action='RETIRE' then
    update public.pos_terminals
      set status='ARCHIVED',
          registration_status='REVOKED',
          device_identifier=null,
          auth_user_id=null,
          authenticated_at=null,
          lock_status='LOCKED',
          updated_at=now()
      where id=t.id returning * into t;
  elsif action='ACTIVATE' then
    if t.registration_status<>'REGISTERED' or t.device_identifier is null then raise exception 'TERMINAL_NOT_REGISTERED'; end if;
    if t.registration_status='REVOKED' or t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED_OR_REVOKED'; end if;
    if not exists(
      select 1 from public.branches b
      join public.companies c on c.id=b.company_id
      where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE'
    ) then raise exception 'BRANCH_OR_COMPANY_INACTIVE'; end if;
    update public.pos_terminals set status='ACTIVE', lock_status='UNLOCKED', updated_at=now()
      where id=t.id returning * into t;
  elsif action='DEACTIVATE' then
    if t.registration_status='REVOKED' or t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED_OR_REVOKED'; end if;
    update public.pos_terminals set status='INACTIVE', updated_at=now()
      where id=t.id returning * into t;
  elsif action='LOCK' then
    if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_NOT_ACTIVE'; end if;
    update public.pos_terminals set lock_status='LOCKED', updated_at=now()
      where id=t.id returning * into t;
    update public.terminal_staff_sessions set status='LOCKED', last_activity_at=now()
      where terminal_id=t.id and status='ACTIVE';
  elsif action='UNLOCK' then
    if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_NOT_ACTIVE'; end if;
    update public.pos_terminals set lock_status='UNLOCKED', updated_at=now()
      where id=t.id returning * into t;
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

create or replace function public.activate_terminal_with_code(p_code text, p_device_identifier text)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  c public.terminal_activation_codes;
  t public.pos_terminals;
  caller public.profiles;
  normalized text := btrim(coalesce(p_code,''));
begin
  if auth.uid() is null or length(p_device_identifier)<32 or normalized !~ '^[0-9]{6}$' then
    raise exception 'INVALID_ACTIVATION_REQUEST';
  end if;

  select * into caller
  from public.profiles
  where id=auth.uid() and status='ACTIVE' and role_name='ADMIN';
  if found then raise exception 'ADMIN_ACCOUNT_NOT_ALLOWED'; end if;

  select * into c
  from public.terminal_activation_codes
  where used_at is null and expires_at>now() and attempts<5
    and code_hash=crypt(normalized,code_hash)
  order by created_at desc
  limit 1
  for update;
  if not found then
    update public.terminal_activation_codes
      set attempts=least(attempts+1,5)
      where used_at is null and expires_at>now() and attempts<5;
    raise exception 'INVALID_ACTIVATION_CODE';
  end if;

  select * into t from public.pos_terminals where id=c.terminal_id for update;
  if t.status='ARCHIVED' then raise exception 'TERMINAL_RETIRED'; end if;
  if t.auth_user_id is not null and t.auth_user_id<>auth.uid() then
    raise exception 'TERMINAL_ALREADY_BOUND';
  end if;

  update public.pos_terminals
    set auth_user_id=auth.uid(),
        device_identifier=p_device_identifier,
        registration_status='REGISTERED',
        status='ACTIVE',
        lock_status='UNLOCKED',
        registered_at=now(),
        authenticated_at=now(),
        updated_at=now()
    where id=t.id;
  update public.terminal_activation_codes set used_at=now() where id=c.id;
  perform public.write_pos_audit('TERMINAL_ACTIVATED','TERMINAL',t.id,null,
    jsonb_build_object('terminalCode',t.terminal_code));
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code);
end;
$$;

revoke all on function public.activate_terminal_with_code(text,text) from public, anon;
grant execute on function public.activate_terminal_with_code(text,text) to authenticated;

commit;
