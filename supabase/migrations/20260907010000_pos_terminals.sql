create table if not exists public.pos_terminals (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id) on delete restrict,
 terminal_code text not null, name text not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')),
 terminal_type text not null default 'POS' check(terminal_type in ('POS','KDS')),
 registration_status text not null default 'REGISTERED' check(registration_status in ('REGISTERED','UNREGISTERED','REVOKED')),
 device_identifier text, registered_at timestamptz, last_seen_at timestamptz,
 registered_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(branch_id,terminal_code)
);
alter table public.pos_terminals enable row level security;
create policy pos_terminal_view on public.pos_terminals for select to authenticated using(public.has_pos_permission('settings.view'));
create policy pos_terminal_manage on public.pos_terminals for all to authenticated using(public.has_pos_permission('settings.manage')) with check(public.has_pos_permission('settings.manage'));
create or replace function public.save_pos_terminal(p_id uuid, p_branch_id uuid, p_code text, p_name text, p_status text default 'ACTIVE', p_type text default 'POS', p_device_identifier text default null) returns public.pos_terminals language plpgsql security definer set search_path=public as $$ declare r public.pos_terminals; begin if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if; if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if; insert into public.pos_terminals(id,branch_id,terminal_code,name,status,terminal_type,device_identifier,registration_status,registered_at,registered_by) values(coalesce(p_id,gen_random_uuid()),p_branch_id,upper(trim(p_code)),trim(p_name),upper(p_status),upper(p_type),nullif(trim(p_device_identifier),''),'REGISTERED',now(),auth.uid()) on conflict(id) do update set branch_id=excluded.branch_id,terminal_code=excluded.terminal_code,name=excluded.name,status=excluded.status,terminal_type=excluded.terminal_type,device_identifier=excluded.device_identifier,updated_at=now() returning * into r; return r; end $$;
drop function if exists public.save_pos_terminal(uuid,uuid,text,text,text);
grant execute on function public.save_pos_terminal(uuid,uuid,text,text,text,text,text) to authenticated;
