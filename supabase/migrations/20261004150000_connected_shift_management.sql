begin;

alter table public.cashier_shifts add column device_assignment_id uuid references public.terminal_device_assignments(assignment_id) on delete restrict;
alter table public.cash_movements add column staff_session_id uuid references public.terminal_staff_sessions(id) on delete restrict;
alter table public.cash_movements add column idempotency_key text;
create unique index cash_movement_request_once on public.cash_movements(shift_id,idempotency_key) where idempotency_key is not null;

-- Existing Auth-backed terminal binding remains authoritative; this is not a new device-auth system.
create function public.require_shift_operational_context() returns public.terminal_staff_sessions
language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; t public.pos_terminals;
begin
 s:=public.require_terminal_staff_session();
 select * into t from public.pos_terminals where id=s.terminal_id;
 if t.auth_user_id is distinct from auth.uid() or t.device_identifier is null or not exists(
   select 1 from public.terminal_device_assignments d where d.terminal_id=t.id
     and d.device_identifier=t.device_identifier and d.status='ACTIVE'
 ) then raise exception 'DEVICE_NOT_AUTHENTICATED'; end if;
 return s;
end $$;

create or replace function public.open_cashier_shift(p_opening_float numeric) returns public.cashier_shifts
language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; branch_code text; device_id uuid;
begin
 s:=public.require_shift_operational_context();
 if not public.has_pos_permission('cash.shift.open') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_opening_float is null or p_opening_float::text in ('NaN','Infinity','-Infinity') or p_opening_float<0 or p_opening_float>100000 then raise exception 'INVALID_OPENING_FLOAT'; end if;
 perform 1 from public.pos_terminals where id=s.terminal_id for update;
 if exists(select 1 from public.cashier_shifts where terminal_id=s.terminal_id and status='OPEN') then raise exception 'SHIFT_ALREADY_OPEN'; end if;
 select code into branch_code from public.branches where id=s.branch_id;
 select assignment_id into device_id from public.terminal_device_assignments where terminal_id=s.terminal_id and status='ACTIVE';
 insert into public.cashier_shifts(company_id,branch_id,terminal_id,shift_number,opened_by_staff_id,opened_by_session_id,opening_float,device_assignment_id)
 values(s.company_id,s.branch_id,s.terminal_id,'SHIFT-'||branch_code||'-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('public.cash_shift_number_seq')::text,6,'0'),s.staff_id,s.id,round(p_opening_float,2),device_id) returning * into sh;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,staff_session_id,movement_type,amount,reason)
 values(s.company_id,s.branch_id,s.terminal_id,sh.id,s.staff_id,s.id,'OPENING_FLOAT',sh.opening_float,'Opening float');
 perform public.write_pos_audit_diff('SHIFT_OPENED','CASHIER_SHIFT',sh.id,null,null,to_jsonb(sh));
 return sh;
end $$;

create or replace function public.current_terminal_cash_shift() returns public.cashier_shifts
language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts;
begin
 s:=public.require_shift_operational_context();
 if not public.has_pos_permission('cash.shift.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into sh from public.cashier_shifts where terminal_id=s.terminal_id and company_id=s.company_id and branch_id=s.branch_id and status='OPEN';
 return sh;
end $$;

create function public.shift_expected_cash(p_shift_id uuid) returns numeric
language sql stable security definer set search_path=public as $$
 select round(coalesce(sum(case when movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_IN','CASH_ADJUSTMENT') then amount when movement_type in ('CASH_REFUND','CASH_OUT') then -amount else 0 end),0),2)
 from public.cash_movements where shift_id=p_shift_id;
$$;

create function public.finish_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_force boolean,p_reason text)
returns public.cashier_shifts language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; previous jsonb; actor uuid; expected numeric; actual numeric;
begin
 if p_actual_cash is null or p_actual_cash::text in ('NaN','Infinity','-Infinity') or p_actual_cash<0 or p_actual_cash>1000000 then raise exception 'INVALID_ACTUAL_CASH'; end if;
 if p_force then
   if not public.has_pos_permission('cash.shift.force_close') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
   if nullif(btrim(p_reason),'') is null then raise exception 'FORCE_CLOSE_REASON_REQUIRED'; end if;
   actor:=coalesce((public.current_terminal_staff_session()).staff_id,auth.uid());
 else
   s:=public.require_shift_operational_context(); actor:=s.staff_id;
   if not public.has_pos_permission('cash.shift.close') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 end if;
 select * into sh from public.cashier_shifts where id=p_shift_id for update;
 if not found or sh.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(sh.branch_id)
   or (not p_force and (sh.terminal_id<>s.terminal_id or sh.branch_id<>s.branch_id)) then raise exception 'SHIFT_NOT_FOUND'; end if;
 actual:=round(p_actual_cash,2);
 if sh.status<>'OPEN' then
   if sh.actual_cash=actual and sh.closed_by_staff_id=actor and sh.status=(case when p_force then 'FORCE_CLOSED' else 'CLOSED' end)
     and (not p_force or sh.force_close_reason=btrim(p_reason)) then return sh; end if;
   raise exception 'SHIFT_ALREADY_CLOSED';
 end if;
 previous:=to_jsonb(sh); expected:=public.shift_expected_cash(sh.id);
 update public.cashier_shifts set status=case when p_force then 'FORCE_CLOSED' else 'CLOSED' end,
   closed_at=now(),closed_by_staff_id=actor,expected_cash=expected,actual_cash=actual,cash_difference=actual-expected,
   force_closed_at=case when p_force then now() end,force_closed_by_staff_id=case when p_force then actor end,
   force_close_reason=case when p_force then btrim(p_reason) end,updated_at=now() where id=sh.id returning * into sh;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,staff_session_id,movement_type,amount,reason)
 values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,actor,s.id,'SHIFT_CLOSE',0,case when p_force then btrim(p_reason) else 'Shift closed' end);
 perform public.write_pos_audit_diff(case when p_force then 'SHIFT_FORCE_CLOSED' else 'SHIFT_CLOSED' end,'CASHIER_SHIFT',sh.id,p_reason,previous,to_jsonb(sh));
 if sh.cash_difference<>0 then perform public.write_pos_audit_diff('SHIFT_VARIANCE','CASHIER_SHIFT',sh.id,p_reason,previous,to_jsonb(sh),jsonb_build_object('amount',sh.cash_difference)); end if;
 return sh;
end $$;

create or replace function public.close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_force boolean default false,p_reason text default null)
returns public.cashier_shifts language sql security definer set search_path=public as $$
 select public.finish_cashier_shift(p_shift_id,p_actual_cash,p_force,p_reason);
$$;
create or replace function public.force_close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_reason text)
returns public.cashier_shifts language sql security definer set search_path=public as $$
 select public.finish_cashier_shift(p_shift_id,p_actual_cash,true,p_reason);
$$;

create function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount numeric,p_reason text,p_idempotency_key text)
returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; result public.cash_movements;
 kind text:=upper(btrim(p_type)); amount numeric; reason text:=nullif(btrim(p_reason),''); key text:=nullif(btrim(p_idempotency_key),'');
begin
 s:=public.require_shift_operational_context();
 if not public.has_pos_permission(case when kind='NO_SALE_DRAWER_OPEN' then 'cash.drawer.open' else 'cash.movement' end)
   or kind not in ('CASH_IN','CASH_OUT','NO_SALE_DRAWER_OPEN','CASH_ADJUSTMENT') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if key is null or length(key)>128 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_CASH_MOVEMENT'; end if;
 amount:=round(p_amount,2);
 if amount<0 or amount>1000000 or (kind<>'NO_SALE_DRAWER_OPEN' and amount<=0) or (kind='NO_SALE_DRAWER_OPEN' and amount<>0) or reason is null or length(reason)>500 then raise exception 'INVALID_CASH_MOVEMENT'; end if;
 select * into sh from public.cashier_shifts where id=p_shift_id for update;
 if not found or sh.company_id<>s.company_id or sh.branch_id<>s.branch_id or sh.terminal_id<>s.terminal_id then raise exception 'SHIFT_NOT_FOUND'; end if;
 select * into result from public.cash_movements where shift_id=sh.id and idempotency_key=key;
 if found then
   if result.staff_id<>s.staff_id or result.movement_type<>kind or result.amount<>amount or result.reason<>reason then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
   return result;
 end if;
 if sh.status<>'OPEN' then raise exception 'SHIFT_ALREADY_CLOSED'; end if;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,staff_session_id,movement_type,amount,reason,idempotency_key)
 values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,s.staff_id,s.id,kind,amount,reason,key) returning * into result;
 perform public.write_pos_audit_diff(case when kind='NO_SALE_DRAWER_OPEN' then 'NO_SALE_DRAWER_OPENED' else kind end,'CASH_MOVEMENT',result.id,reason,null,to_jsonb(result));
 return result;
end $$;
create or replace function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount numeric,p_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public as $$
begin raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end $$;

create or replace function public.assign_order_cashier_shift() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts;
begin
 s:=public.require_shift_operational_context();
 select * into sh from public.cashier_shifts where terminal_id=s.terminal_id and branch_id=s.branch_id and company_id=s.company_id and status='OPEN' for share;
 if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
 new.cashier_shift_id:=sh.id;
 return new;
end $$;

create or replace function public.assign_payment_cashier_shift() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts;
begin
 -- Refund/void status changes preserve the original sale's drawer context.
 if tg_op='UPDATE' and old.status in ('PAID','REFUNDED','VOIDED') then
   new.cashier_shift_id:=old.cashier_shift_id; new.branch_id:=old.branch_id; new.terminal_id:=old.terminal_id; new.staff_session_id:=old.staff_session_id; new.user_id:=old.user_id;
   return new;
 end if;
 s:=public.require_shift_operational_context();
 if tg_op='UPDATE' then
   select * into sh from public.cashier_shifts where id=old.cashier_shift_id and status='OPEN' for share;
 else
   select * into sh from public.cashier_shifts where terminal_id=s.terminal_id and branch_id=s.branch_id and company_id=s.company_id and status='OPEN' for share;
 end if;
 if sh.id is null or sh.terminal_id<>s.terminal_id or sh.branch_id<>s.branch_id or sh.company_id<>s.company_id then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
 new.cashier_shift_id:=sh.id;
 return new;
end $$;
-- Do not rewrite completed payment context before the shift trigger runs.
do $$ declare definition text; begin
 select pg_get_functiondef('public.assign_payment_branch_id()'::regprocedure) into definition;
 definition:=replace(definition,' s:=public.require_terminal_staff_session();', ' if tg_op=''UPDATE'' and old.status in (''PAID'',''REFUNDED'',''VOIDED'') then return new; end if; s:=public.require_terminal_staff_session();');
 execute definition;
end $$;

create function public.assign_refund_shift_context() returns trigger
language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; order_branch uuid;
begin
 s:=public.require_shift_operational_context();
 select branch_id into order_branch from public.orders where id=new.order_id;
 if order_branch is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 select * into sh from public.cashier_shifts where terminal_id=s.terminal_id and company_id=s.company_id and branch_id=s.branch_id and status='OPEN' for share;
 if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
 new.cashier_shift_id:=sh.id; new.terminal_id:=s.terminal_id; new.branch_id:=s.branch_id; new.requested_by:=s.staff_id;
 return new;
end $$;
create trigger b_refund_shift_context before insert on public.refunds for each row execute function public.assign_refund_shift_context();

create function public.guard_shift_history() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then raise exception 'SHIFT_HISTORY_IMMUTABLE'; end if;
 if old.status<>'OPEN' or new.status not in ('OPEN','CLOSED','FORCE_CLOSED') or
   (to_jsonb(new)-array['status','closed_at','closed_by_staff_id','expected_cash','actual_cash','cash_difference','force_closed_at','force_closed_by_staff_id','force_close_reason','updated_at'])
   is distinct from (to_jsonb(old)-array['status','closed_at','closed_by_staff_id','expected_cash','actual_cash','cash_difference','force_closed_at','force_closed_by_staff_id','force_close_reason','updated_at'])
 then raise exception 'SHIFT_HISTORY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger guard_shift_history before update or delete on public.cashier_shifts for each row execute function public.guard_shift_history();

create function public.guard_shift_ledger() returns trigger
language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts;
begin
 if tg_op<>'INSERT' then raise exception 'CASH_LEDGER_IMMUTABLE'; end if;
 select * into sh from public.cashier_shifts where id=new.shift_id for share;
 if sh.id is null or sh.company_id<>new.company_id or sh.branch_id<>new.branch_id or sh.terminal_id<>new.terminal_id then raise exception 'SHIFT_CONTEXT_MISMATCH'; end if;
 if sh.status<>'OPEN' and new.movement_type<>'SHIFT_CLOSE' then raise exception 'SHIFT_ALREADY_CLOSED'; end if;
 return new;
end $$;
create trigger guard_shift_ledger before insert or update or delete on public.cash_movements for each row execute function public.guard_shift_ledger();

-- Preserve the existing ledger calculation, enriching its projection rather than duplicating totals.
do $$ declare definition text; begin
 select pg_get_functiondef('public.cashier_shift_summary(uuid)'::regprocedure) into definition;
 definition:=replace(definition, 'and status=''PAID'' group by payment_method', 'and status in (''PAID'',''REFUNDED'') group by payment_method');
 definition:=replace(definition, '''paymentBreakdown'',payments)', '''paymentBreakdown'',payments,''salesCount'',(select count(distinct order_id) from public.payments where cashier_shift_id=sh.id and status in (''PAID'',''REFUNDED'')),''refundCount'',(select count(*) from public.refunds where cashier_shift_id=sh.id and status=''COMPLETED''),''totalSales'',(select coalesce(sum(amount),0) from public.payments where cashier_shift_id=sh.id and status in (''PAID'',''REFUNDED'')),''staffName'',(select name from public.profiles where id=sh.opened_by_staff_id),''branchName'',(select name from public.branches where id=sh.branch_id),''terminalName'',(select name from public.pos_terminals where id=sh.terminal_id),''deviceName'',(select device_name from public.terminal_device_assignments where id=sh.device_assignment_id))');
 definition:=replace(definition,'where id=sh.device_assignment_id','where assignment_id=sh.device_assignment_id');
 execute definition;
end $$;

revoke all on function public.require_shift_operational_context(),public.shift_expected_cash(uuid),public.finish_cashier_shift(uuid,numeric,boolean,text),public.assign_refund_shift_context(),public.guard_shift_history(),public.guard_shift_ledger() from public,anon,authenticated;
revoke all on function public.record_cash_movement(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.record_cash_movement(uuid,text,numeric,text,text) to authenticated;
create function public.list_cashier_shift_history(p_filters jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
 if not public.has_pos_permission('cash.shift.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select coalesce(jsonb_agg(x.row order by x.opened_at desc),'[]'::jsonb) into result from (
   select sh.opened_at,to_jsonb(sh)||jsonb_build_object('branches',jsonb_build_object('code',b.code,'name',b.name),
     'pos_terminals',jsonb_build_object('terminal_code',t.terminal_code,'name',t.name),
     'opened_by',jsonb_build_object('name',p.name),'total_sales',(select coalesce(sum(amount),0) from public.payments where cashier_shift_id=sh.id and status in ('PAID','REFUNDED'))) as row
   from public.cashier_shifts sh join public.branches b on b.id=sh.branch_id join public.pos_terminals t on t.id=sh.terminal_id join public.profiles p on p.id=sh.opened_by_staff_id
   where sh.company_id=public.current_user_company_id() and public.can_access_branch(sh.branch_id)
     and (nullif(p_filters->>'shiftId','') is null or sh.id=(p_filters->>'shiftId')::uuid)
     and (nullif(p_filters->>'terminalId','') is null or sh.terminal_id=(p_filters->>'terminalId')::uuid)
     and (nullif(p_filters->>'branchId','') is null or sh.branch_id=(p_filters->>'branchId')::uuid)
     and (nullif(p_filters->>'staffId','') is null or sh.opened_by_staff_id=(p_filters->>'staffId')::uuid)
     and (nullif(p_filters->>'status','') is null or sh.status=p_filters->>'status')
     and (nullif(p_filters->>'from','') is null or sh.opened_at>=(p_filters->>'from')::timestamptz)
     and (nullif(p_filters->>'to','') is null or sh.opened_at<(p_filters->>'to')::timestamptz)
   order by sh.opened_at desc limit 200
 ) x;
 return result;
end $$;
revoke all on function public.list_cashier_shift_history(jsonb) from public,anon;
grant execute on function public.list_cashier_shift_history(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
