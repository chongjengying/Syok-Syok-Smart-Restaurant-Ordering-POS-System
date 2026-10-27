begin;

alter table public.terminal_activation_codes
  add column if not exists display_code text;

drop function if exists public.create_terminal_activation_code(uuid, boolean);

create function public.create_terminal_activation_code(
  p_terminal_id uuid,
  p_force_new boolean default false
)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  caller public.profiles; t public.pos_terminals; c public.terminal_activation_codes;
  previous jsonb; raw_code text; expiry timestamptz; had_existing boolean := false;
begin
  select * into caller from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or caller.role_name <> 'ADMIN' or not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id and company_id=caller.company_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if t.status='ACTIVE' and t.registration_status='REGISTERED' and t.auth_user_id is not null then raise exception 'TERMINAL_ALREADY_BOUND'; end if;

  select * into c from public.terminal_activation_codes
    where terminal_id=t.id and used_at is null and expires_at>now() and attempts<5
    order by created_at desc limit 1 for update;
  had_existing := found;
  if had_existing and not coalesce(p_force_new,false) and c.display_code is not null then
    return jsonb_build_object('terminalId',t.id,'terminalCode',t.terminal_code,'code',c.display_code,'expiresAt',c.expires_at,'reused',true);
  end if;

  previous := to_jsonb(t)-'device_identifier';
  update public.terminal_activation_codes set used_at=coalesce(used_at,now()), display_code=null
    where terminal_id=t.id and used_at is null;
  if t.status='ARCHIVED' or t.registration_status='REVOKED' then
    update public.pos_terminals set status='CREATED',registration_status='UNREGISTERED',device_identifier=null,auth_user_id=null,authenticated_at=null,registered_at=null,lock_status='UNLOCKED',updated_at=now()
      where id=t.id returning * into t;
    perform public.write_pos_audit_diff('TERMINAL_REOPENED_FOR_ACTIVATION','TERMINAL',t.id,null,previous,to_jsonb(t)-'device_identifier');
  end if;
  raw_code := lpad((floor(random()*1000000))::int::text,6,'0'); expiry := now()+interval '5 minutes';
  insert into public.terminal_activation_codes(terminal_id,code_hash,display_code,expires_at,created_by)
    values(t.id,crypt(raw_code,gen_salt('bf',12)),raw_code,expiry,auth.uid());
  perform public.write_pos_audit('TERMINAL_ACTIVATION_CODE_CREATED','TERMINAL',t.id,null,jsonb_build_object('expiresAt',expiry,'replaced',had_existing));
  return jsonb_build_object('terminalId',t.id,'terminalCode',t.terminal_code,'code',raw_code,'expiresAt',expiry,'reused',false);
end;
$$;

revoke all on function public.create_terminal_activation_code(uuid,boolean) from public,anon;
grant execute on function public.create_terminal_activation_code(uuid,boolean) to authenticated,service_role;

-- Do not leave an activation credential available after successful binding.
create or replace function public.activate_terminal_with_code(p_code text, p_device_identifier text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare c public.terminal_activation_codes; t public.pos_terminals; b public.branches; co public.companies; normalized text:=upper(btrim(coalesce(p_code,'')));
begin
  if length(coalesce(p_device_identifier,''))<32 or normalized !~ '^[0-9]{6}$' then raise exception 'INVALID_ACTIVATION_REQUEST'; end if;
  select * into c from public.terminal_activation_codes where used_at is null and expires_at>now() and attempts<5 and code_hash=crypt(normalized,code_hash) order by created_at desc limit 1 for update;
  if not found then
    if exists(select 1 from public.terminal_activation_codes x where x.code_hash=crypt(normalized,x.code_hash) and x.used_at is not null) then raise exception 'ACTIVATION_CODE_ALREADY_USED'; end if;
    update public.terminal_activation_codes set attempts=least(attempts+1,5) where used_at is null and expires_at>now() and attempts<5;
    raise exception 'INVALID_ACTIVATION_CODE';
  end if;
  select * into t from public.pos_terminals where id=c.terminal_id for update;
  if t.status<>'CREATED' or t.registration_status<>'UNREGISTERED' then raise exception 'TERMINAL_NOT_PENDING'; end if;
  if t.auth_user_id is not null or t.device_identifier is not null then raise exception 'TERMINAL_ALREADY_BOUND'; end if;
  select * into b from public.branches where id=t.branch_id; select * into co from public.companies where id=t.company_id;
  if b.status<>'ACTIVE' or co.status<>'ACTIVE' then raise exception 'COMPANY_OR_OUTLET_INACTIVE'; end if;
  update public.pos_terminals set device_identifier=p_device_identifier,registration_status='REGISTERED',status='ACTIVE',lock_status='UNLOCKED',registered_at=now(),authenticated_at=null,updated_at=now() where id=t.id;
  update public.terminal_activation_codes set used_at=now(),display_code=null where id=c.id;
  perform public.write_pos_audit('TERMINAL_ACTIVATED','TERMINAL',t.id,null,jsonb_build_object('terminalCode',t.terminal_code,'deviceFirst',true));
  return jsonb_build_object('ok',true,'terminalId',t.id,'terminalCode',t.terminal_code,'activatedAt',now(),'status','ACTIVE','registrationStatus','REGISTERED','company',jsonb_build_object('id',co.id,'code',co.code,'name',co.name),'outlet',jsonb_build_object('id',b.id,'code',b.code,'name',b.name),'terminal',jsonb_build_object('id',t.id,'code',t.terminal_code,'name',t.name,'type',t.terminal_type,'status','ACTIVE'));
end;
$$;

revoke all on function public.activate_terminal_with_code(text,text) from public;
grant execute on function public.activate_terminal_with_code(text,text) to anon,authenticated;

commit;
