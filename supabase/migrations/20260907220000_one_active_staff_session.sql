begin;
create unique index if not exists one_active_staff_terminal_session
on public.terminal_staff_sessions(staff_id)
where status in ('ACTIVE','LOCKED');

create or replace function public.begin_terminal_staff_session(p_actor uuid,p_staff_id uuid,p_device_identifier text,p_auth_session_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; p public.profiles; s public.terminal_staff_sessions; existing public.terminal_staff_sessions;
begin
 select * into t from public.pos_terminals where device_identifier=p_device_identifier for update;
 if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' then raise exception 'TERMINAL_INVALID'; end if;
 if not public.staff_has_branch(p_staff_id,t.branch_id) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
 if not public.can_use_terminal(t.id,p_staff_id) then raise exception 'TERMINAL_STAFF_ACCESS_DENIED'; end if;
 select * into p from public.profiles where id=p_staff_id and status='ACTIVE'; if not found then raise exception 'STAFF_NOT_ACTIVE'; end if;
 if not exists(select 1 from auth.sessions where id=p_auth_session_id and user_id=p_staff_id) then raise exception 'INVALID_AUTH_SESSION'; end if;
 select * into existing from public.terminal_staff_sessions where staff_id=p_staff_id and status in ('ACTIVE','LOCKED') for update;
 if found and existing.terminal_id<>t.id then raise exception 'STAFF_ALREADY_ACTIVE_ON_TERMINAL'; end if;
 update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
 insert into public.terminal_staff_sessions(company_id,branch_id,terminal_id,staff_id,actor_auth_user_id,auth_session_id,role,permissions) values(t.company_id,t.branch_id,t.id,p.id,p_actor,p_auth_session_id,p.role_name,array(select pm.code from public.role_permissions rp join public.permissions pm on pm.id=rp.permission_id where rp.role_id=p.role_id)) returning * into s;
 update public.pos_terminals set last_seen_at=now() where id=t.id; return to_jsonb(s);
end $$;
commit;
