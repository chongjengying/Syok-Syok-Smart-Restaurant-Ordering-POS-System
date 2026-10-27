begin;

-- Staff branch access must be evaluated consistently during login, session
-- creation, and every protected POS action. The primary branch remains a
-- convenience field; active staff_branch_assignments are authoritative.
create or replace function public.current_terminal_staff_session()
returns public.terminal_staff_sessions
language sql stable security definer set search_path=public as $$
  select s
  from public.terminal_staff_sessions s
  join public.pos_terminals t on t.id=s.terminal_id
  join public.branches b on b.id=t.branch_id and b.status='ACTIVE'
  join public.companies c on c.id=t.company_id and c.status='ACTIVE'
  join public.staff st on st.id=s.staff_record_id and st.active and st.company_id=c.id
  where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid
    and t.auth_user_id=auth.uid()
    and s.status='ACTIVE'
    and t.status='ACTIVE'
    and t.registration_status='REGISTERED'
    and (st.branch_id=t.branch_id or exists(
      select 1 from public.staff_branch_assignments a
      where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE'
    ));
$$;

create or replace function public.begin_authenticated_terminal_staff_session(p_staff_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  t public.pos_terminals;
  st public.staff;
  s public.terminal_staff_sessions;
  session_id uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  branch_allowed boolean;
  terminal_allowed boolean;
begin
  select * into t from public.pos_terminals where auth_user_id=auth.uid() for update;
  select * into st from public.staff where id=p_staff_id and active for update;
  if t.id is null or st.id is null then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
  if t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then raise exception 'TERMINAL_UNAVAILABLE'; end if;
  if not exists(select 1 from public.branches where id=t.branch_id and company_id=t.company_id and status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;
  if not exists(select 1 from public.companies where id=t.company_id and status='ACTIVE') then raise exception 'COMPANY_INACTIVE'; end if;
  if st.company_id<>t.company_id then raise exception 'STAFF_ACCESS_DENIED'; end if;
  branch_allowed := st.branch_id=t.branch_id or exists(select 1 from public.staff_branch_assignments a where a.staff_id=st.legacy_profile_id and a.branch_id=t.branch_id and a.status='ACTIVE');
  if not branch_allowed then raise exception 'STAFF_OUTLET_ACCESS_DENIED'; end if;
  terminal_allowed := t.access_mode='ALL_BRANCH_STAFF'
    or (t.access_mode='ROLE_RESTRICTED' and exists(select 1 from public.roles r where r.id=st.role_id and r.name=any(t.allowed_roles)))
    or exists(select 1 from public.terminal_staff_access a where a.terminal_id=t.id and a.staff_id=st.id);
  if not terminal_allowed then raise exception 'STAFF_TERMINAL_ACCESS_DENIED'; end if;
  update public.terminal_staff_sessions set status='ENDED',ended_at=coalesce(ended_at,now()),updated_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,staff_record_id,actor_auth_user_id,auth_session_id,role,permissions)
  values(t.company_id,t.branch_id,t.id,st.legacy_profile_id,st.id,auth.uid(),session_id,(select name from public.roles where id=st.role_id),array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=st.role_id)) returning * into s;
  update public.pos_terminals set authenticated_at=now(),last_seen_at=now(),updated_at=now() where id=t.id;
  return to_jsonb(s);
end;
$$;

revoke all on function public.current_terminal_staff_session(),public.begin_authenticated_terminal_staff_session(uuid) from public,anon;
grant execute on function public.current_terminal_staff_session(),public.begin_authenticated_terminal_staff_session(uuid) to authenticated;

commit;
