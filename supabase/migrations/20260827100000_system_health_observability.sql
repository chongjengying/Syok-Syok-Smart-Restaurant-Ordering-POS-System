begin;

insert into public.permissions(code, module, description)
values ('system.health.view', 'security', 'View operational system health and sanitized incidents')
on conflict (code) do update set module=excluded.module, description=excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.name in ('ADMIN','MANAGER') and p.code='system.health.view'
on conflict do nothing;

create table if not exists public.system_api_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  service varchar(60) not null,
  endpoint varchar(180) not null,
  method varchar(10) not null,
  status_code integer check(status_code between 0 and 599),
  error_type varchar(40),
  duration_ms integer check(duration_ms is null or duration_ms between 0 and 300000),
  correlation_id varchar(80) not null,
  infrastructure_failure boolean not null default false,
  message varchar(240)
);
create index if not exists idx_system_api_events_recent on public.system_api_events(occurred_at desc);
create index if not exists idx_system_api_events_failure_recent on public.system_api_events(infrastructure_failure, occurred_at desc);

create table if not exists public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  severity varchar(12) not null check(severity in ('INFO','WARNING','ERROR','CRITICAL')),
  component varchar(60) not null,
  error_type varchar(40) not null,
  summary varchar(240) not null,
  status varchar(16) not null default 'ACTIVE' check(status in ('ACTIVE','ACKNOWLEDGED','RESOLVED')),
  correlation_id varchar(80),
  details jsonb not null default '{}'::jsonb,
  acknowledged_by uuid references public.profiles(id) on delete set null
);
create index if not exists idx_system_incidents_recent on public.system_incidents(opened_at desc);
create index if not exists idx_system_incidents_active on public.system_incidents(status, severity, opened_at desc);

create table if not exists public.system_device_heartbeats (
  device_key varchar(100) primary key,
  device_type varchar(30) not null check(device_type in ('KDS','RECEIPT_PRINTER','KITCHEN_PRINTER')),
  display_name varchar(120) not null,
  state varchar(20) not null check(state in ('CONNECTED','DISCONNECTED','OFFLINE','ERROR','UNKNOWN')),
  last_seen_at timestamptz not null,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  pending_jobs integer not null default 0 check(pending_jobs >= 0),
  failed_jobs integer not null default 0 check(failed_jobs >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_system_device_heartbeats_type on public.system_device_heartbeats(device_type, last_seen_at desc);

create table if not exists public.system_backup_records (
  id bigint generated always as identity primary key,
  provider varchar(80) not null,
  backup_type varchar(40) not null default 'DATABASE',
  status varchar(20) not null check(status in ('SUCCEEDED','FAILED')),
  completed_at timestamptz not null,
  next_scheduled_at timestamptz,
  reference varchar(160),
  recorded_at timestamptz not null default now()
);
create index if not exists idx_system_backup_records_latest on public.system_backup_records(completed_at desc);

alter table public.system_api_events enable row level security;
alter table public.system_incidents enable row level security;
alter table public.system_device_heartbeats enable row level security;
alter table public.system_backup_records enable row level security;

revoke all on public.system_api_events, public.system_incidents, public.system_device_heartbeats, public.system_backup_records from public, anon, authenticated;
grant all on public.system_api_events, public.system_incidents, public.system_device_heartbeats, public.system_backup_records to service_role;
grant usage, select on sequence public.system_api_events_id_seq, public.system_backup_records_id_seq to service_role;

create policy health_view_api_events on public.system_api_events for select to authenticated using(public.has_pos_permission('system.health.view'));
create policy health_view_incidents on public.system_incidents for select to authenticated using(public.has_pos_permission('system.health.view'));
create policy health_view_devices on public.system_device_heartbeats for select to authenticated using(public.has_pos_permission('system.health.view'));
create policy health_view_backups on public.system_backup_records for select to authenticated using(public.has_pos_permission('system.health.view'));

create or replace function public.system_health_db_probe()
returns timestamptz language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_pos_permission('system.health.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return clock_timestamp();
end;
$$;

create or replace function public.get_system_health_metrics()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cutoff timestamptz := now() - interval '24 hours';
begin
  if not public.has_pos_permission('system.health.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  return jsonb_build_object(
    'api', jsonb_build_object(
      'totalRequests', (select count(*) from public.system_api_events where occurred_at >= cutoff),
      'failedRequests', (select count(*) from public.system_api_events where occurred_at >= cutoff and infrastructure_failure),
      'clientErrors', (select count(*) from public.system_api_events where occurred_at >= cutoff and status_code between 400 and 499),
      'serverErrors', (select count(*) from public.system_api_events where occurred_at >= cutoff and status_code >= 500),
      'timeouts', (select count(*) from public.system_api_events where occurred_at >= cutoff and error_type='TIMEOUT'),
      'recentErrors', coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc) from (
        select occurred_at,service,endpoint,method,status_code,error_type,duration_ms,correlation_id
        from public.system_api_events where occurred_at >= cutoff and (infrastructure_failure or status_code >= 400)
        order by occurred_at desc limit 25
      ) e),'[]'::jsonb)
    ),
    'incidents', coalesce((select jsonb_agg(to_jsonb(i) order by i.opened_at desc) from (
      select id,opened_at,updated_at,resolved_at,severity,component,error_type,summary,status,correlation_id
      from public.system_incidents order by opened_at desc limit 25
    ) i),'[]'::jsonb),
    'devices', coalesce((select jsonb_agg(to_jsonb(d) order by d.device_type,d.display_name) from (
      select device_key,device_type,display_name,state,last_seen_at,last_success_at,last_failure_at,pending_jobs,failed_jobs
      from public.system_device_heartbeats
    ) d),'[]'::jsonb),
    'backup', (select to_jsonb(b) from (
      select provider,backup_type,status,completed_at,next_scheduled_at,reference
      from public.system_backup_records order by completed_at desc limit 1
    ) b),
    'payment', jsonb_build_object(
      'lastSuccessfulTransaction', (select max(coalesce(paid_at,created_at)) from public.payments where status='PAID'),
      'lastFailedTransaction', (select max(created_at) from public.payments where status='FAILED'),
      'successfulTransactions', (select count(*) from public.payments where created_at >= cutoff and status='PAID'),
      'failedTransactions', (select count(*) from public.payments where created_at >= cutoff and status='FAILED')
    )
  );
end;
$$;

revoke all on function public.system_health_db_probe(), public.get_system_health_metrics() from public,anon;
grant execute on function public.system_health_db_probe(), public.get_system_health_metrics() to authenticated;

commit;
