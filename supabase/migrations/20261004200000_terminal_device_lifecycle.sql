begin;

create function public.manage_terminal_device(p_terminal_id uuid,p_action text,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; action text:=upper(btrim(p_action)); previous jsonb; result jsonb;
begin
 if action not in ('UNBIND','REVOKE','REPLACE','REACTIVATE') then raise exception 'INVALID_TERMINAL_ACTION'; end if;
 select * into t from public.pos_terminals where id=p_terminal_id for update;
 if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
 if not public.can_access_branch(t.branch_id) or t.company_id is distinct from public.current_user_company_id()
 or not public.has_pos_permission(case when action in ('UNBIND','REVOKE','REPLACE') then 'terminal.deactivate' else 'terminal.update' end)
 then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if t.status in ('RETIRED','ARCHIVED') then raise exception 'TERMINAL_RETIRED'; end if;
 if action<>'REVOKE' and exists(select 1 from public.cashier_shifts where terminal_id=t.id and status='OPEN') then raise exception 'ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED'; end if;
 if action='REACTIVATE' and exists(select 1 from public.terminal_device_assignments where terminal_id=t.id and status='ACTIVE') then raise exception 'TERMINAL_ALREADY_BOUND'; end if;
 if action='REPLACE' and not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 previous:=to_jsonb(t)-'device_identifier';
 update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
 update public.terminal_device_assignments set status='REVOKED',revoked_at=coalesce(revoked_at,now()),revoked_by=auth.uid(),revoke_reason=coalesce(nullif(btrim(p_reason),''),action) where terminal_id=t.id and status='ACTIVE';
 update public.terminal_activation_codes set used_at=coalesce(used_at,now()),display_code=null where terminal_id=t.id and used_at is null;
 update public.pos_terminals set device_identifier=null,auth_user_id=null,authenticated_at=null,registered_at=null,
 registration_status=case when action='REVOKE' then 'REVOKED' else 'UNREGISTERED' end,
 status=case when action='REVOKE' then 'INACTIVE' else 'ACTIVE' end,
 lock_status=case when action='REVOKE' then 'LOCKED' else 'UNLOCKED' end,updated_at=now() where id=t.id returning * into t;
 perform public.write_pos_audit_diff('TERMINAL_DEVICE_'||case action when 'UNBIND' then 'UNBOUND' when 'REVOKE' then 'REVOKED' when 'REPLACE' then 'REPLACED' else 'REACTIVATED' end,'TERMINAL',t.id,p_reason,previous,to_jsonb(t)-'device_identifier');
 result:=jsonb_build_object('terminalId',t.id,'status',t.status,'registrationStatus',t.registration_status);
 if action in ('REPLACE','REACTIVATE') then result:=result||public.create_terminal_activation_code(t.id,true); end if;
 return result;
end $$;

create or replace function public.reset_pos_device(p_terminal_id uuid) returns public.pos_terminals
language plpgsql security definer set search_path=public as $$
begin perform public.manage_terminal_device(p_terminal_id,'UNBIND',null); return (select t from public.pos_terminals t where id=p_terminal_id); end $$;

-- Keep the established API, but route security revocation through the same atomic lifecycle.
do $$ declare definition text; begin
 select pg_get_functiondef('public.transition_pos_terminal(uuid,text,text)'::regprocedure) into definition;
 definition:=replace(definition,'  if action=''REVOKE'' then','  if action=''REVOKE'' then
    perform public.manage_terminal_device(t.id,''REVOKE'',p_device_identifier);
    return (select pt from public.pos_terminals pt where pt.id=t.id);');
 execute definition;
 select pg_get_functiondef('public.create_terminal_activation_code(uuid,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'caller.role_name <> ''ADMIN'' or ','');
 definition:=replace(definition,'perform public.assert_branch_operational(t.branch_id,t.company_id);','perform public.assert_branch_operational(t.branch_id,t.company_id);
  if not public.can_access_branch(t.branch_id) then raise exception ''INSUFFICIENT_PERMISSION''; end if;
  if exists(select 1 from public.cashier_shifts where terminal_id=t.id and status=''OPEN'') then raise exception ''ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED''; end if;');
 definition:=replace(definition,'(floor(random()*1000000))::int::text','(((get_byte(gen_random_bytes(4),0)::bigint<<24)+(get_byte(gen_random_bytes(4),1)::bigint<<16)+(get_byte(gen_random_bytes(4),2)::bigint<<8)+get_byte(gen_random_bytes(4),3)) % 1000000)::text');
 definition:=replace(definition,'if t.status=''ACTIVE'' and t.registration_status=''REGISTERED'' and','if t.registration_status=''REGISTERED'' and');
 execute definition;
 select pg_get_functiondef('public.activate_terminal_with_code(text,text)'::regprocedure) into definition;
 definition:=replace(definition,'if length(p_device_identifier)<32','if p_device_identifier is null or length(p_device_identifier)>256 or length(p_device_identifier)<32');
 definition:=replace(definition,'select * into b from public.branches where id=t.branch_id;','if exists(select 1 from public.cashier_shifts where terminal_id=t.id and status=''OPEN'') then raise exception ''ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED''; end if;
  select * into b from public.branches where id=t.branch_id;');
 definition:=replace(definition,'  if found then
    update public.terminal_staff_sessions','  if found then
    raise exception ''DEVICE_ALREADY_BOUND'';
    update public.terminal_staff_sessions');
 definition:=replace(definition,'set used_at=now() where id=c.id','set used_at=now(),display_code=null where id=c.id');
 execute definition;
end $$;

create or replace function public.activate_terminal_with_code(p_code text,p_device_identifier text,p_device_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb; terminal_id uuid; credential text; safe_name text;
begin
 if auth.uid() is null then return jsonb_build_object('ok',false,'code','DEVICE_AUTHENTICATION_REQUIRED'); end if;
 if not public.consume_api_rate_limit(auth.uid()::text,'terminal.activate',5,60)
 or not public.consume_api_rate_limit('terminal-activation-global','terminal.activate',100,60)
 then return jsonb_build_object('ok',false,'code','ACTIVATION_RATE_LIMITED'); end if;
 begin
  result:=public.activate_terminal_with_code(p_code,p_device_identifier);
  terminal_id:=(result->>'terminalId')::uuid;
  credential:=encode(extensions.gen_random_bytes(32),'hex');
  safe_name:=nullif(left(btrim(regexp_replace(coalesce(p_device_name,''),'[[:cntrl:]]','','g')),120),'');
  update public.terminal_device_assignments d set credential_hash=encode(extensions.digest(credential,'sha256'),'hex'),device_name=safe_name where d.terminal_id=terminal_id and d.status='ACTIVE';
  if not found then raise exception 'DEVICE_ASSIGNMENT_MISSING'; end if;
  return result||jsonb_build_object('terminalCredential',credential,'deviceName',safe_name);
 exception when others then
  if sqlerrm in ('INVALID_ACTIVATION_CODE','INVALID_ACTIVATION_REQUEST','TERMINAL_ALREADY_BOUND','DEVICE_ALREADY_BOUND','COMPANY_INACTIVE','BRANCH_INACTIVE','TERMINAL_RETIRED','ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED') then
   return jsonb_build_object('ok',false,'code',sqlerrm);
  end if;
  raise;
 end;
end $$;

revoke all on function public.activate_terminal_with_code(text,text),public.activate_terminal_with_code(text,text,text),public.manage_terminal_device(uuid,text,text) from public,anon,authenticated;
grant execute on function public.activate_terminal_with_code(text,text,text),public.manage_terminal_device(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
