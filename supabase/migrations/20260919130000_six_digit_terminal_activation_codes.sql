begin;

create or replace function public.create_terminal_activation_code(p_terminal_id uuid)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare caller public.profiles; t public.pos_terminals; raw_code text;
begin
  select * into caller from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or caller.role_name <> 'ADMIN' or not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id and company_id=caller.company_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if t.status='ACTIVE' and t.registration_status='REGISTERED' and t.auth_user_id is not null then raise exception 'TERMINAL_ALREADY_BOUND'; end if;
  update public.terminal_activation_codes set used_at=coalesce(used_at, now()) where terminal_id=t.id and used_at is null;
  raw_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  insert into public.terminal_activation_codes(terminal_id,code_hash,expires_at,created_by)
  values(t.id, crypt(raw_code, gen_salt('bf', 12)), now()+interval '15 minutes', auth.uid());
  perform public.write_pos_audit('TERMINAL_ACTIVATION_CODE_CREATED','TERMINAL',t.id,null,jsonb_build_object('expiresAt',now()+interval '15 minutes'));
  return jsonb_build_object('terminalId',t.id,'terminalCode',t.terminal_code,'code',raw_code,'expiresAt',now()+interval '15 minutes');
end $$;

create or replace function public.activate_terminal_with_code(p_code text, p_device_identifier text)
returns jsonb language plpgsql security definer set search_path=public, extensions as $$
declare c public.terminal_activation_codes; t public.pos_terminals; caller public.profiles; normalized text:=btrim(coalesce(p_code,''));
begin
  if auth.uid() is null or length(p_device_identifier)<32 or normalized !~ '^[0-9]{6}$' then raise exception 'INVALID_ACTIVATION_REQUEST'; end if;
  select * into caller from public.profiles where id=auth.uid() and status='ACTIVE' and role_name='ADMIN';
  if found then raise exception 'ADMIN_ACCOUNT_NOT_ALLOWED'; end if;
  select * into c from public.terminal_activation_codes where used_at is null and expires_at>now() and attempts<5 and code_hash=crypt(normalized,code_hash) order by created_at desc limit 1 for update;
  if not found then
    update public.terminal_activation_codes set attempts=least(attempts+1,5) where used_at is null and expires_at>now() and attempts<5;
    raise exception 'INVALID_ACTIVATION_CODE';
  end if;
  select * into t from public.pos_terminals where id=c.terminal_id for update;
  if t.auth_user_id is not null and t.auth_user_id<>auth.uid() then raise exception 'TERMINAL_ALREADY_BOUND'; end if;
  update public.pos_terminals set auth_user_id=auth.uid(), device_identifier=p_device_identifier, registration_status='REGISTERED', status='ACTIVE', registered_at=now(), authenticated_at=now(), updated_at=now() where id=t.id;
  update public.terminal_activation_codes set used_at=now() where id=c.id;
  perform public.write_pos_audit('TERMINAL_ACTIVATED','TERMINAL',t.id,null,jsonb_build_object('terminalCode',t.terminal_code));
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code);
end $$;

commit;
