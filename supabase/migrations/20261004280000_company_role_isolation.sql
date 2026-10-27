begin;

alter table public.permissions
  add column scope text not null default 'COMPANY_ASSIGNABLE' check(scope in ('COMPANY_ASSIGNABLE','PLATFORM_ONLY','INTERNAL_ONLY')),
  add column system_managed boolean not null default true,
  add column is_active boolean not null default true;
update public.permissions set scope='PLATFORM_ONLY' where code='backup.verify';
insert into public.permissions(code,module,description,scope) values
 ('platform.company.manage','platform','Manage platform companies','PLATFORM_ONLY'),
 ('system.permission.manage','platform','Manage permission definitions','PLATFORM_ONLY'),
 ('global.role.manage','platform','Manage system role templates','PLATFORM_ONLY'),
 ('tenant.impersonate','platform','Impersonate a tenant','INTERNAL_ONLY'),
 ('system.configuration','platform','Manage platform configuration','PLATFORM_ONLY');

alter table public.roles drop constraint roles_name_key;
alter table public.roles
  add column company_id uuid references public.companies(id) on delete restrict,
  add column scope text not null default 'SYSTEM' check(scope in ('SYSTEM','COMPANY')),
  add column source_template_id uuid references public.roles(id) on delete restrict,
  add column is_builtin boolean not null default true,
  add column is_system_locked boolean not null default true,
  add constraint role_scope_owner_check check((scope='SYSTEM' and company_id is null and is_system_locked) or (scope='COMPANY' and company_id is not null)),
  add constraint company_role_name_unique unique(company_id,name),
  add constraint company_role_identity_unique unique(company_id,id);
create unique index system_role_name_unique on public.roles(name) where scope='SYSTEM';
create index role_template_reference_idx on public.roles(source_template_id);

-- Platform membership is independent of editable company permissions.
create table public.platform_administrators(
  user_id uuid primary key references auth.users(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.platform_administrators enable row level security;
revoke all on public.platform_administrators from public,anon,authenticated;
create function public.is_platform_administrator() returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.platform_administrators where user_id=auth.uid() and is_active)
$$;
revoke all on function public.is_platform_administrator() from public,anon;
grant execute on function public.is_platform_administrator() to authenticated;

create function public.seed_company_roles(p_company_id uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
 insert into public.roles(name,description,is_active,company_id,scope,source_template_id,is_builtin,is_system_locked)
 select name,description,is_active,p_company_id,'COMPANY',id,true,name in ('TERMINAL_SETUP','PENDING')
 from public.roles where scope='SYSTEM'
 on conflict(company_id,name) do nothing;
 insert into public.role_permissions(role_id,permission_id)
 select owned.id,rp.permission_id from public.roles owned
 join public.role_permissions rp on rp.role_id=owned.source_template_id
 join public.permissions p on p.id=rp.permission_id and p.scope='COMPANY_ASSIGNABLE' and p.is_active
 where owned.company_id=p_company_id on conflict do nothing;
end $$;
revoke all on function public.seed_company_roles(uuid) from public,anon,authenticated;
do $$ declare c record; begin
 for c in select id from public.companies loop perform public.seed_company_roles(c.id); end loop;
 if exists(select 1 from public.profiles where company_id is null and role_id is not null)
 then raise exception 'ROLE_MIGRATION_PROFILE_COMPANY_REQUIRED'; end if;
end $$;

-- Synchronization must resolve names within the target company, never globally.
create or replace function public.sync_profile_role_name_and_id() returns trigger
language plpgsql security definer set search_path=public as $$
declare r public.roles;
begin
 if new.company_id is null then
   new.company_id:=coalesce((select company_id from public.branches where id=new.branch_id),
    (select id from public.companies where status='ACTIVE' order by created_at,id limit 1));
 end if;
 if tg_op='UPDATE' and new.role_name is distinct from old.role_name or new.role_id is null then
   select * into r from public.roles where company_id=new.company_id and name=upper(btrim(new.role_name));
 else
   select * into r from public.roles where id=new.role_id;
   if r.scope='SYSTEM' then
     select * into r from public.roles where company_id=new.company_id and source_template_id=new.role_id;
   end if;
 end if;
 if r.id is null or r.company_id is distinct from new.company_id or r.scope<>'COMPANY'
 then raise exception 'ROLE_COMPANY_MISMATCH'; end if;
 new.role_id:=r.id; new.role_name:=r.name; return new;
end $$;

-- Preserve financial/audit rows; only live identity references move to owned copies.
update public.profiles p set role_id=r.id
from public.roles r where r.company_id=p.company_id and r.source_template_id=p.role_id;
update public.staff s set role_id=r.id
from public.roles r where r.company_id=s.company_id and r.source_template_id=s.role_id;
alter table public.profiles add constraint profile_company_role_fk
 foreign key(company_id,role_id) references public.roles(company_id,id) on delete restrict;
alter table public.staff add constraint staff_company_role_fk
 foreign key(company_id,role_id) references public.roles(company_id,id) on delete restrict;

create function public.seed_new_company_roles() returns trigger
language plpgsql security definer set search_path=public as $$
begin perform public.seed_company_roles(new.id); return new; end $$;
create trigger company_role_defaults after insert on public.companies
for each row execute function public.seed_new_company_roles();
revoke all on function public.seed_new_company_roles() from public,anon,authenticated;

create or replace function public.get_my_permissions() returns text[]
language sql stable security definer set search_path=public as $$
 with context as (select public.current_terminal_staff_session() as session), identity as (
  select st.role_id,st.company_id from context ctx join public.staff st on st.id=(ctx.session).staff_record_id and st.active
  union all
  select p.role_id,p.company_id from public.profiles p,context ctx
  where (ctx.session).id is null and p.id=auth.uid() and p.status='ACTIVE'
   and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
 )
 select coalesce(array_agg(distinct pm.code order by pm.code),'{}'::text[])
 from identity i join public.companies c on c.id=i.company_id and c.status='ACTIVE'
 join public.roles r on r.id=i.role_id and r.company_id=i.company_id and r.scope='COMPANY' and r.is_active
 join public.role_permissions rp on rp.role_id=r.id
 join public.permissions pm on pm.id=rp.permission_id and pm.is_active and pm.scope='COMPANY_ASSIGNABLE'
$$;
create or replace function public.current_pos_role() returns text
language sql stable security definer set search_path=public as $$
 select r.name from public.current_terminal_staff_session() s
 join public.staff st on st.id=s.staff_record_id and st.active
 join public.roles r on r.id=st.role_id and r.company_id=st.company_id and r.scope='COMPANY' and r.is_active
 join public.companies c on c.id=st.company_id and c.status='ACTIVE'
 union all
 select r.name from public.profiles p
 join public.roles r on r.id=p.role_id and r.company_id=p.company_id and r.scope='COMPANY' and r.is_active
 join public.companies c on c.id=p.company_id and c.status='ACTIVE'
 where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN'
 and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
 limit 1
$$;

create function public.require_company_role(p_role_id uuid) returns public.roles
language plpgsql security definer set search_path=public as $$
declare r public.roles;
begin
 if not public.has_pos_permission('role.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into r from public.roles where id=p_role_id and scope='COMPANY'
 and company_id=public.current_user_company_id() for update;
 if not found then raise exception 'ROLE_NOT_FOUND_OR_FORBIDDEN'; end if;
 if r.is_system_locked then raise exception 'ROLE_PROTECTED'; end if;
 return r;
end $$;
revoke all on function public.require_company_role(uuid) from public,anon,authenticated;

create or replace function public.set_role_permissions(p_role_id uuid,p_permission_codes text[]) returns text[]
language plpgsql security definer set search_path=public as $$
declare r public.roles; normalized text[]; previous text[];
begin
 r:=public.require_company_role(p_role_id);
 select coalesce(array_agg(distinct code order by code),'{}') into normalized from unnest(coalesce(p_permission_codes,'{}')) code;
 if exists(select 1 from unnest(normalized) code left join public.permissions p on p.code=code
  where p.id is null or p.scope<>'COMPANY_ASSIGNABLE' or not p.is_active)
 then raise exception 'PERMISSION_NOT_COMPANY_ASSIGNABLE'; end if;
 if r.name='ADMIN' and not(array['role.edit','user.assign_role','settings.view','settings.manage']<@normalized)
 then raise exception 'ADMIN_CORE_PERMISSIONS_REQUIRED'; end if;
 select coalesce(array_agg(p.code order by p.code),'{}') into previous
 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id;
 delete from public.role_permissions where role_id=r.id;
 insert into public.role_permissions(role_id,permission_id,granted_by)
 select r.id,id,auth.uid() from public.permissions where code=any(normalized);
 perform public.write_pos_audit_diff('PERMISSION_CHANGED','ROLE',r.id,null,
  jsonb_build_object('companyId',r.company_id,'permissions',previous),
  jsonb_build_object('companyId',r.company_id,'permissions',normalized,
   'added',array(select unnest(normalized) except select unnest(previous)),
   'removed',array(select unnest(previous) except select unnest(normalized))));
 return normalized;
end $$;

create or replace function public.create_admin_role(p_name text,p_description text default null) returns public.roles
language plpgsql security definer set search_path=public as $$
declare r public.roles; code text:=upper(btrim(coalesce(p_name,''))); company uuid:=public.current_user_company_id();
begin
 if company is null or not public.has_pos_permission('role.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if code !~ '^[A-Z][A-Z0-9_]{1,49}$' or length(coalesce(p_description,''))>500 then raise exception 'INVALID_ROLE_NAME'; end if;
 insert into public.roles(name,description,company_id,scope,is_builtin,is_system_locked)
 values(code,nullif(btrim(p_description),''),company,'COMPANY',false,false) returning * into r;
 perform public.write_pos_audit_diff('ROLE_CREATED','ROLE',r.id,null,null,to_jsonb(r)); return r;
exception when unique_violation then raise exception 'ROLE_ALREADY_EXISTS'; end $$;

create function public.set_company_role_active(p_role_id uuid,p_active boolean) returns public.roles
language plpgsql security definer set search_path=public as $$
declare previous public.roles; r public.roles;
begin
 previous:=public.require_company_role(p_role_id);
 if previous.name='ADMIN' then raise exception 'ROLE_PROTECTED'; end if;
 update public.roles set is_active=p_active,updated_at=now() where id=previous.id returning * into r;
 if not p_active then
  update public.terminal_staff_sessions ss set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now()
  from public.staff st where st.id=ss.staff_record_id and st.role_id=r.id and ss.status in ('ACTIVE','LOCKED');
 end if;
 perform public.write_pos_audit_diff(case when p_active then 'ROLE_ACTIVATED' else 'ROLE_DEACTIVATED' end,'ROLE',r.id,null,to_jsonb(previous),to_jsonb(r));
 return r;
end $$;
revoke all on function public.set_company_role_active(uuid,boolean) from public,anon,authenticated;
create or replace function public.activate_admin_role(p_role_id uuid) returns public.roles
language sql security definer set search_path=public as $$ select public.set_company_role_active(p_role_id,true) $$;
create or replace function public.deactivate_admin_role(p_role_id uuid) returns public.roles
language sql security definer set search_path=public as $$ select public.set_company_role_active(p_role_id,false) $$;

-- Preserve the existing return contract while limiting directory/counts to the tenant.
create or replace function public.list_admin_roles_with_counts()
returns table(id uuid,name varchar,description text,created_at timestamptz,updated_at timestamptz,staff_count bigint,permission_count bigint,is_active boolean)
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.has_pos_permission('role.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 return query select r.id,r.name,r.description,r.created_at,r.updated_at,
  (select count(*) from public.staff s where s.role_id=r.id and s.company_id=r.company_id),
  (select count(*) from public.role_permissions rp where rp.role_id=r.id),r.is_active
 from public.roles r where r.company_id=public.current_user_company_id() and r.scope='COMPANY'
 and not r.is_system_locked order by case r.name when 'ADMIN' then 0 when 'MANAGER' then 1 else 2 end,r.name;
end $$;

-- Scope old role-name based entry points without duplicating their business logic.
do $patch$ declare d text; begin
 select pg_get_functiondef('public.handle_new_user()'::regprocedure) into d;
 d:=replace(d, $$where name = 'WAITER'$$, $$where name = 'WAITER' and scope='SYSTEM'$$); execute d;
 select pg_get_functiondef('public.admin_update_staff(uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'where name=requested_role','where name=requested_role and company_id=target.company_id and scope=''COMPANY'' and is_active'); execute d;
 select pg_get_functiondef('public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[])'::regprocedure) into d;
 d:=replace(d,'where name=upper(btrim(p_role))','where name=upper(btrim(p_role)) and company_id=actor.company_id and scope=''COMPANY'' and is_active');
 d:=replace(d,'  update public.profiles','  perform set_config(''app.admin_profile_write'',''allowed'',true);
  update public.profiles'); execute d;
 select pg_get_functiondef('public.create_admin_staff_record(uuid,text,text,text,text,text,text,uuid[],text,text)'::regprocedure) into d;
 d:=replace(d,'where name=upper(trim(p_role))','where name=upper(trim(p_role)) and company_id=branch_row.company_id and scope=''COMPANY'' and is_active'); execute d;
 select pg_get_functiondef('public.provision_terminal_staff(text,text,text,text,text)'::regprocedure) into d;
 d:=replace(d,'where name=upper(trim(p_role))','where name=upper(trim(p_role)) and company_id=branch_row.company_id and scope=''COMPANY'' and is_active'); execute d;
end $patch$;

-- Identity ownership cannot be changed using the self-service profile endpoint.
create or replace function public.guard_profile_privilege_fields() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if current_setting('app.admin_profile_write',true) is distinct from 'allowed' and auth.uid() is not null and (
  new.id is distinct from old.id or new.company_id is distinct from old.company_id or new.role_id is distinct from old.role_id
  or new.role_name is distinct from old.role_name or new.email is distinct from old.email or new.password_hash is distinct from old.password_hash
  or new.status is distinct from old.status or new.login_attempt is distinct from old.login_attempt or new.created_at is distinct from old.created_at
  or new.branch_id is distinct from old.branch_id or new.default_branch_id is distinct from old.default_branch_id
 ) then raise exception 'PROTECTED_PROFILE_FIELD'; end if;
 return new;
end $$;
revoke update on public.profiles from authenticated;
grant update(name,username,phone) on public.profiles to authenticated;

-- Restrictive policies compose with existing permission policies.
create policy company_owned_roles on public.roles as restrictive for all to authenticated
 using(scope='COMPANY' and company_id=public.current_user_company_id())
 with check(scope='COMPANY' and company_id=public.current_user_company_id());
create policy company_owned_role_permissions on public.role_permissions as restrictive for all to authenticated
 using(exists(select 1 from public.roles r where r.id=role_id and r.scope='COMPANY' and r.company_id=public.current_user_company_id()))
 with check(exists(select 1 from public.roles r where r.id=role_id and r.scope='COMPANY' and r.company_id=public.current_user_company_id()));
create policy company_assignable_permission_definitions on public.permissions as restrictive for select to authenticated
 using(scope='COMPANY_ASSIGNABLE' and is_active);
revoke insert,update,delete on public.roles,public.role_permissions,public.permissions from public,anon,authenticated;

create function public.guard_role_ownership() returns trigger
language plpgsql set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'ROLE_DELETE_FORBIDDEN'; end if;
 if new.company_id is distinct from old.company_id or new.scope is distinct from old.scope
 or new.source_template_id is distinct from old.source_template_id or new.name is distinct from old.name
 or new.is_system_locked is distinct from old.is_system_locked or new.is_builtin is distinct from old.is_builtin
 then raise exception 'ROLE_IDENTITY_IMMUTABLE'; end if;
 if old.scope='SYSTEM' and current_setting('role',true)='authenticated' and not public.is_platform_administrator()
 then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
 return new;
end $$;
create trigger role_identity_immutable before update or delete on public.roles for each row execute function public.guard_role_ownership();
create function public.guard_role_permission_scope() returns trigger
language plpgsql set search_path=public as $$
declare r public.roles; p public.permissions;
begin
 select * into r from public.roles where id=new.role_id;
 select * into p from public.permissions where id=new.permission_id;
 if r.scope='COMPANY' and (p.scope<>'COMPANY_ASSIGNABLE' or not p.is_active)
 then raise exception 'PERMISSION_NOT_COMPANY_ASSIGNABLE'; end if;
 return new;
end $$;
create trigger role_permission_allowlist before insert or update on public.role_permissions for each row execute function public.guard_role_permission_scope();
revoke all on function public.guard_role_ownership(),public.guard_role_permission_scope() from public,anon,authenticated;

create function public.set_system_template_permissions(p_role_id uuid,p_permission_codes text[]) returns void
language plpgsql security definer set search_path=public as $$
declare r public.roles; previous jsonb; next_codes text[]:=coalesce(p_permission_codes,'{}');
begin
 if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
 select * into r from public.roles where id=p_role_id and scope='SYSTEM' for update;
 if not found then raise exception 'SYSTEM_TEMPLATE_NOT_FOUND'; end if;
 if exists(select 1 from unnest(next_codes) code left join public.permissions p on p.code=code where p.id is null or not p.is_active)
 then raise exception 'INVALID_PERMISSION'; end if;
 select to_jsonb(array_agg(p.code order by p.code)) into previous from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id;
 delete from public.role_permissions where role_id=r.id;
 insert into public.role_permissions(role_id,permission_id,granted_by) select r.id,id,auth.uid() from public.permissions where code=any(next_codes);
 perform public.write_pos_audit_diff('SYSTEM_TEMPLATE_PERMISSIONS_CHANGED','ROLE',r.id,null,previous,to_jsonb(next_codes));
end $$;
create function public.set_system_permission_active(p_permission_id uuid,p_active boolean) returns void
language plpgsql security definer set search_path=public as $$
declare previous public.permissions; next_row public.permissions;
begin
 if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
 select * into previous from public.permissions where id=p_permission_id for update;
 if not found then raise exception 'PERMISSION_NOT_FOUND'; end if;
 update public.permissions set is_active=p_active where id=p_permission_id returning * into next_row;
 perform public.write_pos_audit_diff('SYSTEM_PERMISSION_CHANGED','PERMISSION',p_permission_id,null,to_jsonb(previous),to_jsonb(next_row));
end $$;
revoke all on function public.set_system_template_permissions(uuid,text[]),public.set_system_permission_active(uuid,boolean) from public,anon;
grant execute on function public.set_system_template_permissions(uuid,text[]),public.set_system_permission_active(uuid,boolean) to authenticated;

commit;
