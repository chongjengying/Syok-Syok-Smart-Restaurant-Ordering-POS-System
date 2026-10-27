begin;

create table if not exists public.terminal_device_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  device_identifier text not null,
  assigned_at timestamptz not null default now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoke_reason text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  constraint terminal_device_assignment_device_check check (length(device_identifier) >= 32),
  constraint terminal_device_assignment_dates_check check (revoked_at is null or revoked_at >= assigned_at)
);

create unique index if not exists terminal_device_assignments_one_active
  on public.terminal_device_assignments(terminal_id) where status='ACTIVE';
create index if not exists terminal_device_assignments_device_idx
  on public.terminal_device_assignments(device_identifier, assigned_at desc);
create index if not exists terminal_device_assignments_terminal_idx
  on public.terminal_device_assignments(terminal_id, assigned_at desc);

alter table public.terminal_device_assignments enable row level security;
revoke all on public.terminal_device_assignments from public, anon, authenticated;
grant select on public.terminal_device_assignments to authenticated;

drop policy if exists terminal_device_assignments_admin_read on public.terminal_device_assignments;
create policy terminal_device_assignments_admin_read
  on public.terminal_device_assignments for select to authenticated
  using (
    public.has_pos_permission('terminal.view')
    and exists (
      select 1
      from public.pos_terminals t
      where t.id=terminal_device_assignments.terminal_id
        and public.can_access_branch(t.branch_id)
    )
  );

-- Backfill the current binding once. Future changes are recorded by the trigger below.
insert into public.terminal_device_assignments(terminal_id,device_identifier,assigned_at,activated_at,status)
select t.id,t.device_identifier,coalesce(t.registered_at,t.created_at),coalesce(t.activated_at,t.registered_at),'ACTIVE'
from public.pos_terminals t
where t.device_identifier is not null
  and t.registration_status='REGISTERED'
  and not exists (
    select 1 from public.terminal_device_assignments a
    where a.terminal_id=t.id and a.status='ACTIVE'
  );

create or replace function public.sync_terminal_device_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
declare reason text;
begin
  if new.device_identifier is distinct from old.device_identifier
     or new.registration_status is distinct from old.registration_status then
    if old.device_identifier is not null and (
      new.device_identifier is distinct from old.device_identifier
      or new.registration_status in ('REVOKED','UNREGISTERED')
    ) then
      reason := case when new.registration_status='REVOKED' then 'TERMINAL_REVOKED' else 'DEVICE_REASSIGNED' end;
      update public.terminal_device_assignments
      set status='REVOKED', revoked_at=coalesce(revoked_at,now()), revoked_by=coalesce(auth.uid(),revoked_by), revoke_reason=coalesce(revoke_reason,reason)
      where terminal_id=old.id and status='ACTIVE';
    end if;
    if new.device_identifier is not null and new.registration_status='REGISTERED'
       and not exists (select 1 from public.terminal_device_assignments where terminal_id=new.id and status='ACTIVE') then
      insert into public.terminal_device_assignments(terminal_id,device_identifier,assigned_at,activated_at,status)
      values(new.id,new.device_identifier,coalesce(new.registered_at,now()),coalesce(new.activated_at,new.registered_at,now()),'ACTIVE');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sync_terminal_device_assignment on public.pos_terminals;
create trigger sync_terminal_device_assignment
  after update of device_identifier,registration_status on public.pos_terminals
  for each row execute function public.sync_terminal_device_assignment();

revoke all on function public.sync_terminal_device_assignment() from public, anon, authenticated;

commit;
