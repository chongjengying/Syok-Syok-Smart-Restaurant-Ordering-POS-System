begin;
alter table public.companies add column if not exists phone text, add column if not exists email text, add column if not exists address text;
alter table public.branches add column if not exists registration_no text, add column if not exists phone text, add column if not exists email text, add column if not exists address text, add column if not exists currency_code char(3), add column if not exists timezone text, add column if not exists updated_at timestamptz not null default now(), add column if not exists configuration jsonb not null default '{}', add column if not exists revision bigint not null default 1;
alter table public.branches alter column company_id set not null;
alter table public.branches add constraint branch_configuration_object check(jsonb_typeof(configuration)='object');
update public.pos_terminals t set company_id=b.company_id from public.branches b where b.id=t.branch_id;
alter table public.pos_terminals alter column company_id set not null;
create unique index if not exists branches_id_company_key on public.branches(id,company_id);
alter table public.pos_terminals add constraint terminal_branch_company_fk foreign key(branch_id,company_id) references public.branches(id,company_id) on delete restrict;
-- Do not silently discard duplicate registrations. An ambiguous installed device
-- must be repaired explicitly before this uniqueness constraint can be installed.
create unique index if not exists terminal_registered_device_unique on public.pos_terminals(device_identifier) where device_identifier is not null and registration_status='REGISTERED';
alter table public.companies enable row level security;
revoke all on public.companies,public.pos_terminals,public.terminal_staff_sessions from public,anon,authenticated;
grant select on public.companies,public.pos_terminals,public.terminal_staff_sessions to authenticated;
grant all on public.companies,public.pos_terminals,public.terminal_staff_sessions to service_role;

create or replace function public.can_access_branch(p_branch_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='ACTIVE' and (p.role_name='ADMIN' or p.branch_id=p_branch_id));
$$;
revoke all on function public.can_access_branch(uuid) from public,anon;
grant execute on function public.can_access_branch(uuid) to authenticated;
create policy company_read on public.companies for select to authenticated using(public.has_pos_permission('company.view') or exists(select 1 from public.branches b where b.company_id=companies.id and public.can_access_branch(b.id)));
drop policy if exists active_staff_read_branches on public.branches;
create policy active_staff_read_branches on public.branches for select to authenticated using(public.can_access_branch(id));
drop policy if exists pos_terminal_view on public.pos_terminals;
drop policy if exists pos_terminal_manage on public.pos_terminals;
create policy pos_terminal_view on public.pos_terminals for select to authenticated using(public.can_access_branch(branch_id) and (public.has_pos_permission('terminal.view') or public.has_pos_permission('settings.view')));
insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.name='MANAGER' and p.code in ('branch.view','branch.update','terminal.view','terminal.create','terminal.update','terminal.deactivate') on conflict do nothing;

create or replace function public.save_company(p_payload jsonb) returns public.companies language plpgsql security definer set search_path=public as $$
declare previous public.companies; result public.companies;
begin
 if not public.has_pos_permission('company.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into previous from public.companies where id=(p_payload->>'id')::uuid for update;
 if not found then raise exception 'COMPANY_NOT_FOUND'; end if;
 if nullif(trim(p_payload->>'name'),'') is null or coalesce(p_payload->>'code','')!~'^[A-Z0-9_-]{2,30}$' or coalesce(p_payload->>'currency_code','')!~'^[A-Z]{3}$' then raise exception 'INVALID_COMPANY_INFORMATION'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
 update public.companies set name=trim(p_payload->>'name'),code=p_payload->>'code',registration_no=nullif(p_payload->>'registration_no',''),phone=nullif(p_payload->>'phone',''),email=nullif(p_payload->>'email',''),address=nullif(p_payload->>'address',''),currency_code=p_payload->>'currency_code',timezone=p_payload->>'timezone',updated_at=now() where id=previous.id returning * into result;
 perform public.write_pos_audit_diff('COMPANY_UPDATED','COMPANY',result.id,null,to_jsonb(previous),to_jsonb(result));
 return result;
end $$;

create or replace function public.save_branch(p_id uuid,p_payload jsonb,p_expected_revision bigint default null) returns public.branches language plpgsql security definer set search_path=public as $$
declare previous public.branches; result public.branches; company uuid;
begin
 if p_id is null then
  if not public.has_pos_permission('branch.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select id into company from public.companies where status='ACTIVE' order by created_at limit 1;
 else
  if not public.has_pos_permission('branch.update') or not public.can_access_branch(p_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into previous from public.branches where id=p_id for update;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if p_expected_revision is distinct from previous.revision then raise exception 'CONFIGURATION_CHANGED'; end if;
  company:=previous.company_id;
  if p_payload->>'status' is distinct from previous.status and not public.has_pos_permission('branch.deactivate') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 end if;
 if nullif(trim(p_payload->>'name'),'') is null or coalesce(p_payload->>'code','')!~'^[A-Z0-9_-]{2,30}$' then raise exception 'INVALID_BRANCH_INFORMATION'; end if;
 if nullif(p_payload->>'currency_code','') is not null and p_payload->>'currency_code'!~'^[A-Z]{3}$' then raise exception 'INVALID_CURRENCY'; end if;
 if nullif(p_payload->>'timezone','') is not null and not exists(select 1 from pg_timezone_names where name=p_payload->>'timezone') then raise exception 'INVALID_TIMEZONE'; end if;
 insert into public.branches(id,company_id,code,name,status,registration_no,phone,email,address,currency_code,timezone)
 values(coalesce(p_id,gen_random_uuid()),company,p_payload->>'code',trim(p_payload->>'name'),coalesce(p_payload->>'status','INACTIVE'),nullif(p_payload->>'registration_no',''),nullif(p_payload->>'phone',''),nullif(p_payload->>'email',''),nullif(p_payload->>'address',''),nullif(p_payload->>'currency_code',''),nullif(p_payload->>'timezone',''))
 on conflict(id) do update set code=excluded.code,name=excluded.name,status=excluded.status,registration_no=excluded.registration_no,phone=excluded.phone,email=excluded.email,address=excluded.address,currency_code=excluded.currency_code,timezone=excluded.timezone,updated_at=now(),revision=branches.revision+1 returning * into result;
 perform public.write_pos_audit_diff(case when p_id is null then 'BRANCH_CREATED' when previous.status is distinct from result.status then 'BRANCH_'||result.status else 'BRANCH_UPDATED' end,'BRANCH',result.id,null,to_jsonb(previous),to_jsonb(result));
 return result;
end $$;

create or replace function public.save_pos_terminal(p_id uuid,p_branch_id uuid,p_code text,p_name text,p_status text default 'ACTIVE',p_type text default 'POS',p_device_identifier text default null) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare previous public.pos_terminals; result public.pos_terminals; b public.branches;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission(case when p_id is null then 'terminal.create' else 'terminal.update' end) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id;
 if not found then raise exception 'INVALID_BRANCH'; end if;
 if p_id is not null then
  select * into previous from public.pos_terminals where id=p_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if previous.branch_id<>p_branch_id or previous.terminal_code<>upper(trim(p_code)) then raise exception 'TERMINAL_IDENTITY_IMMUTABLE'; end if;
 end if;
 if nullif(trim(p_name),'') is null or upper(trim(p_code))!~'^[A-Z0-9_-]{2,40}$' or p_type not in ('POS','KDS') then raise exception 'INVALID_TERMINAL'; end if;
 insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status)
 values(coalesce(p_id,gen_random_uuid()),b.company_id,b.id,upper(trim(p_code)),trim(p_name),'CREATED',p_type,'UNREGISTERED')
 on conflict(id) do update set name=excluded.name,terminal_type=excluded.terminal_type,updated_at=now() returning * into result;
 perform public.write_pos_audit_diff(case when p_id is null then 'TERMINAL_CREATED' else 'TERMINAL_UPDATED' end,'TERMINAL',result.id,null,to_jsonb(previous)-'device_identifier',to_jsonb(result)-'device_identifier');
 return result;
end $$;
create or replace function public.transition_pos_terminal(p_terminal_id uuid,p_action text,p_device_identifier text default null) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; previous jsonb; action text:=upper(trim(p_action));
begin
 select * into t from public.pos_terminals where id=p_terminal_id for update;
 if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
 if not public.can_access_branch(t.branch_id) or not public.has_pos_permission(case when action='DEACTIVATE' then 'terminal.deactivate' else 'terminal.update' end) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 previous:=to_jsonb(t)-'device_identifier';
 if action='REGISTER' then
  if length(coalesce(p_device_identifier,''))<32 then raise exception 'INVALID_DEVICE_REGISTRATION'; end if;
  update public.pos_terminals set registration_status='REGISTERED',device_identifier=p_device_identifier,registered_at=now(),registered_by=auth.uid(),status='INACTIVE',updated_at=now() where id=t.id returning * into t;
 elsif action='ACTIVATE' then
  if t.registration_status<>'REGISTERED' or t.device_identifier is null then raise exception 'TERMINAL_NOT_REGISTERED'; end if;
  if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'BRANCH_OR_COMPANY_INACTIVE'; end if;
  update public.pos_terminals set status='ACTIVE',updated_at=now() where id=t.id returning * into t;
 elsif action='DEACTIVATE' then
  update public.pos_terminals set status='INACTIVE',updated_at=now() where id=t.id returning * into t;
 else raise exception 'INVALID_TERMINAL_ACTION'; end if;
 if action in ('DEACTIVATE','REGISTER') then update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED'); end if;
 perform public.write_pos_audit_diff('TERMINAL_'||action,'TERMINAL',t.id,null,previous,to_jsonb(t)-'device_identifier');
 return t;
end $$;
-- Remove broad/default execute grants left by the prototype.
revoke all on function public.save_company(jsonb),public.save_branch(uuid,jsonb,bigint),public.save_pos_terminal(uuid,uuid,text,text,text,text,text),public.transition_pos_terminal(uuid,text,text) from public,anon;
grant execute on function public.save_company(jsonb),public.save_branch(uuid,jsonb,bigint),public.save_pos_terminal(uuid,uuid,text,text,text,text,text),public.transition_pos_terminal(uuid,text,text) to authenticated;
do $$ begin if to_regprocedure('public.create_branch(text,text,uuid)') is not null then revoke all on function public.create_branch(text,text,uuid) from public,anon,authenticated; end if; end $$;
commit;
