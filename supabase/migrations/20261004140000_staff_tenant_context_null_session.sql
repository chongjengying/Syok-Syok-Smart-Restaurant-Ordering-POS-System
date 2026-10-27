begin;

create or replace function public.current_user_company_id()
returns uuid language sql stable security definer set search_path=public as $$
  select s.company_id from public.current_terminal_staff_session() s where s.id is not null
  union all
  select p.company_id from public.profiles p
  where p.id=auth.uid() and p.status='ACTIVE'
    and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
  limit 1;
$$;

commit;
