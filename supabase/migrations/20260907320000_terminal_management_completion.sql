begin;

-- Keep legacy POS/KDS values valid while allowing the capability-oriented types
-- used by the admin module. The database remains the source of truth.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid='public.pos_terminals'::regclass and pg_get_constraintdef(oid) like '%terminal_type%' loop
    execute format('alter table public.pos_terminals drop constraint if exists %I', c.conname);
  end loop;
end $$;
alter table public.pos_terminals add constraint pos_terminals_type_check
  check (terminal_type in ('POS','KDS','CASHIER','WAITER','SELF_ORDER','KITCHEN','ADMIN'));
alter table public.pos_terminals add column if not exists lock_status text not null default 'UNLOCKED';
alter table public.pos_terminals add constraint pos_terminals_lock_status_check
  check (lock_status in ('UNLOCKED','LOCKED'));

create or replace function public.save_pos_terminal(
  p_id uuid, p_branch_id uuid, p_code text, p_name text,
  p_status text default 'ACTIVE', p_type text default 'POS', p_device_identifier text default null
) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare previous public.pos_terminals; result public.pos_terminals; b public.branches;
begin
  if not public.can_access_branch(p_branch_id) or not public.has_pos_permission(case when p_id is null then 'terminal.create' else 'terminal.update' end) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into b from public.branches where id=p_branch_id;
  if not found or b.status <> 'ACTIVE' then raise exception 'INVALID_BRANCH'; end if;
  if p_id is not null then
    select * into previous from public.pos_terminals where id=p_id for update;
    if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
    if previous.branch_id<>p_branch_id or previous.terminal_code<>upper(trim(p_code)) then raise exception 'TERMINAL_IDENTITY_IMMUTABLE'; end if;
  end if;
  if nullif(trim(p_name),'') is null or upper(trim(p_code)) !~ '^[A-Z0-9_-]{2,40}$' or upper(trim(p_type)) not in ('POS','KDS','CASHIER','WAITER','SELF_ORDER','KITCHEN','ADMIN') then raise exception 'INVALID_TERMINAL'; end if;
  insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status)
  values(coalesce(p_id,gen_random_uuid()),b.company_id,b.id,upper(trim(p_code)),trim(p_name),'CREATED',upper(trim(p_type)),'UNREGISTERED')
  on conflict(id) do update set name=excluded.name,terminal_type=excluded.terminal_type,updated_at=now()
  returning * into result;
  perform public.write_pos_audit_diff(case when p_id is null then 'TERMINAL_CREATED' else 'TERMINAL_UPDATED' end,'TERMINAL',result.id,null,to_jsonb(previous)-'device_identifier',to_jsonb(result)-'device_identifier');
  return result;
end $$;

create or replace function public.transition_pos_terminal(p_terminal_id uuid,p_action text,p_device_identifier text default null) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; previous jsonb; action text:=upper(trim(p_action));
begin
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if not public.can_access_branch(t.branch_id) or not public.has_pos_permission(case when action='DEACTIVATE' then 'terminal.deactivate' else 'terminal.update' end) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  previous:=to_jsonb(t)-'device_identifier';
  if action='REGISTER' then
    if length(coalesce(p_device_identifier,''))<32 then raise exception 'INVALID_DEVICE_REGISTRATION'; end if;
    update public.pos_terminals set registration_status='REGISTERED',device_identifier=p_device_identifier,registered_at=now(),registered_by=auth.uid(),status='INACTIVE',updated_at=now() where id=t.id returning * into t;
  elsif action='ACTIVATE' then
    if t.registration_status<>'REGISTERED' or t.device_identifier is null then raise exception 'TERMINAL_NOT_REGISTERED'; end if;
    if not exists(select 1 from public.branches b join public.companies c on c.id=b.company_id where b.id=t.branch_id and b.status='ACTIVE' and c.status='ACTIVE') then raise exception 'BRANCH_OR_COMPANY_INACTIVE'; end if;
    update public.pos_terminals set status='ACTIVE',lock_status='UNLOCKED',updated_at=now() where id=t.id returning * into t;
  elsif action='DEACTIVATE' then
    update public.pos_terminals set status='INACTIVE',updated_at=now() where id=t.id returning * into t;
  elsif action='LOCK' then
    update public.pos_terminals set lock_status='LOCKED',updated_at=now() where id=t.id returning * into t;
    update public.terminal_staff_sessions set status='LOCKED',last_activity_at=now() where terminal_id=t.id and status='ACTIVE';
  elsif action='UNLOCK' then
    update public.pos_terminals set lock_status='UNLOCKED',updated_at=now() where id=t.id returning * into t;
  else raise exception 'INVALID_TERMINAL_ACTION'; end if;
  if action in ('DEACTIVATE','REGISTER') then update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED'); end if;
  perform public.write_pos_audit_diff('TERMINAL_'||action,'TERMINAL',t.id,null,previous,to_jsonb(t)-'device_identifier');
  return t;
end $$;

create or replace function public.reassign_pos_terminal(p_terminal_id uuid,p_branch_id uuid) returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; b public.branches;
begin
  if not public.has_pos_permission('terminal.update') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  select * into b from public.branches where id=p_branch_id and status='ACTIVE';
  if t.id is null then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if b.id is null then raise exception 'INVALID_BRANCH'; end if;
  update public.pos_terminals set branch_id=b.id,company_id=b.company_id,status='INACTIVE',registration_status='UNREGISTERED',device_identifier=null,lock_status='UNLOCKED',updated_at=now() where id=t.id returning * into t;
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where terminal_id=t.id and status in ('ACTIVE','LOCKED');
  perform public.write_pos_audit_diff('TERMINAL_REASSIGNED','TERMINAL',t.id,null,to_jsonb(t),jsonb_build_object('branchId',b.id,'companyId',b.company_id));
  return t;
end $$;
revoke all on function public.reassign_pos_terminal(uuid,uuid) from public,anon;
grant execute on function public.reassign_pos_terminal(uuid,uuid) to authenticated;
commit;
