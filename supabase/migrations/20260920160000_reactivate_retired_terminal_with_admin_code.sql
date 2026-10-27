begin;

create or replace function public.create_terminal_activation_code(p_terminal_id uuid)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare
  caller public.profiles;
  t public.pos_terminals;
  raw_code text;
  previous jsonb;
begin
  select * into caller from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or caller.role_name <> 'ADMIN' or not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id and company_id=caller.company_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if t.status='ACTIVE' and t.registration_status='REGISTERED' and t.device_identifier is not null then raise exception 'TERMINAL_ALREADY_BOUND'; end if;

  previous := to_jsonb(t) - 'device_identifier';
  update public.terminal_activation_codes set used_at=coalesce(used_at, now()) where terminal_id=t.id and used_at is null;
  if t.status='ARCHIVED' or t.registration_status='REVOKED' then
    update public.pos_terminals
      set status='CREATED', registration_status='UNREGISTERED', device_identifier=null, auth_user_id=null,
          authenticated_at=null, registered_at=null, lock_status='UNLOCKED', updated_at=now()
      where id=t.id returning * into t;
    perform public.write_pos_audit_diff('TERMINAL_REOPENED_FOR_ACTIVATION', 'TERMINAL', t.id, null, previous, to_jsonb(t) - 'device_identifier');
  end if;

  raw_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  insert into public.terminal_activation_codes(terminal_id, code_hash, expires_at, created_by)
  values(t.id, crypt(raw_code, gen_salt('bf', 12)), now()+interval '15 minutes', auth.uid());
  perform public.write_pos_audit('TERMINAL_ACTIVATION_CODE_CREATED', 'TERMINAL', t.id, null,
    jsonb_build_object('expiresAt', now()+interval '15 minutes', 'reopened', previous->>'status'='ARCHIVED'));
  return jsonb_build_object('terminalId', t.id, 'terminalCode', t.terminal_code, 'code', raw_code, 'expiresAt', now()+interval '15 minutes');
end;
$$;

revoke all on function public.create_terminal_activation_code(uuid) from public, anon;
grant execute on function public.create_terminal_activation_code(uuid) to authenticated;

commit;
