begin;

insert into public.permissions(code,module,description) values
 ('cash.shift.open','cash','Open a cashier shift'),('cash.shift.close','cash','Close a cashier shift'),('cash.shift.view','cash','View cashier shifts'),('cash.shift.force_close','cash','Force close a cashier shift'),('cash.movement','cash','Record cash in and cash out'),('cash.drawer.open','cash','Record a no-sale cash drawer opening')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('cash.shift.open','cash.shift.close','cash.shift.view','cash.shift.force_close','cash.movement','cash.drawer.open') where r.name='ADMIN'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('cash.shift.open','cash.shift.close','cash.shift.view','cash.shift.force_close','cash.movement','cash.drawer.open') where r.name='MANAGER'
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('cash.shift.open','cash.shift.close','cash.shift.view') where r.name='WAITER'
on conflict do nothing;

create sequence if not exists public.cash_shift_number_seq;
create table if not exists public.cashier_shifts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
 shift_number text not null unique,
 opened_by_staff_id uuid not null references public.profiles(id) on delete restrict,
 opened_by_session_id uuid references public.terminal_staff_sessions(id) on delete restrict,
 opened_at timestamptz not null default now(),
 opening_float numeric(14,2) not null check(opening_float>=0),
 status text not null default 'OPEN' check(status in ('OPEN','CLOSED','FORCE_CLOSED')),
 closed_at timestamptz, closed_by_staff_id uuid references public.profiles(id) on delete restrict,
 expected_cash numeric(14,2), actual_cash numeric(14,2), cash_difference numeric(14,2),
 force_closed_at timestamptz, force_closed_by_staff_id uuid references public.profiles(id) on delete restrict, force_close_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((status='OPEN' and closed_at is null and actual_cash is null) or (status in ('CLOSED','FORCE_CLOSED') and closed_at is not null and actual_cash is not null)),
 check(status<>'FORCE_CLOSED' or (force_closed_by_staff_id is not null and nullif(trim(force_close_reason),'') is not null))
);
create unique index if not exists one_open_cashier_shift_per_terminal on public.cashier_shifts(terminal_id) where status='OPEN';
create index if not exists cashier_shifts_branch_opened_idx on public.cashier_shifts(branch_id,opened_at desc);

create table if not exists public.cash_movements (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict, branch_id uuid not null references public.branches(id) on delete restrict,
 terminal_id uuid not null references public.pos_terminals(id) on delete restrict, shift_id uuid not null references public.cashier_shifts(id) on delete restrict,
 staff_id uuid references public.profiles(id) on delete restrict, movement_type text not null check(movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_REFUND','CASH_IN','CASH_OUT','NO_SALE_DRAWER_OPEN','CASH_ADJUSTMENT','SHIFT_CLOSE')),
 amount numeric(14,2) not null default 0, reason text, payment_id uuid references public.payments(id) on delete restrict, order_id uuid references public.orders(id) on delete restrict,
 created_at timestamptz not null default now(), check(amount>=0)
);
create unique index if not exists cash_movement_payment_once on public.cash_movements(payment_id) where payment_id is not null;
create index if not exists cash_movements_shift_created_idx on public.cash_movements(shift_id,created_at);

alter table public.orders add column if not exists cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict;
alter table public.payments add column if not exists cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict;
create index if not exists orders_cashier_shift_idx on public.orders(cashier_shift_id) where cashier_shift_id is not null;
create index if not exists payments_cashier_shift_idx on public.payments(cashier_shift_id) where cashier_shift_id is not null;

alter table public.cashier_shifts enable row level security;
alter table public.cash_movements enable row level security;
create policy cashier_shift_read_scope on public.cashier_shifts for select to authenticated using(public.can_access_branch(branch_id) and public.has_pos_permission('cash.shift.view'));
create policy cash_movement_read_scope on public.cash_movements for select to authenticated using(public.can_access_branch(branch_id) and public.has_pos_permission('cash.shift.view'));
revoke insert,update,delete on public.cashier_shifts,public.cash_movements from authenticated;

create or replace function public.current_terminal_cash_shift() returns public.cashier_shifts language plpgsql stable security definer set search_path=public as $$
declare s public.terminal_staff_sessions; result public.cashier_shifts;
begin
 s:=public.require_terminal_staff_session();
 select * into result from public.cashier_shifts where terminal_id=s.terminal_id and branch_id=s.branch_id and company_id=s.company_id and status='OPEN';
 return result;
end $$;

create or replace function public.open_cashier_shift(p_opening_float numeric) returns public.cashier_shifts language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; result public.cashier_shifts; branch_code text;
begin
 if not public.has_pos_permission('cash.shift.open') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_opening_float is null or p_opening_float<0 or p_opening_float>100000 then raise exception 'INVALID_OPENING_FLOAT'; end if;
 s:=public.require_terminal_staff_session();
 select code into branch_code from public.branches where id=s.branch_id and status='ACTIVE'; if branch_code is null then raise exception 'BRANCH_INACTIVE'; end if;
 insert into public.cashier_shifts(company_id,branch_id,terminal_id,shift_number,opened_by_staff_id,opened_by_session_id,opening_float)
 values(s.company_id,s.branch_id,s.terminal_id,'SHIFT-'||branch_code||'-'||to_char(now() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||lpad(nextval('public.cash_shift_number_seq')::text,6,'0'),s.staff_id,s.id,round(p_opening_float,2)) returning * into result;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason) values(s.company_id,s.branch_id,s.terminal_id,result.id,s.staff_id,'OPENING_FLOAT',result.opening_float,'Opening float');
 perform public.write_pos_audit_diff('SHIFT_OPENED','CASHIER_SHIFT',result.id,null,null,to_jsonb(result));
 return result;
exception when unique_violation then raise exception 'SHIFT_ALREADY_OPEN';
end $$;

create or replace function public.cashier_shift_summary(p_shift_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sh public.cashier_shifts; expected numeric(14,2); movements jsonb; payments jsonb;
begin
 select * into sh from public.cashier_shifts where id=p_shift_id; if not found or not public.can_access_branch(sh.branch_id) or not public.has_pos_permission('cash.shift.view') then raise exception 'SHIFT_NOT_FOUND'; end if;
 select coalesce(sum(case when movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_IN','CASH_ADJUSTMENT') then amount when movement_type in ('CASH_REFUND','CASH_OUT') then -amount else 0 end),0) into expected from public.cash_movements where shift_id=sh.id;
 select coalesce(jsonb_agg(jsonb_build_object('type',movement_type,'amount',amount,'reason',reason,'createdAt',created_at) order by created_at),'[]') into movements from public.cash_movements where shift_id=sh.id;
 select coalesce(jsonb_object_agg(payment_method,total),'{}') into payments from (select payment_method,sum(amount) total from public.payments where cashier_shift_id=sh.id and status='PAID' group by payment_method) x;
 return jsonb_build_object('shift',to_jsonb(sh),'expectedCash',round(expected,2),'movements',movements,'paymentBreakdown',payments);
end $$;

create or replace function public.close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_force boolean default false,p_reason text default null) returns public.cashier_shifts language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; expected numeric(14,2); force_allowed boolean;
begin
 if p_actual_cash is null or p_actual_cash<0 or p_actual_cash>1000000 then raise exception 'INVALID_ACTUAL_CASH'; end if;
 s:=public.require_terminal_staff_session();
 select * into sh from public.cashier_shifts where id=p_shift_id for update;
 if not found or sh.company_id<>s.company_id or sh.branch_id<>s.branch_id or sh.terminal_id<>s.terminal_id then raise exception 'SHIFT_NOT_FOUND'; end if;
 if sh.status<>'OPEN' then raise exception 'SHIFT_ALREADY_CLOSED'; end if;
 force_allowed:=p_force and public.has_pos_permission('cash.shift.force_close');
 if p_force and (not force_allowed or nullif(trim(coalesce(p_reason,'')),'') is null) then raise exception 'FORCE_CLOSE_REASON_REQUIRED'; end if;
 if not p_force and not public.has_pos_permission('cash.shift.close') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select coalesce(sum(case when movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_IN','CASH_ADJUSTMENT') then amount when movement_type in ('CASH_REFUND','CASH_OUT') then -amount else 0 end),0) into expected from public.cash_movements where shift_id=sh.id;
 update public.cashier_shifts set status=case when p_force then 'FORCE_CLOSED' else 'CLOSED' end,closed_at=now(),closed_by_staff_id=s.staff_id,expected_cash=round(expected,2),actual_cash=round(p_actual_cash,2),cash_difference=round(p_actual_cash-expected,2),force_closed_at=case when p_force then now() end,force_closed_by_staff_id=case when p_force then s.staff_id end,force_close_reason=case when p_force then trim(p_reason) end,updated_at=now() where id=sh.id returning * into sh;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason) values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,s.staff_id,'SHIFT_CLOSE',0,case when p_force then trim(p_reason) else 'Shift closed' end);
 perform public.write_pos_audit_diff(case when p_force then 'SHIFT_FORCE_CLOSED' else 'SHIFT_CLOSED' end,'CASHIER_SHIFT',sh.id,case when p_force then trim(p_reason) end,null,to_jsonb(sh));
 return sh;
end $$;

create or replace function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount numeric,p_reason text) returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; result public.cash_movements; kind text:=upper(trim(p_type));
begin
 if not public.has_pos_permission('cash.movement') or kind not in ('CASH_IN','CASH_OUT','NO_SALE_DRAWER_OPEN','CASH_ADJUSTMENT') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_amount is null or p_amount<0 or (kind<>'NO_SALE_DRAWER_OPEN' and p_amount=0) or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'INVALID_CASH_MOVEMENT'; end if;
 s:=public.require_terminal_staff_session(); select * into sh from public.cashier_shifts where id=p_shift_id and status='OPEN' for update;
 if sh.id is null or sh.terminal_id<>s.terminal_id or sh.branch_id<>s.branch_id then raise exception 'SHIFT_NOT_FOUND'; end if;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason) values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,s.staff_id,kind,round(p_amount,2),trim(p_reason)) returning * into result;
 perform public.write_pos_audit_diff(case when kind='NO_SALE_DRAWER_OPEN' then 'NO_SALE_DRAWER_OPENED' else kind end,'CASH_MOVEMENT',result.id,trim(p_reason),null,to_jsonb(result)); return result;
end $$;

create or replace function public.force_close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_reason text) returns public.cashier_shifts language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts; expected numeric(14,2);
begin
 if not public.has_pos_permission('cash.shift.force_close') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if p_actual_cash is null or p_actual_cash<0 or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'FORCE_CLOSE_REASON_REQUIRED'; end if;
 select * into sh from public.cashier_shifts where id=p_shift_id for update;
 if not found or not public.can_access_branch(sh.branch_id) then raise exception 'SHIFT_NOT_FOUND'; end if;
 if sh.status<>'OPEN' then raise exception 'SHIFT_ALREADY_CLOSED'; end if;
 select coalesce(sum(case when movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_IN','CASH_ADJUSTMENT') then amount when movement_type in ('CASH_REFUND','CASH_OUT') then -amount else 0 end),0) into expected from public.cash_movements where shift_id=sh.id;
 update public.cashier_shifts set status='FORCE_CLOSED',closed_at=now(),closed_by_staff_id=auth.uid(),expected_cash=round(expected,2),actual_cash=round(p_actual_cash,2),cash_difference=round(p_actual_cash-expected,2),force_closed_at=now(),force_closed_by_staff_id=auth.uid(),force_close_reason=trim(p_reason),updated_at=now() where id=sh.id returning * into sh;
 insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason) values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,auth.uid(),'SHIFT_CLOSE',0,trim(p_reason));
 perform public.write_pos_audit_diff('SHIFT_FORCE_CLOSED','CASHIER_SHIFT',sh.id,trim(p_reason),null,to_jsonb(sh)); return sh;
end $$;

create or replace function public.assign_order_cashier_shift() returns trigger language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts;
begin
 if new.terminal_id is not null then select * into sh from public.cashier_shifts where terminal_id=new.terminal_id and branch_id=new.branch_id and status='OPEN'; if sh.id is not null then new.cashier_shift_id:=sh.id; end if; end if; return new;
end $$;
drop trigger if exists b_order_cashier_shift_context on public.orders;
create trigger b_order_cashier_shift_context before insert on public.orders for each row execute function public.assign_order_cashier_shift();

create or replace function public.assign_payment_cashier_shift() returns trigger language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts;
begin
 if new.status in ('PAID','SUCCESS') then
   select * into sh from public.cashier_shifts where terminal_id=new.terminal_id and branch_id=new.branch_id and company_id=(select company_id from public.branches where id=new.branch_id) and status='OPEN' for share;
   if new.payment_method='CASH' and sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
   if sh.id is not null then new.cashier_shift_id:=sh.id; end if;
 end if;
 return new;
end $$;
drop trigger if exists b_payment_cashier_shift_context on public.payments;
create trigger b_payment_cashier_shift_context before insert or update of status on public.payments for each row execute function public.assign_payment_cashier_shift();

create or replace function public.record_cash_payment_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts;
begin
 if new.status='PAID' and new.payment_method='CASH' and new.cashier_shift_id is not null then
   select * into sh from public.cashier_shifts where id=new.cashier_shift_id and status='OPEN'; if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
   insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,payment_id,order_id,reason) values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,new.user_id,'CASH_SALE',new.amount,new.id,new.order_id,'Cash payment');
 end if;
 return new;
end $$;
drop trigger if exists z_cash_payment_movement on public.payments;
create trigger z_cash_payment_movement after insert or update of status on public.payments for each row execute function public.record_cash_payment_movement();

revoke all on function public.current_terminal_cash_shift(),public.open_cashier_shift(numeric),public.cashier_shift_summary(uuid),public.close_cashier_shift(uuid,numeric,boolean,text),public.force_close_cashier_shift(uuid,numeric,text),public.record_cash_movement(uuid,text,numeric,text) from public,anon;
grant execute on function public.current_terminal_cash_shift(),public.open_cashier_shift(numeric),public.cashier_shift_summary(uuid),public.close_cashier_shift(uuid,numeric,boolean,text),public.force_close_cashier_shift(uuid,numeric,text),public.record_cash_movement(uuid,text,numeric,text) to authenticated;
commit;
