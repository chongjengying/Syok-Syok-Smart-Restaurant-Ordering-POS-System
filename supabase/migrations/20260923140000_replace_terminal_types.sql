begin;

do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.pos_terminals'::regclass and pg_get_constraintdef(oid) like '%terminal_type%'
  loop execute format('alter table public.pos_terminals drop constraint %I',c.conname); end loop;
end $$;

update public.pos_terminals set terminal_type=case upper(terminal_type)
  when 'POS' then 'CASHIER'
  when 'KDS' then 'KITCHEN'
  when 'SELF_ORDER' then 'SELF_SERVICE'
  when 'KIOSK' then 'SELF_SERVICE'
  when 'MOBILE' then 'CASHIER'
  when 'BACK_OFFICE' then 'CUSTOMER_DISPLAY'
  when 'ADMIN' then 'CUSTOMER_DISPLAY'
  when 'STANDARD_POS' then 'CASHIER'
  when 'SELF_SERVICE_KIOSK' then 'SELF_SERVICE'
  when 'MOBILE_POS' then 'CASHIER'
  when 'ORDERING_TERMINAL' then 'SELF_SERVICE'
  when 'KITCHEN_DISPLAY' then 'KITCHEN'
  else terminal_type end;

do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.pos_terminals'::regclass and pg_get_constraintdef(oid) like '%terminal_type%'
  loop execute format('alter table public.pos_terminals drop constraint %I',c.conname); end loop;
end $$;

alter table public.pos_terminals alter column terminal_type set default 'CASHIER';
alter table public.pos_terminals add constraint pos_terminals_terminal_type_check
  check (terminal_type in ('CASHIER','WAITER','KITCHEN','BAR','SELF_SERVICE','CUSTOMER_DISPLAY'));

create or replace function public.change_terminal_type(p_terminal_id uuid,p_terminal_type text)
returns public.pos_terminals language plpgsql security definer set search_path=public as $$
declare t public.pos_terminals; old_type text; new_type text;
begin
  new_type:=upper(trim(coalesce(p_terminal_type,'')));
  if new_type not in ('CASHIER','WAITER','KITCHEN','BAR','SELF_SERVICE','CUSTOMER_DISPLAY') then raise exception 'INVALID_TERMINAL_TYPE'; end if;
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if t.terminal_type=new_type then return t; end if;
  if exists(select 1 from public.cashier_shifts where terminal_id=t.id and status='OPEN') then raise exception 'TERMINAL_TYPE_CHANGE_OPEN_SHIFT'; end if;
  if exists(select 1 from public.terminal_staff_sessions where terminal_id=t.id and status in('ACTIVE','LOCKED')) then raise exception 'TERMINAL_TYPE_CHANGE_ACTIVE_SESSION'; end if;
  old_type:=t.terminal_type;
  update public.pos_terminals set terminal_type=new_type,updated_at=now() where id=t.id returning * into t;
  perform public.write_pos_audit_diff('TERMINAL_TYPE_CHANGED','TERMINAL',t.id,'Terminal type changed',jsonb_build_object('terminalId',t.id,'terminalType',old_type),jsonb_build_object('terminalId',t.id,'terminalType',new_type),jsonb_build_object('companyId',t.company_id,'branchId',t.branch_id));
  return t;
end $$;

create or replace function public.require_terminal_staff_session()
returns public.terminal_staff_sessions language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; t public.pos_terminals;
begin
  s:=public.current_terminal_staff_session();
  if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if;
  select * into t from public.pos_terminals where id=s.terminal_id;
  if not found or t.status<>'ACTIVE' or t.registration_status<>'REGISTERED' or t.lock_status='LOCKED' then raise exception 'TERMINAL_INACTIVE'; end if;
  perform public.assert_branch_operational(s.branch_id,s.company_id);
  if t.terminal_type not in ('CASHIER','WAITER','BAR','SELF_SERVICE') then raise exception 'POS_TERMINAL_REQUIRED'; end if;
  return s;
end $$;

do $$ declare definition text; begin
  select pg_get_functiondef('public.save_pos_terminal(uuid,uuid,text,text,text,text,text)'::regprocedure) into definition;
  definition:=replace(definition,'normalized_type not in (''STANDARD_POS'',''SELF_SERVICE_KIOSK'',''MOBILE_POS'',''ORDERING_TERMINAL'',''KITCHEN_DISPLAY'',''POS'',''BACK_OFFICE'',''KIOSK'',''MOBILE'')','normalized_type not in (''CASHIER'',''WAITER'',''KITCHEN'',''BAR'',''SELF_SERVICE'',''CUSTOMER_DISPLAY'')');
  execute definition;
end $$;

do $$ declare definition text; begin
  select pg_get_functiondef('public.assign_order_branch_id()'::regprocedure) into definition;
  definition:=replace(definition,'terminal_type from public.pos_terminals where id=s.terminal_id) not in (''STANDARD_POS'',''POS'')','terminal_type from public.pos_terminals where id=s.terminal_id) not in (''CASHIER'',''WAITER'',''BAR'',''SELF_SERVICE'')');
  execute definition;
end $$;

commit;
