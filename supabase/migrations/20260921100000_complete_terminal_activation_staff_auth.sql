begin;

-- First-device activation is intentionally the only anonymous entry point. The
-- short-lived code is hashed in terminal_activation_codes and is consumed once.
create or replace function public.activate_terminal_with_code(p_code text, p_device_identifier text)
returns jsonb
language plpgsql security definer set search_path=public, extensions
as $$
declare c public.terminal_activation_codes; t public.pos_terminals; b public.branches; co public.companies;
declare normalized text := upper(btrim(coalesce(p_code,'')));
begin
  if length(coalesce(p_device_identifier,'')) < 32 or normalized !~ '^[0-9]{6}$' then
    raise exception 'INVALID_ACTIVATION_REQUEST';
  end if;
  select * into c from public.terminal_activation_codes
   where used_at is null and expires_at > now() and attempts < 5 and code_hash=crypt(normalized,code_hash)
   order by created_at desc limit 1 for update;
  if not found then
    update public.terminal_activation_codes set attempts=least(attempts+1,5)
     where used_at is null and expires_at > now() and attempts < 5;
    raise exception 'INVALID_ACTIVATION_CODE';
  end if;
  select * into t from public.pos_terminals where id=c.terminal_id for update;
  if t.auth_user_id is not null or t.device_identifier is not null then raise exception 'TERMINAL_ALREADY_BOUND'; end if;
  select * into b from public.branches where id=t.branch_id;
  select * into co from public.companies where id=t.company_id;
  if b.status <> 'ACTIVE' or co.status <> 'ACTIVE' then raise exception 'COMPANY_OR_OUTLET_INACTIVE'; end if;
  -- A valid code is administrator-issued authorization to reopen a revoked or
  -- archived terminal for a new device registration.
  update public.pos_terminals set device_identifier=p_device_identifier, registration_status='REGISTERED', status='ACTIVE', lock_status='UNLOCKED', registered_at=now(), authenticated_at=null, updated_at=now() where id=t.id;
  update public.terminal_activation_codes set used_at=now() where id=c.id;
  perform public.write_pos_audit('TERMINAL_ACTIVATED','TERMINAL',t.id,null,jsonb_build_object('terminalCode',t.terminal_code,'deviceFirst',true));
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalCredential',p_device_identifier,'activatedAt',now(),'status','ACTIVE','registrationStatus','REGISTERED',
    'company',jsonb_build_object('id',co.id,'code',co.code,'name',co.name),
    'outlet',jsonb_build_object('id',b.id,'code',b.code,'name',b.name,'status',b.status),
    'terminal',jsonb_build_object('id',t.id,'code',t.terminal_code,'name',t.name,'type',t.terminal_type,'status',t.status));
end $$;
revoke all on function public.activate_terminal_with_code(text,text) from public, authenticated;
grant execute on function public.activate_terminal_with_code(text,text) to anon, authenticated;

create or replace function public.resolve_authenticated_terminal(p_device_identifier text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; co public.companies;
begin
  select * into t from public.pos_terminals where auth_user_id=auth.uid() or (auth_user_id is null and device_identifier=p_device_identifier) order by (auth_user_id=auth.uid()) desc limit 1 for update;
  if not found then return jsonb_build_object('ok',false,'code','TERMINAL_AUTH_NOT_BOUND'); end if;
  if t.auth_user_id is null then update public.pos_terminals set auth_user_id=auth.uid(),authenticated_at=now(),updated_at=now() where id=t.id returning * into t; end if;
  select * into b from public.branches where id=t.branch_id; select * into co from public.companies where id=t.company_id;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
  if b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
  if co.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalName',t.name,'terminalType',t.terminal_type,'branchId',b.id,'branchCode',b.code,'branchName',b.name,'companyId',co.id,'companyCode',co.code,'companyName',co.name,'lockStatus',t.lock_status);
end $$;
revoke all on function public.resolve_authenticated_terminal(text) from public, anon;
grant execute on function public.resolve_authenticated_terminal(text) to authenticated;

-- Staff must be in the terminal's tenant/outlet and satisfy terminal access mode.
create or replace function public.verify_authenticated_terminal_staff_pin(p_staff_id uuid, p_pin text)
returns jsonb language plpgsql security definer set search_path=public, extensions
as $$
declare t public.pos_terminals; st public.staff; pc public.staff_pin_credentials_v2; attempts smallint; allowed boolean;
begin
  if p_pin !~ '^[0-9]{6}$' then return jsonb_build_object('ok',false,'code','INVALID_PIN'); end if;
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then return jsonb_build_object('ok',false,'code','TERMINAL_UNAVAILABLE'); end if;
  select * into st from public.staff where id=p_staff_id and active and company_id=t.company_id and branch_id=t.branch_id;
  if not found then return jsonb_build_object('ok',false,'code','STAFF_ACCESS_DENIED'); end if;
  allowed := t.access_mode='ALL_BRANCH_STAFF' or (t.access_mode='ROLE_RESTRICTED' and exists(select 1 from public.roles r where r.id=st.role_id and r.name=any(t.allowed_roles))) or exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id);
  if not allowed then return jsonb_build_object('ok',false,'code','STAFF_TERMINAL_ACCESS_DENIED'); end if;
  select * into pc from public.staff_pin_credentials_v2 where staff_id=st.id for update;
  if not found or pc.status='SETUP_REQUIRED' or pc.pin_hash is null then return jsonb_build_object('ok',false,'code','PIN_SETUP_REQUIRED'); end if;
  if pc.locked_until is not null and pc.locked_until>now() then return jsonb_build_object('ok',false,'code','PIN_LOCKED'); end if;
  if pc.pin_hash <> crypt(p_pin,pc.pin_hash) then
    attempts:=least(pc.failed_attempts+1,20); update public.staff_pin_credentials_v2 set failed_attempts=attempts,locked_until=case when attempts>=5 then now()+interval '5 minutes' else null end where staff_id=st.id;
    perform public.write_pos_audit('STAFF_PIN_LOGIN_FAILED','STAFF',st.id,null,jsonb_build_object('terminalId',t.id,'employeeId',st.staff_code,'reason','INVALID_PIN'));
    return jsonb_build_object('ok',false,'code','INVALID_PIN');
  end if;
  update public.staff_pin_credentials_v2 set failed_attempts=0,locked_until=null where staff_id=st.id;
  perform public.write_pos_audit('STAFF_PIN_LOGIN_VERIFIED','STAFF',st.id,null,jsonb_build_object('terminalId',t.id,'employeeId',st.staff_code));
  return jsonb_build_object('ok',true,'staffId',st.id,'legacyProfileId',st.legacy_profile_id,'role',(select name from public.roles where id=st.role_id),'pinResetRequired',pc.status='TEMPORARY_RESET');
end $$;

commit;
