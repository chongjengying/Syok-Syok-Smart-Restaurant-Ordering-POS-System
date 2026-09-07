begin;

-- A terminal lock is an administrative state, not merely a visual overlay.
create or replace function public.can_use_terminal(p_terminal_id uuid,p_staff_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.pos_terminals t
    join public.branches b on b.id=t.branch_id and b.status='ACTIVE' and b.company_id=t.company_id
    join public.companies c on c.id=b.company_id and c.status='ACTIVE'
    join public.profiles p on p.id=p_staff_id and p.company_id=c.id and p.status='ACTIVE'
    where t.id=p_terminal_id and t.status='ACTIVE' and t.registration_status='REGISTERED'
      and coalesce(t.lock_status,'UNLOCKED')='UNLOCKED'
      and public.staff_has_branch(p.id,t.branch_id)
      and case t.access_mode
        when 'ALL_BRANCH_STAFF' then true
        when 'ROLE_RESTRICTED' then p.role_name=any(t.allowed_roles)
        when 'STAFF_RESTRICTED' then exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=p.id)
        else false
      end
  );
$$;

create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions; existing public.terminal_staff_sessions;
begin
  select * into t from public.pos_terminals where device_identifier=p_device_identifier for update;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or coalesce(t.lock_status,'UNLOCKED')<>'UNLOCKED' then raise exception 'TERMINAL_INVALID'; end if;
  if not public.can_use_terminal(t.id,p_staff_id) then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
  select * into p from public.profiles where id=p_staff_id and status='ACTIVE' and company_id=t.company_id;
  if not found or not public.staff_has_branch(p.id,t.branch_id) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
  select * into existing from public.terminal_staff_sessions where staff_id=p_staff_id and status in ('ACTIVE','LOCKED') for update;
  if found and existing.terminal_id<>t.id then raise exception 'STAFF_ALREADY_ACTIVE_ON_TERMINAL'; end if;
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions)
  values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  insert into public.audit_logs(actor_id,branch_id,action,entity_type,entity_id,metadata)
  values(p_actor,t.branch_id,'PIN_LOGIN_SUCCESS','STAFF_SESSION',s.id,jsonb_build_object('staffId',p.id,'terminalId',t.id));
  return to_jsonb(s);
end $$;

create or replace function public.list_terminal_branch_staff(p_device_identifier text)
returns table(id uuid,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals;
begin
  if not public.is_active_pos_user() then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into t from public.pos_terminals where device_identifier=p_device_identifier and status='ACTIVE' and registration_status='REGISTERED' and coalesce(lock_status,'UNLOCKED')='UNLOCKED';
  if not found then raise exception 'TERMINAL_INVALID'; end if;
  return query select p.id,p.name::text,p.role_name::text,coalesce(sc.status,'SETUP_REQUIRED'),sc.user_id is null or sc.status='SETUP_REQUIRED',sc.status='TEMPORARY_RESET'
    from public.profiles p left join public.staff_pin_credentials sc on sc.user_id=p.id
    where p.status='ACTIVE' and public.can_use_terminal(t.id,p.id)
    order by case p.role_name when 'ADMIN' then 1 when 'MANAGER' then 2 when 'WAITER' then 3 else 4 end,p.name;
end $$;

create or replace function public.resolve_registered_terminal(p_device_identifier text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches; c public.companies;
begin
  select * into t from public.pos_terminals where device_identifier=p_device_identifier;
  if not found or t.registration_status<>'REGISTERED' then return jsonb_build_object('ok',false,'code','TERMINAL_NOT_REGISTERED'); end if;
  if t.status<>'ACTIVE' or coalesce(t.lock_status,'UNLOCKED')='LOCKED' then return jsonb_build_object('ok',false,'code','TERMINAL_INACTIVE'); end if;
  select * into b from public.branches where id=t.branch_id; select * into c from public.companies where id=b.company_id;
  if b.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','BRANCH_INACTIVE'); end if;
  if c.status<>'ACTIVE' then return jsonb_build_object('ok',false,'code','COMPANY_INACTIVE'); end if;
  update public.pos_terminals set last_seen_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'companyId',c.id,'companyName',c.name,'branchId',b.id,'branchCode',b.code,'terminalId',t.id,'terminalCode',t.terminal_code,'terminalName',t.name,'terminalType',t.terminal_type,'accessMode',t.access_mode,'allowedRoles',t.allowed_roles);
end $$;

create or replace function public.lock_terminal_staff_session() returns void language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  update public.terminal_staff_sessions set status='LOCKED',last_activity_at=now()
  where auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and staff_id=auth.uid() and status='ACTIVE'
  returning * into s;
  if s.id is not null then
    insert into public.audit_logs(actor_id,branch_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),s.branch_id,'SESSION_LOCKED','STAFF_SESSION',s.id,jsonb_build_object('terminalId',s.terminal_id));
  end if;
end $$;

create or replace function public.end_terminal_staff_session() returns void language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions;
begin
  update public.terminal_staff_sessions set status='ENDED',ended_at=now()
  where auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and staff_id=auth.uid() and status in ('ACTIVE','LOCKED')
  returning * into s;
  if s.id is not null then
    insert into public.audit_logs(actor_id,branch_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),s.branch_id,'SESSION_ENDED','STAFF_SESSION',s.id,jsonb_build_object('terminalId',s.terminal_id));
  end if;
end $$;
revoke all on function public.can_use_terminal(uuid,uuid),public.begin_terminal_staff_session(uuid,uuid,text,uuid),public.list_terminal_branch_staff(text),public.resolve_registered_terminal(text),public.lock_terminal_staff_session(),public.end_terminal_staff_session() from public,anon;
grant execute on function public.can_use_terminal(uuid,uuid),public.list_terminal_branch_staff(text),public.resolve_registered_terminal(text),public.lock_terminal_staff_session(),public.end_terminal_staff_session() to authenticated;
grant execute on function public.begin_terminal_staff_session(uuid,uuid,text,uuid) to service_role;
commit;
