begin;

-- Successful collections remain rows in the existing payments ledger.  The
-- split type describes how the authoritative applied amount was selected.
alter table public.payments
  add column if not exists split_type varchar(10) not null default 'FULL';

alter table public.payments drop constraint if exists payments_split_type_check;
alter table public.payments add constraint payments_split_type_check
  check (split_type in ('FULL', 'EQUAL', 'AMOUNT', 'ITEM'));

-- A paid order may legitimately have several successful payment rows.  Order
-- row locking in process_pos_split_payment is the overpayment boundary.
drop index if exists public.idx_payments_one_paid_per_order;

create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, order_item_id)
);

create index if not exists idx_payment_items_order_item
  on public.payment_items(order_item_id);

alter table public.payment_items enable row level security;
drop policy if exists finance_staff_read_payment_items on public.payment_items;
create policy finance_staff_read_payment_items
on public.payment_items for select to authenticated
using (
  public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER')
  and exists (
    select 1
    from public.payments payment
    where payment.id = payment_items.payment_id
      and public.can_read_pos_order(payment.order_id)
  )
);

revoke all on public.payment_items from public, anon, authenticated;
grant select on public.payment_items to authenticated;
grant all on public.payment_items to service_role;

create or replace function public.get_pos_payment_summary(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  ord public.orders%rowtype;
  successful_total numeric(12, 2);
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role_name into caller_role
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(caller_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into ord from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select round(coalesce(sum(amount), 0), 2) into successful_total
  from public.payments where order_id = ord.id and status = 'PAID';

  return jsonb_build_object(
    'orderId', ord.id,
    'orderNumber', ord.order_number,
    'orderTotal', round(ord.total, 2),
    'paidAmount', successful_total,
    'remainingAmount', greatest(round(ord.total - successful_total, 2), 0),
    'paymentStatus', case
      when successful_total <= 0 then 'UNPAID'
      when successful_total < round(ord.total, 2) then 'PARTIALLY_PAID'
      else 'PAID'
    end,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', payment.id,
        'paymentNumber', payment.payment_number,
        'paymentMethod', payment.payment_method,
        'amount', payment.amount,
        'receivedAmount', payment.received_amount,
        'changeAmount', payment.change_amount,
        'splitType', payment.split_type,
        'status', payment.status,
        'paidAt', payment.paid_at,
        'cashier', profile.name,
        'paidTotalAfter', payment.running_total,
        'remainingAfter', greatest(round(ord.total - payment.running_total, 2), 0)
      ) order by payment.paid_at, payment.id)
      from (
        select ledger.*,
          round(sum(ledger.amount) over (order by ledger.paid_at, ledger.id), 2) as running_total
        from public.payments ledger
        where ledger.order_id = ord.id and ledger.status = 'PAID'
      ) payment
      left join public.profiles profile on profile.id = payment.user_id
    ), '[]'::jsonb),
    'items', coalesce((
      with item_values as (
        select item.*,
          round(item.subtotal * 100)::bigint as item_cents,
          round(ord.total * 100)::bigint as order_cents,
          sum(round(item.subtotal * 100)::bigint) over () as basis_cents,
          row_number() over (order by item.id) as item_position,
          count(*) over () as item_count
        from public.order_items item
        where item.order_id = ord.id and item.item_status <> 'VOIDED'
      ), valued as (
        select item_values.*,
          case
            when basis_cents <= 0 then 0
            when item_position = item_count then order_cents - coalesce(sum(floor(order_cents * item_cents::numeric / basis_cents)) over (order by item_position rows between unbounded preceding and 1 preceding), 0)
            else floor(order_cents * item_cents::numeric / basis_cents)
          end::bigint as allocated_cents
        from item_values
      )
      select jsonb_agg(jsonb_build_object(
        'orderItemId', valued.id,
        'name', valued.product_name_snapshot,
        'quantity', valued.quantity,
        'allocatedQuantity', coalesce(allocation.quantity, 0),
        'remainingQuantity', valued.quantity - coalesce(allocation.quantity, 0),
        'remainingAmount', round((
          valued.allocated_cents
          - coalesce(allocation.amount_cents, 0)
        ) / 100.0, 2),
        'remainingUnitAmounts', coalesce((
          select jsonb_agg(round((
            floor(valued.allocated_cents::numeric / valued.quantity)
            + case when unit_number > valued.quantity - (valued.allocated_cents % valued.quantity) then 1 else 0 end
          ) / 100.0, 2) order by unit_number)
          from generate_series(coalesce(allocation.quantity, 0) + 1, valued.quantity) as units(unit_number)
        ), '[]'::jsonb)
      ) order by valued.created_at, valued.id)
      from valued
      left join lateral (
        select sum(payment_item.quantity)::integer as quantity,
               round(sum(payment_item.amount) * 100)::bigint as amount_cents
        from public.payment_items payment_item
        join public.payments payment on payment.id = payment_item.payment_id
        where payment_item.order_item_id = valued.id and payment.status = 'PAID'
      ) allocation on true
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_pos_payment_summary(uuid) from public, anon;
grant execute on function public.get_pos_payment_summary(uuid) to authenticated;

create or replace function public.process_pos_split_payment(
  p_order_id uuid,
  p_split_type text,
  p_payment_method text,
  p_amount numeric,
  p_received_amount numeric,
  p_item_allocations jsonb,
  p_bill_id uuid,
  p_idempotency_key text,
  p_provider text default null,
  p_transaction_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role text;
  ord public.orders%rowtype;
  existing_payment public.payments%rowtype;
  created_payment public.payments%rowtype;
  equal_bill public.order_bills%rowtype;
  normalized_type text := upper(btrim(coalesce(p_split_type, '')));
  normalized_method text := upper(btrim(coalesce(p_payment_method, '')));
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  requested_amount numeric(12, 2);
  received_amount numeric(12, 2);
  successful_total numeric(12, 2);
  outstanding numeric(12, 2);
  applied_amount numeric(12, 2) := 0;
  new_paid_total numeric(12, 2);
  new_payment_status text;
  fingerprint text;
  allocation jsonb;
  allocation_item public.order_items%rowtype;
  requested_quantity integer;
  already_allocated integer;
  line_cents bigint;
  line_base_cents bigint;
  line_remainder integer;
  allocation_cents bigint;
  basis_cents bigint;
  order_cents bigint;
  item_position integer;
  item_count integer;
begin
  if caller_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role_name into caller_role from public.profiles
  where id = caller_id and status = 'ACTIVE';
  if coalesce(caller_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_type not in ('FULL', 'EQUAL', 'AMOUNT', 'ITEM') then
    raise exception 'INVALID_SPLIT_TYPE';
  end if;
  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  fingerprint := md5(
    p_order_id::text || '|' || normalized_type || '|' || normalized_method || '|'
    || coalesce(round(p_amount, 2)::text, '') || '|'
    || coalesce(round(p_received_amount, 2)::text, '') || '|'
    || coalesce(p_item_allocations::text, '[]') || '|' || coalesce(p_bill_id::text, '')
  );

  perform pg_advisory_xact_lock(hashtextextended('payment:' || normalized_key, 0));
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into existing_payment from public.payments
  where idempotency_key = normalized_key for update;
  if found then
    if existing_payment.order_id <> ord.id
       or existing_payment.request_fingerprint is distinct from fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return jsonb_build_object(
      'payment', to_jsonb(existing_payment),
      'summary', public.get_pos_payment_summary(ord.id),
      'replayed', true
    );
  end if;

  if ord.payment_status = 'REFUNDED' then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;
  if exists (select 1 from public.order_items where order_id = ord.id and item_status = 'DRAFT') then
    raise exception 'ORDER_HAS_UNSENT_ITEMS';
  end if;

  if ord.dining_mode = 'dine-in' then
    perform 1 from public.restaurant_tables
    where id = ord.restaurant_table_id and is_active for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  end if;

  select round(coalesce(sum(amount), 0), 2) into successful_total
  from public.payments where order_id = ord.id and status = 'PAID';
  outstanding := round(ord.total - successful_total, 2);
  if outstanding <= 0 then raise exception 'ORDER_ALREADY_PAID'; end if;

  if normalized_type = 'EQUAL' then
    if p_bill_id is null then raise exception 'EQUAL_SPLIT_BILL_REQUIRED'; end if;
    select * into equal_bill from public.order_bills
    where id = p_bill_id and order_id = ord.id for update;
    if not found then raise exception 'BILL_NOT_FOUND'; end if;
    if equal_bill.status = 'PAID' then raise exception 'BILL_ALREADY_PAID'; end if;
    applied_amount := round(equal_bill.total - equal_bill.paid_amount, 2);
  elsif normalized_type = 'ITEM' then
    if exists (select 1 from public.order_bills where order_id = ord.id) then
      raise exception 'ORDER_HAS_LEGACY_BILL_SPLIT';
    end if;
    if coalesce(jsonb_typeof(p_item_allocations), 'null') <> 'array'
       or jsonb_array_length(p_item_allocations) = 0 then
      raise exception 'ITEM_ALLOCATIONS_REQUIRED';
    end if;

    select round(sum(subtotal) * 100)::bigint, round(ord.total * 100)::bigint
    into basis_cents, order_cents
    from public.order_items
    where order_id = ord.id and item_status <> 'VOIDED';
    if coalesce(basis_cents, 0) <= 0 then raise exception 'INVALID_ORDER_TOTAL'; end if;

    for allocation in select value from jsonb_array_elements(p_item_allocations)
    loop
      begin
        requested_quantity := (allocation->>'quantity')::integer;
      exception when others then raise exception 'INVALID_ITEM_QUANTITY';
      end;
      if requested_quantity <= 0 then raise exception 'INVALID_ITEM_QUANTITY'; end if;

      select * into allocation_item from public.order_items
      where id = (allocation->>'orderItemId')::uuid
        and order_id = ord.id and item_status <> 'VOIDED'
      for update;
      if not found then raise exception 'ORDER_ITEM_NOT_FOUND'; end if;

      if exists (
        select 1 from jsonb_array_elements(p_item_allocations) duplicate
        where duplicate->>'orderItemId' = allocation->>'orderItemId'
        group by duplicate->>'orderItemId' having count(*) > 1
      ) then raise exception 'ORDER_ITEM_ALLOCATED_TWICE'; end if;

      select coalesce(sum(payment_item.quantity), 0)::integer
      into already_allocated
      from public.payment_items payment_item
      join public.payments payment on payment.id = payment_item.payment_id
      where payment_item.order_item_id = allocation_item.id and payment.status = 'PAID';
      if already_allocated + requested_quantity > allocation_item.quantity then
        raise exception 'ORDER_ITEM_ALREADY_PAID';
      end if;

      select count(*)::integer into item_count
      from public.order_items item
      where item.order_id = ord.id and item.item_status <> 'VOIDED';
      select count(*)::integer into item_position
      from public.order_items item
      where item.order_id = ord.id and item.item_status <> 'VOIDED'
        and item.id <= allocation_item.id;
      if item_position = item_count then
        select order_cents - coalesce(sum(
          floor(order_cents * round(item.subtotal * 100)::numeric / basis_cents)
        ), 0)::bigint
        into line_cents
        from public.order_items item
        where item.order_id = ord.id and item.item_status <> 'VOIDED'
          and item.id <> allocation_item.id;
      else
        line_cents := floor(order_cents * round(allocation_item.subtotal * 100)::numeric / basis_cents);
      end if;
      line_base_cents := floor(line_cents::numeric / allocation_item.quantity);
      line_remainder := (line_cents % allocation_item.quantity)::integer;
      allocation_cents := requested_quantity * line_base_cents;
      allocation_cents := allocation_cents + greatest(
        0,
        least(already_allocated + requested_quantity, allocation_item.quantity)
          - greatest(already_allocated, allocation_item.quantity - line_remainder)
      );
      if allocation_cents <= 0 then raise exception 'INVALID_ITEM_AMOUNT'; end if;
      applied_amount := applied_amount + allocation_cents / 100.0;
    end loop;
    applied_amount := round(applied_amount, 2);
  else
    if exists (select 1 from public.order_bills where order_id = ord.id) then
      raise exception 'ORDER_HAS_LEGACY_BILL_SPLIT';
    end if;
    if normalized_type = 'FULL' then
      applied_amount := outstanding;
    else
      if p_amount is null then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
      requested_amount := round(p_amount, 2);
      if requested_amount <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
      applied_amount := requested_amount;
    end if;
  end if;

  if applied_amount <= 0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
  if applied_amount > outstanding then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;

  if normalized_method = 'CASH' then
    received_amount := round(coalesce(p_received_amount, applied_amount), 2);
    if received_amount < applied_amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
  else
    received_amount := applied_amount;
  end if;

  update public.payments set status = 'CANCELLED', updated_at = now()
  where order_id = ord.id and status in ('PENDING', 'PROCESSING', 'FAILED');

  insert into public.payments (
    order_id, bill_id, user_id, payment_method, amount, received_amount,
    change_amount, reference, transaction_reference, provider, status, paid_at,
    idempotency_key, request_fingerprint, split_type
  ) values (
    ord.id, p_bill_id, caller_id, normalized_method, applied_amount, received_amount,
    received_amount - applied_amount, ord.order_number,
    left(nullif(btrim(p_transaction_reference), ''), 150),
    left(coalesce(nullif(btrim(p_provider), ''), 'POS_TERMINAL'), 50),
    'PAID', now(), normalized_key, fingerprint, normalized_type
  ) returning * into created_payment;

  if normalized_type = 'ITEM' then
    for allocation in select value from jsonb_array_elements(p_item_allocations)
    loop
      requested_quantity := (allocation->>'quantity')::integer;
      select * into allocation_item from public.order_items
      where id = (allocation->>'orderItemId')::uuid and order_id = ord.id;
      select coalesce(sum(payment_item.quantity), 0)::integer
      into already_allocated
      from public.payment_items payment_item
      join public.payments payment on payment.id = payment_item.payment_id
      where payment_item.order_item_id = allocation_item.id
        and payment.status = 'PAID'
        and payment.id <> created_payment.id;

      select count(*)::integer into item_count
      from public.order_items item where item.order_id = ord.id and item.item_status <> 'VOIDED';
      select count(*)::integer into item_position
      from public.order_items item
      where item.order_id = ord.id and item.item_status <> 'VOIDED' and item.id <= allocation_item.id;
      if item_position = item_count then
        select order_cents - coalesce(sum(floor(order_cents * round(item.subtotal * 100)::numeric / basis_cents)), 0)::bigint
        into line_cents from public.order_items item
        where item.order_id = ord.id and item.item_status <> 'VOIDED' and item.id <> allocation_item.id;
      else
        line_cents := floor(order_cents * round(allocation_item.subtotal * 100)::numeric / basis_cents);
      end if;
      line_base_cents := floor(line_cents::numeric / allocation_item.quantity);
      line_remainder := (line_cents % allocation_item.quantity)::integer;
      allocation_cents := requested_quantity * line_base_cents
        + greatest(0, least(already_allocated + requested_quantity, allocation_item.quantity)
          - greatest(already_allocated, allocation_item.quantity - line_remainder));

      insert into public.payment_items(payment_id, order_item_id, quantity, amount)
      values (created_payment.id, allocation_item.id, requested_quantity, allocation_cents / 100.0);
    end loop;
  elsif normalized_type = 'EQUAL' then
    update public.order_bills
    set paid_amount = total, status = 'PAID', paid_at = now()
    where id = equal_bill.id;
  end if;

  new_paid_total := round(successful_total + applied_amount, 2);
  new_payment_status := case
    when new_paid_total >= round(ord.total, 2) then 'PAID'
    when new_paid_total > 0 then 'PARTIALLY_PAID'
    else 'UNPAID'
  end;
  perform set_config(
    'app.status_change_notes',
    case when new_payment_status = 'PAID'
      then 'Final split payment completed; kitchen rounds continue independently'
      else 'Partial payment recorded'
    end,
    true
  );
  update public.orders
  set payment_status = new_payment_status,
      status = case when new_payment_status = 'PAID' then 'COMPLETED' else status end
  where id = ord.id;

  return jsonb_build_object(
    'payment', to_jsonb(created_payment),
    'summary', public.get_pos_payment_summary(ord.id),
    'replayed', false
  );
end;
$$;

revoke all on function public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text)
from public, anon;
grant execute on function public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text)
to authenticated;

-- Receipt issuance must total all successful payments, even when several
-- cashiers collected different parts of the same bill.
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
  select round(coalesce(sum(amount), 0), 2) into successful_total
  from public.payments where order_id = new.id and status = 'PAID';
  select user_id into payment_actor from public.payments
  where order_id = new.id and status = 'PAID'
  order by paid_at desc, id desc limit 1;
  if payment_actor is null or successful_total < round(new.total, 2) then
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

-- Keep one transaction row per payment, but recognize order-level tax,
-- discount and service charge exactly once so split payments cannot inflate
-- financial totals.
create or replace view public.daily_sales_report
with (security_invoker = true)
as
with paid_rows as (
  select p.*, row_number() over (
    partition by p.order_id order by coalesce(p.paid_at, p.created_at), p.id
  ) as order_payment_position
  from public.payments p where p.status = 'PAID'
)
select
  coalesce(p.paid_at, p.created_at)::date as report_date,
  p.order_id,
  o.order_number,
  o.user_id,
  o.status as order_status,
  o.dining_mode,
  o.restaurant_table_id,
  p.id as payment_id,
  p.payment_method,
  coalesce(p.provider, 'UNSPECIFIED') as provider,
  p.transaction_reference,
  case when p.order_payment_position = 1 then round(o.subtotal, 2) else 0::numeric end as subtotal,
  case when p.order_payment_position = 1 then round(o.tax, 2) else 0::numeric end as tax,
  case when p.order_payment_position = 1 then round(o.discount, 2) else 0::numeric end as discount,
  round(p.amount, 2) as amount_paid,
  round(o.total, 2) as order_total,
  coalesce(p.paid_at, p.created_at) as paid_at,
  case when p.order_payment_position = 1 then round(o.service_charge, 2) else 0::numeric end as service_charge,
  p.payment_number
from paid_rows p
join public.orders o on o.id = p.order_id
where public.current_pos_role() in ('ADMIN', 'MANAGER');

revoke all on public.daily_sales_report from public, anon, authenticated;
grant select on public.daily_sales_report to service_role;

commit;
