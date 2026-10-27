begin;

drop function if exists public.create_admin_staff_record(uuid,text,text,text,text);

create or replace function public.create_admin_staff_record(
  p_branch_id uuid,p_staff_code text,p_name text,p_role text,p_temporary_pin text,
  p_email text default null,p_phone text default null,p_additional_branch_ids uuid[] default '{}',
  p_status text default 'ACTIVE',p_pin_mode text default 'ADMIN_TEMPORARY'
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare branch_row public.branches; role_row public.roles; legacy_id uuid:=gen_random_uuid(); staff_id uuid; additional_id uuid; next_status text:=upper(coalesce(p_status,'ACTIVE')); next_pin_mode text:=upper(coalesce(p_pin_mode,'ADMIN_TEMPORARY')); created jsonb;
begin
  if next_status not in ('ACTIVE','INACTIVE') or next_pin_mode not in ('STAFF_SET','ADMIN_TEMPORARY') then raise exception 'INVALID_STAFF_INPUT'; end if;
  if p_staff_code !~ '^[A-Za-z0-9_-]{2,50}$' or length(trim(p_name))<2 or length(trim(p_name))>150 or p_temporary_pin !~ '^[0-9]{6}$' then raise exception 'INVALID_STAFF_INPUT'; end if;
  select * into branch_row from public.branches where id=p_branch_id and status='ACTIVE'; if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  select * into role_row from public.roles where name=upper(trim(p_role)); if not found or role_row.name='ADMIN' then raise exception 'INVALID_STAFF_ROLE'; end if;
  if exists(select 1 from public.staff where company_id=branch_row.company_id and staff_code=upper(trim(p_staff_code))) then raise exception 'STAFF_CODE_EXISTS'; end if;
  foreach additional_id in array coalesce(p_additional_branch_ids,'{}') loop
    if additional_id=p_branch_id then continue; end if;
    if not exists(select 1 from public.branches where id=additional_id and company_id=branch_row.company_id and status='ACTIVE') then raise exception 'BRANCH_NOT_FOUND'; end if;
  end loop;
  insert into public.profiles(id,role_id,role_name,name,username,email,phone,password_hash,status,company_id,branch_id,default_branch_id) values(legacy_id,role_row.id,role_row.name,trim(p_name),lower(trim(p_staff_code)),nullif(lower(trim(p_email)),''),nullif(trim(p_phone),''),'staff_pin_only',next_status,branch_row.company_id,branch_row.id,branch_row.id);
  insert into public.staff(staff_code,name,company_id,branch_id,role_id,legacy_profile_id,active,updated_by) values(upper(trim(p_staff_code)),trim(p_name),branch_row.company_id,branch_row.id,role_row.id,legacy_id,next_status='ACTIVE',auth.uid()) returning id into staff_id;
  insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(legacy_id,p_branch_id,true,next_status,auth.uid(),now());
  foreach additional_id in array coalesce(p_additional_branch_ids,'{}') loop
    if additional_id<>p_branch_id then insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(legacy_id,additional_id,false,next_status,auth.uid(),now()); end if;
  end loop;
  insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status,changed_by) values(staff_id,crypt(p_temporary_pin,gen_salt('bf',12)),case when next_pin_mode='STAFF_SET' then 'SETUP_REQUIRED' else 'TEMPORARY_RESET' end,auth.uid());
  perform public.write_pos_audit('STAFF_CREATED','STAFF',staff_id,null,jsonb_build_object('staffCode',upper(trim(p_staff_code)),'branchId',branch_row.id,'role',role_row.name));
  created:=jsonb_build_object('id',staff_id,'legacyProfileId',legacy_id,'staffCode',upper(trim(p_staff_code)),'name',trim(p_name),'role',role_row.name,'branchId',branch_row.id,'status',next_status,'pinStatus',case when next_pin_mode='STAFF_SET' then 'SETUP_REQUIRED' else 'TEMPORARY_RESET' end);
  return created;
end; $$;

revoke all on function public.create_admin_staff_record(uuid,text,text,text,text,text,text,uuid[],text,text) from public,anon,authenticated;
grant execute on function public.create_admin_staff_record(uuid,text,text,text,text,text,text,uuid[],text,text) to service_role;

create or replace function public.list_admin_roles_with_counts()
returns table(id uuid,name varchar,description text,created_at timestamptz,updated_at timestamptz,staff_count bigint,permission_count bigint)
language plpgsql stable security definer set search_path=public as $$
declare actor_company uuid;
begin
  select company_id into actor_company from public.profiles where profiles.id=auth.uid() and status='ACTIVE';
  if actor_company is null or not public.has_pos_permission('role.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return query
  select r.id,r.name,r.description,r.created_at,r.updated_at,
    (select count(*) from public.staff s where s.role_id=r.id and s.company_id=actor_company),
    (select count(*) from public.role_permissions rp where rp.role_id=r.id)
  from public.roles r order by case r.name when 'ADMIN' then 0 when 'MANAGER' then 1 else 2 end,r.name;
end; $$;

revoke all on function public.list_admin_roles_with_counts() from public,anon;
grant execute on function public.list_admin_roles_with_counts() to authenticated;

create or replace function public.admin_update_staff_record(
  p_staff_id uuid,p_name text,p_role text,p_branch_id uuid,p_active boolean,p_additional_branch_ids uuid[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor public.profiles; target public.staff; branch_row public.branches; role_row public.roles; previous jsonb; active_admins integer; branch_id uuid; staff_profile_id uuid;
begin
  select * into actor from public.profiles where id=auth.uid() and status='ACTIVE';
  if not found or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into target from public.staff where id=p_staff_id and company_id=actor.company_id for update;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
  select * into branch_row from public.branches where id=p_branch_id and company_id=actor.company_id;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  if p_active and branch_row.status<>'ACTIVE' then raise exception 'BRANCH_INACTIVE'; end if;
  select * into role_row from public.roles where name=upper(btrim(p_role));
  if not found then raise exception 'INVALID_STAFF_ROLE'; end if;
  if target.role_id is distinct from role_row.id and not public.has_pos_permission('user.assign_role') then raise exception 'INSUFFICIENT_ROLE_ASSIGNMENT_PERMISSION'; end if;
  if not p_active and role_row.name='ADMIN' then
    perform pg_advisory_xact_lock(hashtextextended('active-admin-roster:'||actor.company_id::text,0));
    select count(*) into active_admins from public.profiles where company_id=actor.company_id and role_name='ADMIN' and status='ACTIVE';
    if active_admins<=1 and target.active then raise exception 'LAST_ACTIVE_ADMIN_REQUIRED'; end if;
  end if;
  foreach branch_id in array coalesce(p_additional_branch_ids,'{}') loop
    if branch_id=p_branch_id then continue; end if;
    if not exists(select 1 from public.branches where id=branch_id and company_id=actor.company_id and status='ACTIVE') then raise exception 'BRANCH_NOT_FOUND'; end if;
  end loop;
  if nullif(btrim(p_name),'') is null or length(btrim(p_name))>150 then raise exception 'INVALID_STAFF_NAME'; end if;
  previous:=to_jsonb(target); staff_profile_id:=target.legacy_profile_id;
  update public.staff set name=btrim(p_name),role_id=role_row.id,branch_id=branch_row.id,active=p_active,updated_at=now(),updated_by=auth.uid() where id=target.id returning * into target;
  update public.profiles set name=btrim(p_name),role_id=role_row.id,role_name=role_row.name,status=case when p_active then 'ACTIVE' else 'INACTIVE' end,branch_id=branch_row.id,default_branch_id=branch_row.id,updated_at=now() where id=staff_profile_id;
  insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(staff_profile_id,p_branch_id,true,case when p_active then 'ACTIVE' else 'INACTIVE' end,auth.uid(),now()) on conflict(staff_id,branch_id) do update set is_primary=true,status=excluded.status,removed_at=null,updated_at=now();
  update public.staff_branch_assignments set is_primary=false,status=case when p_active then 'ACTIVE' else 'INACTIVE' end,removed_at=case when p_active then null else now() end,updated_at=now() where staff_id=staff_profile_id and branch_id<>p_branch_id and branch_id not in (select unnest(coalesce(p_additional_branch_ids,'{}')));
  foreach branch_id in array coalesce(p_additional_branch_ids,'{}') loop
    insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at) values(staff_profile_id,branch_id,false,case when p_active then 'ACTIVE' else 'INACTIVE' end,auth.uid(),now()) on conflict(staff_id,branch_id) do update set is_primary=false,status=excluded.status,removed_at=null,updated_at=now();
  end loop;
  if not p_active then update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where staff_record_id=target.id and status in ('ACTIVE','LOCKED'); end if;
  perform public.write_pos_audit_diff(case when p_active then 'STAFF_UPDATED' else 'STAFF_DEACTIVATED' end,'STAFF',target.id,null,previous,to_jsonb(target));
  return jsonb_build_object('id',target.id,'name',target.name,'branchId',target.branch_id,'role',role_row.name,'status',case when target.active then 'ACTIVE' else 'INACTIVE' end);
end; $$;

revoke all on function public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[]) from public,anon;
grant execute on function public.admin_update_staff_record(uuid,text,text,uuid,boolean,uuid[]) to authenticated;

commit;
