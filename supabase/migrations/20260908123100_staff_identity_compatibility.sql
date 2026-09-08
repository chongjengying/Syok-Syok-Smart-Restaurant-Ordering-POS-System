begin;

-- Staff profiles are now operational records, not Supabase Auth identities.
-- Existing Admin profiles remain linked by matching UUID, while new staff get a
-- generated legacy profile UUID for unchanged financial/audit foreign keys.
do $$
declare constraint_name text;
begin
  select conname into constraint_name from pg_constraint
  where conrelid='public.profiles'::regclass and contype='f' and confrelid='auth.users'::regclass limit 1;
  if constraint_name is not null then execute format('alter table public.profiles drop constraint %I', constraint_name); end if;
end $$;

create or replace function public.current_pos_role()
returns text language sql stable security definer set search_path=public as $$
  select coalesce((public.current_terminal_staff_session()).role,
    (select r.name from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN'));
$$;

create or replace function public.is_active_pos_user()
returns boolean language sql stable security definer set search_path=public as $$
  select (public.current_terminal_staff_session()).id is not null
     or exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN');
$$;

create or replace function public.get_my_staff_session()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',p.id,'staffId',st.id,'name',st.name,'email',null,'username',p.username,'status','ACTIVE','role',r.name,'branchId',st.branch_id,'permissions',coalesce((select jsonb_agg(pm.code order by pm.code) from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=st.role_id),'[]'::jsonb))
  from public.current_terminal_staff_session() s
  join public.staff st on st.id=s.staff_record_id
  join public.profiles p on p.id=st.legacy_profile_id
  join public.roles r on r.id=st.role_id
  union all
  select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'username',p.username,'status',p.status,'role',r.name,'branchId',p.branch_id,'permissions',coalesce((select jsonb_agg(pm.code order by pm.code) from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id),'[]'::jsonb))
  from public.profiles p join public.roles r on r.id=p.role_id
  where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN'
  limit 1;
$$;

create or replace function public.provision_terminal_staff(p_branch_code text, p_staff_code text, p_name text, p_role text, p_pin text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare branch_row public.branches; role_row public.roles; legacy_id uuid:=gen_random_uuid(); staff_id uuid;
begin
  if p_staff_code !~ '^[A-Za-z0-9_-]{2,50}$' or length(trim(p_name))<2 or p_pin !~ '^[0-9]{6}$' then raise exception 'INVALID_STAFF_INPUT'; end if;
  select * into branch_row from public.branches where code=upper(trim(p_branch_code)) and status='ACTIVE';
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  select * into role_row from public.roles where name=upper(trim(p_role));
  if not found or role_row.name='ADMIN' then raise exception 'INVALID_STAFF_ROLE'; end if;
  insert into public.profiles(id,role_id,role_name,name,username,email,password_hash,status,company_id,branch_id,default_branch_id)
  values(legacy_id,role_row.id,role_row.name,trim(p_name),lower(p_staff_code),null,'staff_pin_only','ACTIVE',branch_row.company_id,branch_row.id,branch_row.id);
  insert into public.staff(staff_code,name,company_id,branch_id,role_id,legacy_profile_id,updated_by)
  values(upper(trim(p_staff_code)),trim(p_name),branch_row.company_id,branch_row.id,role_row.id,legacy_id,auth.uid()) returning id into staff_id;
  insert into public.staff_pin_credentials_v2(staff_id,pin_hash,status,changed_by)
  values(staff_id,crypt(p_pin,gen_salt('bf',12)),'ACTIVE',auth.uid());
  return staff_id;
end $$;

revoke all on function public.current_pos_role(), public.is_active_pos_user(), public.get_my_staff_session(), public.provision_terminal_staff(text,text,text,text,text) from public, anon;
grant execute on function public.current_pos_role(), public.is_active_pos_user(), public.get_my_staff_session() to authenticated;
grant execute on function public.provision_terminal_staff(text,text,text,text,text) to service_role;

commit;
