begin;

create or replace function public.current_user_company_id()
returns uuid language sql stable security definer set search_path=public as $$
  select s.company_id from public.current_terminal_staff_session() s
  union all
  select p.company_id from public.profiles p
  where p.id=auth.uid() and p.status='ACTIVE'
    and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
  limit 1;
$$;

create or replace function public.can_access_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.current_terminal_staff_session() s where s.branch_id=p_branch_id)
    or exists(select 1 from public.profiles p join public.branches b on b.id=p_branch_id and b.company_id=p.company_id
      where p.id=auth.uid() and p.status='ACTIVE'
        and not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
        and (p.role_name='ADMIN' or public.staff_has_branch(p.id,p_branch_id)));
$$;

commit;
