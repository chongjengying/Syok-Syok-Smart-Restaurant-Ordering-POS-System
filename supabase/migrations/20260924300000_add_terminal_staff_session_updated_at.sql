begin;

-- Terminal staff sessions are mutated by logout, lock, reset, and admin
-- device-management RPCs. Keep a modification timestamp for those writes.
alter table public.terminal_staff_sessions
  add column if not exists updated_at timestamptz not null default now();

update public.terminal_staff_sessions
set updated_at = coalesce(ended_at, last_activity_at, started_at, now())
where updated_at is null;

drop trigger if exists trg_terminal_staff_sessions_updated_at on public.terminal_staff_sessions;
create trigger trg_terminal_staff_sessions_updated_at
before update on public.terminal_staff_sessions
for each row execute function public.update_updated_at_column();

commit;
