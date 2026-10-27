begin;

-- A device Auth session outlives individual staff logins. Preserve history
-- while allowing another login after the previous staff session has ended.
drop index public.terminal_staff_auth_session_unique;
create unique index terminal_staff_auth_session_unique
on public.terminal_staff_sessions(auth_session_id)
where auth_session_id is not null and status in ('ACTIVE','LOCKED');

commit;
