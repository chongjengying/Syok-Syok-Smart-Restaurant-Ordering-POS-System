begin;

-- Keep historical payment timestamps meaningful: only successful payments have
-- a paid_at value. Existing paid/refunded payments retain their original time.
update public.payments
set paid_at = null
where status in ('PENDING', 'PROCESSING', 'FAILED', 'CANCELLED');

alter table public.payments alter column paid_at drop default;

-- Electronic providers are intentionally unavailable in this deployment. This
-- database constraint closes the direct-RPC bypass until a verified provider
-- callback is implemented in a future migration.
alter table public.payments drop constraint if exists payments_paid_method_supported_check;
alter table public.payments
  add constraint payments_paid_method_supported_check
  check (status <> 'PAID' or payment_method = 'CASH') not valid;
-- Kept NOT VALID intentionally: historical local rows include simulated
-- electronic payments. PostgreSQL still enforces this constraint for every new
-- or updated row without rewriting or falsifying those historical records.

-- The six-argument overload trusts caller-supplied provider references. Keep it
-- internal so clients can only use the tender-aware boundary used by Edge.
revoke all on function public.complete_payment(uuid,text,numeric,text,text,text)
from public, anon, authenticated;

-- Add receipt numbers to the existing transaction-safe daily counter without
-- changing UUID primary keys or historical business identifiers.
alter table public.pos_business_number_counters
  drop constraint if exists pos_business_number_counters_prefix_check;
alter table public.pos_business_number_counters
  add constraint pos_business_number_counters_prefix_check
  check (prefix in ('ORD', 'KB', 'PAY', 'RCP', 'REF'));

create or replace function public.next_pos_business_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_prefix text := upper(btrim(coalesce(p_prefix, '')));
  malaysia_business_date date := (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
  next_value bigint;
begin
  if normalized_prefix not in ('ORD', 'KB', 'PAY', 'RCP', 'REF') then
    raise exception 'INVALID_BUSINESS_NUMBER_PREFIX';
  end if;

  insert into public.pos_business_number_counters(prefix, business_date, last_value)
  values (normalized_prefix, malaysia_business_date, 1)
  on conflict (prefix, business_date) do update
  set last_value = public.pos_business_number_counters.last_value + 1
  returning last_value into next_value;

  if next_value > 999999 then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  return normalized_prefix || '-' || to_char(malaysia_business_date, 'YYYYMMDD')
    || '-' || lpad(next_value::text, 6, '0');
end;
$$;
revoke all on function public.next_pos_business_number(text) from public, anon, authenticated;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number varchar(32) not null unique,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null check (discount >= 0),
  tax numeric(12,2) not null check (tax >= 0),
  service_charge numeric(12,2) not null check (service_charge >= 0),
  total numeric(12,2) not null check (total >= 0),
  paid_amount numeric(12,2) not null check (paid_amount >= total),
  status varchar(12) not null default 'ISSUED' check (status = 'ISSUED'),
  issued_at timestamptz not null default now(),
  constraint receipts_number_format_check
    check (receipt_number ~ '^RCP-[0-9]{8}-[0-9]{6}$')
);

create index idx_receipts_issued_at on public.receipts(issued_at desc);
alter table public.receipts enable row level security;
create policy finance_staff_read_receipts on public.receipts
for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER'));
revoke all on public.receipts from public, anon, authenticated;
grant select on public.receipts to authenticated;
grant all on public.receipts to service_role;

create or replace function public.issue_paid_order_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_actor uuid;
  successful_total numeric(12,2);
begin
  if new.payment_status <> 'PAID'
     or old.payment_status is not distinct from new.payment_status then
    return new;
  end if;

  select p.user_id, round(sum(p.amount), 2)
  into payment_actor, successful_total
  from public.payments p
  where p.order_id = new.id and p.status = 'PAID'
  group by p.user_id
  order by max(p.paid_at) desc
  limit 1;

  if payment_actor is null or coalesce(successful_total, 0) < round(new.total, 2) then
    raise exception 'PAID_ORDER_REQUIRES_SUCCESSFUL_PAYMENT';
  end if;

  insert into public.receipts (
    receipt_number, order_id, issued_by, subtotal, discount, tax,
    service_charge, total, paid_amount
  ) values (
    public.next_pos_business_number('RCP'), new.id, payment_actor,
    new.subtotal, new.discount, new.tax, new.service_charge, new.total,
    successful_total
  ) on conflict (order_id) do nothing;
  return new;
end;
$$;
revoke all on function public.issue_paid_order_receipt() from public, anon, authenticated;

drop trigger if exists trg_issue_paid_order_receipt on public.orders;
create trigger trg_issue_paid_order_receipt
after update of payment_status on public.orders
for each row execute function public.issue_paid_order_receipt();

-- Backfill immutable receipt snapshots for already-paid orders. Each row is
-- checked against recorded successful payments before a receipt is created.
do $$
declare
  paid_order record;
begin
  for paid_order in
    select o.*, p.user_id as payment_actor, p.paid_total
    from public.orders o
    join lateral (
      select max(user_id::text)::uuid as user_id, round(sum(amount), 2) as paid_total
      from public.payments
      where order_id = o.id and status = 'PAID'
    ) p on p.paid_total >= round(o.total, 2)
    where o.payment_status = 'PAID'
      and not exists (select 1 from public.receipts r where r.order_id = o.id)
    order by o.created_at, o.id
  loop
    insert into public.receipts (
      receipt_number, order_id, issued_by, subtotal, discount, tax,
      service_charge, total, paid_amount
    ) values (
      public.next_pos_business_number('RCP'), paid_order.id,
      paid_order.payment_actor, paid_order.subtotal, paid_order.discount,
      paid_order.tax, paid_order.service_charge, paid_order.total,
      paid_order.paid_total
    );
  end loop;
end;
$$;

-- Direct view access allowed authenticated callers to rely on owner evaluation.
-- Reports now pass through an explicit role-checked database boundary.
revoke all on public.daily_sales_report from public, anon, authenticated;
grant select on public.daily_sales_report to service_role;

create or replace function public.get_daily_sales_report(
  p_date_from date default null,
  p_date_to date default null
)
returns setof public.daily_sales_report
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if public.current_pos_role() not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  return query
  select report.* from public.daily_sales_report report
  where (p_date_from is null or report.report_date >= p_date_from)
    and (p_date_to is null or report.report_date <= p_date_to)
  order by report.paid_at desc;
end;
$$;
revoke all on function public.get_daily_sales_report(date,date) from public, anon;
grant execute on function public.get_daily_sales_report(date,date) to authenticated;

-- Splitting an order does not mean money has been collected. Payment status is
-- derived from bill allocations and remains UNPAID until the first collection.
create or replace function public.guard_pos_order_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.payment_status = 'PARTIALLY_PAID'
     and exists (select 1 from public.order_bills where order_id = new.id)
     and not exists (
       select 1 from public.order_bills where order_id = new.id and paid_amount > 0
     ) then
    new.payment_status := 'UNPAID';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_pos_order_payment_status() from public, anon, authenticated;

drop trigger if exists trg_guard_pos_order_payment_status on public.orders;
create trigger trg_guard_pos_order_payment_status
before update of payment_status on public.orders
for each row execute function public.guard_pos_order_payment_status();

create or replace function public.sync_pos_bill_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order_id uuid := coalesce(new.order_id, old.order_id);
  derived_status text;
begin
  select case
    when bool_and(status = 'PAID') then 'PAID'
    when bool_or(paid_amount > 0) then 'PARTIALLY_PAID'
    else 'UNPAID'
  end into derived_status
  from public.order_bills where order_id = target_order_id;

  if derived_status is not null then
    update public.orders set payment_status = derived_status
    where id = target_order_id and payment_status <> 'REFUNDED';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.sync_pos_bill_payment_status() from public, anon, authenticated;

drop trigger if exists trg_sync_pos_bill_payment_status on public.order_bills;
create trigger trg_sync_pos_bill_payment_status
after insert or update of paid_amount, status or delete on public.order_bills
for each row execute function public.sync_pos_bill_payment_status();

create or replace function public.complete_pos_bill_payment(
  p_bill_id uuid,
  p_payments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  role_name text;
  bill public.order_bills%rowtype;
  payment jsonb;
  method text;
  amount numeric(12,2);
  received numeric(12,2);
  paid numeric(12,2) := 0;
  remaining numeric(12,2);
  order_paid boolean;
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 96), '');
  fingerprint text;
  payment_index integer := 0;
  replay_fingerprint text;
begin
  select p.role_name into role_name from public.profiles p
  where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'PAYMENTS_REQUIRED';
  end if;

  fingerprint := md5(p_bill_id::text || '|' || p_payments::text);
  perform pg_advisory_xact_lock(hashtextextended('bill-payment:' || normalized_key, 0));
  select * into bill from public.order_bills where id = p_bill_id for update;
  if not found then raise exception 'BILL_NOT_FOUND'; end if;

  select request_fingerprint into replay_fingerprint
  from public.payments
  where bill_id = bill.id and idempotency_key like normalized_key || ':%'
  order by created_at limit 1;
  if replay_fingerprint is not null then
    if replay_fingerprint <> fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return jsonb_build_object(
      'billId', bill.id, 'paidAmount', bill.paid_amount,
      'remainingAmount', round(bill.total - bill.paid_amount, 2),
      'orderPaid', bill.status = 'PAID' and not exists (
        select 1 from public.order_bills where order_id = bill.order_id and status <> 'PAID'
      ), 'replayed', true
    );
  end if;
  if bill.status = 'PAID' then raise exception 'BILL_ALREADY_PAID'; end if;

  for payment in select * from jsonb_array_elements(p_payments) loop
    payment_index := payment_index + 1;
    method := upper(coalesce(payment->>'method',''));
    begin
      amount := round((payment->>'amount')::numeric, 2);
      received := round(coalesce((payment->>'receivedAmount')::numeric, amount), 2);
    exception when others then raise exception 'INVALID_PAYMENT';
    end;
    if method <> 'CASH' or amount <= 0 then raise exception 'INVALID_PAYMENT'; end if;
    if received < amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
    if paid + amount > round(bill.total - bill.paid_amount, 2) then
      raise exception 'PAYMENT_EXCEEDS_BALANCE';
    end if;
    paid := paid + amount;
    insert into public.payments(
      order_id, bill_id, user_id, payment_method, amount, received_amount,
      change_amount, reference, status, paid_at, idempotency_key, request_fingerprint
    ) values (
      bill.order_id, bill.id, caller_id, method, amount, received,
      received - amount, 'BILL-' || bill.id::text, 'PAID', now(),
      normalized_key || ':' || payment_index::text, fingerprint
    );
  end loop;

  remaining := round(bill.total - bill.paid_amount - paid, 2);
  update public.order_bills
  set paid_amount = paid_amount + paid,
      status = case when remaining = 0 then 'PAID' else 'OPEN' end,
      paid_at = case when remaining = 0 then now() else null end
  where id = bill.id
  returning * into bill;

  select not exists(
    select 1 from public.order_bills where order_id = bill.order_id and status <> 'PAID'
  ) into order_paid;
  return jsonb_build_object(
    'billId', bill.id, 'paidAmount', bill.paid_amount,
    'remainingAmount', remaining, 'orderPaid', order_paid, 'replayed', false
  );
end;
$$;
revoke all on function public.complete_pos_bill_payment(uuid,jsonb,text) from public, anon;
grant execute on function public.complete_pos_bill_payment(uuid,jsonb,text) to authenticated;

-- Correct legacy split rows that were marked partial before any collection.
update public.orders o set payment_status = 'UNPAID'
where o.payment_status = 'PARTIALLY_PAID'
  and exists (select 1 from public.order_bills b where b.order_id = o.id)
  and not exists (select 1 from public.order_bills b where b.order_id = o.id and b.paid_amount > 0);

-- Confirmed cross-field invariant: takeaway never owns a restaurant table.
alter table public.orders drop constraint if exists orders_takeaway_without_table_check;
alter table public.orders add constraint orders_takeaway_without_table_check
check (dining_mode <> 'takeaway' or restaurant_table_id is null) not valid;
alter table public.orders validate constraint orders_takeaway_without_table_check;

-- Foreign-key lookup indexes used by deletion checks and audit queries.
create index if not exists idx_order_submissions_order_id on public.order_submissions(order_id);
create index if not exists idx_order_bills_created_by on public.order_bills(created_by);
create index if not exists idx_order_items_voided_by on public.order_items(voided_by) where voided_by is not null;
create index if not exists idx_order_status_history_changed_by on public.order_status_history(changed_by) where changed_by is not null;
create index if not exists idx_kitchen_orders_order_id on public.kitchen_orders(order_id);
create index if not exists idx_kitchen_orders_station_id on public.kitchen_orders(station_id);
create index if not exists idx_kitchen_order_items_order_id on public.kitchen_order_items(kitchen_order_id);
create index if not exists idx_kitchen_order_items_item_id on public.kitchen_order_items(order_item_id);

revoke all on function public.normalize_pos_table_number() from public, anon, authenticated;

commit;
