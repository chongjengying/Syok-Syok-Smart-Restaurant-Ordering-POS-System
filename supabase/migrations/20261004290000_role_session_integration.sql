begin;

-- Keep a single relationship for PostgREST embedded role reads.
alter table public.staff drop constraint staff_role_id_fkey;
alter table public.profiles drop constraint profiles_role_id_fkey;

create or replace function public.get_my_staff_session() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',p.id,'staffId',st.id,'name',st.name,'email',null,'username',p.username,
  'status','ACTIVE','role',r.name,'branchId',s.branch_id,'permissions',to_jsonb(public.get_my_permissions()))
 from public.current_terminal_staff_session() s
 join public.staff st on st.id=s.staff_record_id and st.active
 join public.profiles p on p.id=st.legacy_profile_id
 join public.roles r on r.id=st.role_id and r.company_id=st.company_id and r.is_active and r.scope='COMPANY'
 union all
 select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'username',p.username,
  'status',p.status,'role',r.name,'branchId',p.branch_id,'permissions',to_jsonb(public.get_my_permissions()))
 from public.profiles p join public.roles r on r.id=p.role_id and r.company_id=p.company_id and r.is_active and r.scope='COMPANY'
 join public.companies c on c.id=p.company_id and c.status='ACTIVE'
 where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN'
 and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
 limit 1
$$;
create or replace function public.is_active_pos_user() returns boolean
language sql stable security definer set search_path=public as $$
 select public.current_pos_role() is not null
$$;

do $patch$ declare d text; begin
 select pg_get_functiondef('public.list_pos_staff()'::regprocedure) into d;
 d:=replace(d,'and profile.status = ''ACTIVE''',
  'and profile.company_id=public.current_user_company_id() and role.company_id=profile.company_id and role.is_active and role.scope=''COMPANY'' and profile.status = ''ACTIVE''');
 execute d;
end $patch$;

notify pgrst,'reload schema';
commit;
