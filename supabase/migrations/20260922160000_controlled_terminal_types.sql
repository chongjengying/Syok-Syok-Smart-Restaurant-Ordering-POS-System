begin;

alter table public.pos_terminals
  alter column terminal_type set default 'STANDARD_POS';

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pos_terminals'::regclass
      and pg_get_constraintdef(oid) like '%terminal_type%'
  loop
    execute format('alter table public.pos_terminals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.pos_terminals
  add constraint pos_terminals_terminal_type_check check (terminal_type in (
    'STANDARD_POS', 'SELF_SERVICE_KIOSK', 'MOBILE_POS',
    'ORDERING_TERMINAL', 'KITCHEN_DISPLAY',
    'POS', 'BACK_OFFICE', 'KIOSK', 'MOBILE'
  ));

create or replace function public.save_pos_terminal(
  p_id uuid, p_branch_id uuid, p_code text, p_name text,
  p_status text default 'ACTIVE', p_type text default 'STANDARD_POS',
  p_device_identifier text default null
) returns public.pos_terminals
language plpgsql security definer set search_path=public as $$
declare result public.pos_terminals; previous public.pos_terminals; normalized_type text;
begin
  if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  normalized_type := upper(trim(coalesce(p_type, 'STANDARD_POS')));
  if nullif(trim(p_name),'') is null or upper(trim(p_code)) !~ '^[A-Z0-9_-]{2,40}$'
     or normalized_type not in ('STANDARD_POS','SELF_SERVICE_KIOSK','MOBILE_POS','ORDERING_TERMINAL','KITCHEN_DISPLAY','POS','BACK_OFFICE','KIOSK','MOBILE') then
    raise exception 'INVALID_TERMINAL_TYPE';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
  if p_id is not null then select * into previous from public.pos_terminals where id=p_id for update; end if;
  insert into public.pos_terminals(id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status)
  select coalesce(p_id,gen_random_uuid()),b.company_id,b.id,upper(trim(p_code)),trim(p_name),upper(coalesce(p_status,'ACTIVE')),normalized_type,'UNREGISTERED'
  from public.branches b where b.id=p_branch_id
  on conflict(id) do update set branch_id=excluded.branch_id,terminal_code=excluded.terminal_code,name=excluded.name,status=excluded.status,terminal_type=excluded.terminal_type,updated_at=now()
  returning * into result;
  perform public.write_pos_audit_diff(case when previous.id is null then 'TERMINAL_CREATED' else 'TERMINAL_UPDATED' end,'TERMINAL',result.id,null,to_jsonb(previous),to_jsonb(result));
  return result;
end $$;

create or replace function public.change_terminal_type(p_terminal_id uuid, p_terminal_type text)
returns public.pos_terminals
language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; old_type text; new_type text;
begin
  new_type := upper(trim(coalesce(p_terminal_type, '')));
  if new_type not in ('STANDARD_POS','SELF_SERVICE_KIOSK','MOBILE_POS','ORDERING_TERMINAL','KITCHEN_DISPLAY') then
    raise exception 'INVALID_TERMINAL_TYPE';
  end if;
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if t.terminal_type = new_type then return t; end if;
  if exists (select 1 from public.cashier_shifts where terminal_id=t.id and status='OPEN') then
    raise exception 'TERMINAL_TYPE_CHANGE_OPEN_SHIFT';
  end if;
  if exists (select 1 from public.terminal_staff_sessions where terminal_id=t.id and status in ('ACTIVE','LOCKED')) then
    raise exception 'TERMINAL_TYPE_CHANGE_ACTIVE_SESSION';
  end if;
  old_type := t.terminal_type;
  update public.pos_terminals set terminal_type=new_type, updated_at=now() where id=t.id returning * into t;
  perform public.write_pos_audit_diff('TERMINAL_TYPE_CHANGED','TERMINAL',t.id,'Terminal type changed',
    jsonb_build_object('terminalId',t.id,'terminalType',old_type),
    jsonb_build_object('terminalId',t.id,'terminalType',new_type),
    jsonb_build_object('companyId',t.company_id,'branchId',t.branch_id));
  return t;
end $$;

revoke all on function public.change_terminal_type(uuid,text) from public, anon;
grant execute on function public.change_terminal_type(uuid,text) to authenticated, service_role;

create or replace function public.require_terminal_staff_session()
returns public.terminal_staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; terminal_kind text;
begin
  s := public.current_terminal_staff_session();
  if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if;
  select terminal_type into terminal_kind from public.pos_terminals where id=s.terminal_id;
  if terminal_kind not in ('STANDARD_POS','POS','MOBILE','KIOSK') then raise exception 'POS_TERMINAL_REQUIRED'; end if;
  return s;
end $$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.assign_order_branch_id()'::regprocedure) into definition;
  if definition is not null then
    definition := replace(definition, 'terminal_type from public.pos_terminals where id=s.terminal_id)<>''POS''', 'terminal_type from public.pos_terminals where id=s.terminal_id) not in (''STANDARD_POS'',''POS'')');
    execute definition;
  end if;
end $$;

commit;
