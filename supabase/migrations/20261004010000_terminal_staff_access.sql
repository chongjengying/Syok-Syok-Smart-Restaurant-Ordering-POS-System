begin;

create or replace function public.staff_record_has_branch(p_staff_id uuid,p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.staff st
    join public.profiles p on p.id=st.legacy_profile_id and p.status='ACTIVE'
    join public.staff_branch_assignments a on a.staff_id=p.id and a.status='ACTIVE'
    join public.branches b on b.id=a.branch_id and b.status='ACTIVE'
    join public.companies c on c.id=b.company_id and c.status='ACTIVE'
    where st.id=p_staff_id and st.active and a.branch_id=p_branch_id
      and st.company_id=b.company_id and p.company_id=b.company_id);
$$;

-- Preserve legacy restrictions as explicit selections, without granting new access.
insert into public.terminal_staff_access(terminal_id,staff_id)
select t.id,st.id from public.pos_terminals t
join public.staff st on st.company_id=t.company_id
join public.roles r on r.id=st.role_id
where t.access_mode='ROLE_RESTRICTED' and r.name=any(t.allowed_roles)
  and public.staff_record_has_branch(st.id,t.branch_id)
on conflict do nothing;
delete from public.terminal_staff_access a using public.pos_terminals t
where t.id=a.terminal_id and not public.staff_record_has_branch(a.staff_id,t.branch_id);
alter table public.pos_terminals drop constraint pos_terminals_access_mode_check;
update public.pos_terminals set access_mode='SELECTED_STAFF',allowed_roles='{}'
where access_mode in ('ROLE_RESTRICTED','STAFF_RESTRICTED');
alter table public.pos_terminals add constraint pos_terminals_access_mode_check
check(access_mode in ('ALL_BRANCH_STAFF','SELECTED_STAFF'));
alter table public.pos_terminals alter column access_mode set default 'ALL_BRANCH_STAFF';

create or replace function public.terminal_staff_access_reason(p_terminal_id uuid,p_staff_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals; st public.staff;
begin
  select * into st from public.staff where id=p_staff_id;
  if not found then return 'STAFF_NOT_FOUND'; end if;
  if not st.active or not exists(select 1 from public.profiles where id=st.legacy_profile_id and status='ACTIVE') then return 'STAFF_INACTIVE'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id;
  if not found then return 'TERMINAL_NOT_FOUND'; end if;
  if t.lock_status='LOCKED' then return 'TERMINAL_LOCKED'; end if;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then return 'TERMINAL_UNAVAILABLE'; end if;
  if not exists(select 1 from public.branches where id=t.branch_id and company_id=t.company_id and status='ACTIVE') then return 'BRANCH_INACTIVE'; end if;
  if st.company_id<>t.company_id then return 'STAFF_COMPANY_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.companies where id=t.company_id and status='ACTIVE') then return 'COMPANY_INACTIVE'; end if;
  if not public.staff_record_has_branch(st.id,t.branch_id) then return 'STAFF_OUTLET_ACCESS_DENIED'; end if;
  if t.access_mode='SELECTED_STAFF' and not exists(select 1 from public.terminal_staff_access where terminal_id=t.id and staff_id=st.id) then return 'STAFF_TERMINAL_ACCESS_DENIED'; end if;
  if t.access_mode not in ('ALL_BRANCH_STAFF','SELECTED_STAFF') then return 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  return null;
end $$;

create or replace function public.list_branch_terminal_staff(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_pos_permission('terminal.view') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',st.id,'staffCode',st.staff_code,'name',st.name,'role',r.name,'branch',b.name,'active',true) order by st.name)
    from public.staff st join public.roles r on r.id=st.role_id
    join public.branches b on b.id=p_branch_id
    where public.staff_record_has_branch(st.id,p_branch_id)),'[]'::jsonb);
end $$;

create or replace function public.get_terminal_access_configuration(p_terminal_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t public.pos_terminals; candidates jsonb;
begin
  select * into t from public.pos_terminals where id=p_terminal_id;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  candidates:=public.list_branch_terminal_staff(t.branch_id);
  return jsonb_build_object('terminalId',t.id,'branchId',t.branch_id,'accessMode',t.access_mode,'allowedRoles','[]'::jsonb,
    'staff',coalesce((select jsonb_agg(person || jsonb_build_object('selected',exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=(person->>'id')::uuid))) from jsonb_array_elements(candidates) person),'[]'::jsonb));
end $$;

create or replace function public.save_terminal_access(p_terminal_id uuid,p_access_mode text,p_allowed_roles text[],p_staff_ids uuid[])
returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; prior_mode text; prior_staff uuid[]; staff_list uuid[]; mode text:=upper(trim(p_access_mode));
begin
  if not public.has_pos_permission('terminal.update') and not (public.has_pos_permission('terminal.create') and current_setting('pos.creating_terminal',true)=p_terminal_id::text) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) or t.company_id is distinct from public.current_user_company_id() then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF','SELECTED_STAFF') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  staff_list:=array(select distinct id from unnest(coalesce(p_staff_ids,'{}'::uuid[])) id);
  if mode='SELECTED_STAFF' and cardinality(staff_list)=0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(select 1 from unnest(staff_list) id where id is null or not public.staff_record_has_branch(id,t.branch_id)) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  prior_mode:=t.access_mode;
  select coalesce(array_agg(staff_id),'{}'::uuid[]) into prior_staff from public.terminal_staff_access where terminal_id=t.id;
  if mode='ALL_BRANCH_STAFF' then staff_list:='{}'; end if;
  delete from public.terminal_staff_access where terminal_id=t.id;
  insert into public.terminal_staff_access(terminal_id,staff_id) select t.id,unnest(staff_list);
  update public.pos_terminals set access_mode=mode,allowed_roles='{}',updated_at=now() where id=t.id returning * into t;
  update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
  where terminal_id=t.id and status in ('ACTIVE','LOCKED') and public.terminal_staff_access_reason(t.id,staff_record_id) is not null;
  perform public.write_pos_audit('TERMINAL_ACCESS_UPDATED','TERMINAL',t.id,null,jsonb_build_object('branchId',t.branch_id,'previousAccessMode',prior_mode,'newAccessMode',mode,
    'staffAdded',array(select unnest(staff_list) except select unnest(prior_staff)),
    'staffRemoved',array(select unnest(prior_staff) except select unnest(staff_list))));
  return t;
end $$;

-- Keep the existing creation validations and audit behavior; replace its legacy default.
do $$ declare definition text; begin
  select pg_get_functiondef('public.save_pos_terminal(uuid,uuid,text,text,text,text,text)'::regprocedure) into definition;
  definition:=replace(definition,'''ROLE_RESTRICTED''','''ALL_BRANCH_STAFF''');
  execute definition;
end $$;

create or replace function public.save_terminal_with_access(p_id uuid,p_branch_id uuid,p_code text,p_name text,p_type text,p_access_mode text,p_staff_ids uuid[])
returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; existing_status text;
begin
  select status into existing_status from public.pos_terminals where id=p_id;
  t:=public.save_pos_terminal(p_id,p_branch_id,p_code,p_name,coalesce(existing_status,'CREATED'),p_type,null);
  if p_id is null then perform set_config('pos.creating_terminal',t.id::text,true); end if;
  t:=public.save_terminal_access(t.id,p_access_mode,'{}',p_staff_ids);
  perform set_config('pos.creating_terminal','',true);
  return t;
end $$;

-- Reuse PIN hashing, lockout, and audit logic after the shared access validation.
do $$ declare definition text; start_at integer; end_at integer; begin
  select pg_get_functiondef('public.verify_authenticated_terminal_staff_pin(uuid,text)'::regprocedure) into definition;
  start_at:=strpos(definition,'  if p_pin !~');
  end_at:=strpos(definition,'  select * into pc');
  if start_at=0 or end_at=0 then raise exception 'PIN_FUNCTION_SHAPE_CHANGED'; end if;
  definition:=substring(definition from 1 for start_at-1) ||
    '  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  declare_access_block: declare reason text; begin
    reason:=public.terminal_staff_access_reason(t.id,p_staff_id);
    if reason is not null then return jsonb_build_object(''ok'',false,''code'',reason); end if;
  end;
  select * into st from public.staff where id=p_staff_id for update;
  if p_pin is null or p_pin !~ ''^[0-9]{6}$'' then return jsonb_build_object(''ok'',false,''code'',''INVALID_PIN''); end if;
' || substring(definition from end_at);
  -- Nested PL/pgSQL blocks use labels enclosed in angle brackets.
  definition:=replace(definition,'declare_access_block: declare','<<declare_access_block>> declare');
  execute definition;
end $$;

do $$ declare definition text; start_at integer; end_at integer; begin
  select pg_get_functiondef('public.begin_authenticated_terminal_staff_session(uuid)'::regprocedure) into definition;
  start_at:=strpos(definition,'  if t.id is null');
  end_at:=strpos(definition,'  update public.terminal_staff_sessions');
  if start_at=0 or end_at=0 then raise exception 'SESSION_FUNCTION_SHAPE_CHANGED'; end if;
  definition:=substring(definition from 1 for start_at-1) ||
    '  <<access_check>> declare reason text; begin
    reason:=public.terminal_staff_access_reason(t.id,p_staff_id);
    if reason is not null then raise exception ''%'',reason; end if;
  end;
  if session_id is null then raise exception ''SESSION_EXPIRED''; end if;
' || substring(definition from end_at);
  execute definition;
end $$;

create or replace function public.login_terminal_staff(p_staff_id uuid,p_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare verification jsonb; staff_session jsonb;
begin
  verification:=public.verify_authenticated_terminal_staff_pin(p_staff_id,p_pin);
  if not coalesce((verification->>'ok')::boolean,false) then return verification; end if;
  staff_session:=public.begin_authenticated_terminal_staff_session(p_staff_id);
  return jsonb_build_object('ok',true,'staffSession',staff_session,'pinResetRequired',verification->'pinResetRequired');
end $$;
revoke execute on function public.begin_authenticated_terminal_staff_session(uuid) from authenticated;

create or replace function public.current_terminal_staff_session()
returns public.terminal_staff_sessions language sql stable security definer set search_path=public as $$
  select s from public.terminal_staff_sessions s join public.pos_terminals t on t.id=s.terminal_id
  where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and t.auth_user_id=auth.uid()
    and s.status='ACTIVE' and s.branch_id=t.branch_id and s.company_id=t.company_id
    and public.terminal_staff_access_reason(t.id,s.staff_record_id) is null;
$$;

create or replace function public.list_authenticated_terminal_staff()
returns table(id uuid,staff_code text,name text,role text,pin_status text,pin_setup_required boolean,temporary_pin_required boolean)
language sql stable security definer set search_path=public as $$
  select st.id,st.staff_code,st.name,r.name,coalesce(pc.status,'SETUP_REQUIRED'),pc.staff_id is null or pc.status='SETUP_REQUIRED',pc.status='TEMPORARY_RESET'
  from public.pos_terminals t join public.staff st on st.company_id=t.company_id
  join public.roles r on r.id=st.role_id left join public.staff_pin_credentials_v2 pc on pc.staff_id=st.id
  where t.auth_user_id=auth.uid() and public.terminal_staff_access_reason(t.id,st.id) is null order by st.name;
$$;

create or replace function public.prune_moved_terminal_staff_access()
returns trigger language plpgsql security definer set search_path=public as $$
declare removed_staff uuid[];
begin
  if new.branch_id is distinct from old.branch_id then
    select coalesce(array_agg(staff_id),'{}'::uuid[]) into removed_staff from public.terminal_staff_access
    where terminal_id=new.id and not public.staff_record_has_branch(staff_id,new.branch_id);
    delete from public.terminal_staff_access where terminal_id=new.id and staff_id=any(removed_staff);
    update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where terminal_id=new.id and status in ('ACTIVE','LOCKED');
    perform public.write_pos_audit('TERMINAL_ACCESS_REVALIDATED','TERMINAL',new.id,null,jsonb_build_object('branchId',new.branch_id,'previousBranchId',old.branch_id,'staffRemoved',removed_staff));
  end if;
  return new;
end $$;
create trigger terminal_branch_staff_revalidation after update of branch_id on public.pos_terminals
for each row execute function public.prune_moved_terminal_staff_access();

revoke all on function public.staff_record_has_branch(uuid,uuid),public.terminal_staff_access_reason(uuid,uuid),public.list_branch_terminal_staff(uuid),public.save_terminal_with_access(uuid,uuid,text,text,text,text,uuid[]),public.login_terminal_staff(uuid,text),public.prune_moved_terminal_staff_access() from public,anon;
grant execute on function public.list_branch_terminal_staff(uuid),public.save_terminal_with_access(uuid,uuid,text,text,text,text,uuid[]),public.login_terminal_staff(uuid,text) to authenticated;

commit;
