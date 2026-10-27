begin;

-- Device-first enrollment: the short-lived activation code is the only
-- unauthenticated entry point. Account binding is completed after staff login.
create or replace function public.activate_terminal_with_code(p_code text, p_device_identifier text)
returns jsonb
language plpgsql
security definer
set search_path=public, extensions
as $$
declare
  c public.terminal_activation_codes;
  t public.pos_terminals;
  b public.branches;
  co public.companies;
  normalized text := btrim(coalesce(p_code,''));
begin
  if length(p_device_identifier)<32 or normalized !~ '^[0-9]{6}$' then
    raise exception 'INVALID_ACTIVATION_REQUEST';
  end if;

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
  if t.status='ARCHIVED' or t.registration_status='REVOKED' then
    raise exception 'TERMINAL_RETIRED';
  end if;
  if t.auth_user_id is not null or t.device_identifier is not null then
    raise exception 'TERMINAL_ALREADY_BOUND';
  end if;

  update public.pos_terminals
    set device_identifier=p_device_identifier,
        registration_status='REGISTERED',
        status='ACTIVE',
        lock_status='UNLOCKED',
        registered_at=now(),
        authenticated_at=null,
        updated_at=now()
    where id=t.id;
  update public.terminal_activation_codes set used_at=now() where id=c.id;
  perform public.write_pos_audit('TERMINAL_ACTIVATED','TERMINAL',t.id,null,
    jsonb_build_object('terminalCode',t.terminal_code,'deviceFirst',true));
  select * into b from public.branches where id=t.branch_id;
  select * into co from public.companies where id=b.company_id;
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalCredential',p_device_identifier,'activatedAt',now(),'status',t.status,'registrationStatus',t.registration_status,
    'company',jsonb_build_object('id',co.id,'code',co.code,'name',co.name),
    'outlet',jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'status',b.status),
    'terminal',jsonb_build_object('id',t.id,'code',t.terminal_code,'name',t.name,'type',t.terminal_type,'status',t.status));
end;
$$;

create or replace function public.resolve_authenticated_terminal(p_device_identifier text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies;
begin
  select * into t
  from public.pos_terminals
  where auth_user_id=auth.uid()
     or (auth_user_id is null and device_identifier=p_device_identifier)
  order by (auth_user_id=auth.uid()) desc
  limit 1
  for update;
  if not found then return jsonb_build_object('ok',false,'code','TERMINAL_AUTH_NOT_BOUND'); end if;
  if t.auth_user_id is null then
    update public.pos_terminals set auth_user_id=auth.uid(),authenticated_at=now(),updated_at=now() where id=t.id returning * into t;
  end if;
  select * into b from public.branches where id=t.branch_id;
  select * into c from public.companies where id=t.company_id;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
  if b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
  if c.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'branchId',b.id,'branchCode',b.code,'companyId',c.id);
end $$;

revoke all on function public.activate_terminal_with_code(text,text) from public;
grant execute on function public.activate_terminal_with_code(text,text) to anon, authenticated;
revoke all on function public.resolve_authenticated_terminal(text) from public, anon;
grant execute on function public.resolve_authenticated_terminal(text) to authenticated;

commit;
