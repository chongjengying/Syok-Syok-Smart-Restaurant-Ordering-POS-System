begin;

create or replace function public.get_my_permissions()
returns text[] language sql stable security definer set search_path=public as $$
  with context as (select public.current_terminal_staff_session() as session), identity as (
    select st.role_id from context ctx join public.staff st on st.id=(ctx.session).staff_record_id
    union all
    select p.role_id from public.profiles p,context ctx
    where (ctx.session).id is null and p.id=auth.uid() and p.status='ACTIVE'
      and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
  )
  select coalesce(array_agg(distinct pm.code order by pm.code),'{}'::text[])
  from identity i join public.roles r on r.id=i.role_id and r.is_active
  join public.role_permissions rp on rp.role_id=r.id join public.permissions pm on pm.id=rp.permission_id;
$$;

create or replace function public.has_pos_permission(p_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select p_permission=any(public.get_my_permissions());
$$;

create or replace function public.current_pos_role()
returns text language sql stable security definer set search_path=public as $$
  select r.name from public.current_terminal_staff_session() s join public.staff st on st.id=s.staff_record_id
  join public.roles r on r.id=st.role_id and r.is_active
  union all
  select r.name from public.profiles p join public.roles r on r.id=p.role_id and r.is_active
  where p.id=auth.uid() and p.status='ACTIVE' and r.name='ADMIN'
    and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
  limit 1;
$$;

commit;
