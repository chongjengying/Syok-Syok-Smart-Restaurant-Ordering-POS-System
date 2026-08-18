-- A bill and its kitchen fulfillment have separate lifecycles:
-- payment completes the financial order, while item batches remain actionable.

create or replace function public.complete_payment(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_idempotency_key text,
  p_provider text default null,
  p_transaction_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  staff_role text;
  ord public.orders%rowtype;
  pay public.payments%rowtype;
  existing_payment public.payments%rowtype;
  normalized_method text := upper(btrim(coalesce(p_payment_method, '')));
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  normalized_amount numeric(12, 2);
  fingerprint text;
begin
  if caller_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role_name into staff_role from public.profiles where id = caller_id and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;

  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_final_amount is null or p_final_amount < 0 then raise exception 'INVALID_FINAL_AMOUNT'; end if;
  normalized_amount := round(p_final_amount, 2);
  fingerprint := md5(p_order_id::text || '|' || normalized_method || '|' || normalized_amount::text);

  perform pg_advisory_xact_lock(hashtextextended('payment:' || normalized_key, 0));
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into existing_payment from public.payments where idempotency_key = normalized_key for update;
  if found then
    if existing_payment.order_id <> p_order_id or existing_payment.request_fingerprint is distinct from fingerprint
    then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    if existing_payment.status = 'PAID' then
      return jsonb_build_object('payment', row_to_json(existing_payment), 'order', row_to_json(ord), 'replayed', true);
    end if;
  end if;

  if ord.payment_status = 'PAID' or exists (
    select 1 from public.payments where order_id = ord.id and status = 'PAID'
  ) then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_PAYABLE'; end if;
  if exists (select 1 from public.order_items where order_id = ord.id and item_status = 'DRAFT')
  then raise exception 'ORDER_HAS_UNSENT_ITEMS'; end if;
  if normalized_amount <> round(coalesce(ord.total, 0), 2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  if ord.dining_mode = 'dine-in' then
    perform 1 from public.restaurant_tables where id = ord.restaurant_table_id and is_active for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  end if;

  update public.payments set status = 'CANCELLED', updated_at = now()
  where order_id = ord.id and status in ('PENDING', 'PROCESSING', 'FAILED');

  insert into public.payments (
    order_id, user_id, payment_method, amount, reference,
    transaction_reference, provider, status, paid_at,
    idempotency_key, request_fingerprint
  ) values (
    ord.id, caller_id, normalized_method, normalized_amount, ord.order_number,
    left(nullif(btrim(p_transaction_reference), ''), 150),
    left(coalesce(nullif(btrim(p_provider), ''), 'POS_TERMINAL'), 50),
    'PAID', now(), normalized_key, fingerprint
  ) returning * into pay;

  perform set_config('app.status_change_notes', 'Payment completed; kitchen rounds continue independently', true);
  update public.orders set payment_status = 'PAID', status = 'COMPLETED'
  where id = ord.id returning * into ord;

  return jsonb_build_object('payment', row_to_json(pay), 'order', row_to_json(ord), 'replayed', false);
end;
$$;

create or replace function public.sync_restaurant_table_status() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prior text;
  has_other_operational_order boolean;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then return new; end if;
  if tg_op = 'INSERT' then
    select status into prior from public.restaurant_tables where id = new.restaurant_table_id and is_active for update;
    if prior is null or prior not in ('AVAILABLE', 'RESERVED', 'OCCUPIED') then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists (
      select 1 from public.orders existing
      where existing.restaurant_table_id = new.restaurant_table_id and existing.id <> new.id
        and existing.payment_status in ('UNPAID', 'PARTIALLY_PAID')
        and existing.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
    ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
    update public.restaurant_tables set status = 'OCCUPIED', is_active = true where id = new.restaurant_table_id;
    perform public.log_table_activity(new.restaurant_table_id, new.id,
      case when prior = 'OCCUPIED' then 'NEW_BILL_AFTER_PAYMENT' else 'TABLE_OCCUPIED' end,
      prior, 'OCCUPIED', new.idempotency_key, jsonb_build_object('order_number', new.order_number));
    return new;
  end if;

  select exists (
    select 1 from public.orders other_order
    where other_order.restaurant_table_id = new.restaurant_table_id and other_order.id <> new.id
      and other_order.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) into has_other_operational_order;

  if new.status = 'COMPLETED' and new.payment_status = 'PAID'
    and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  then
    select status into prior from public.restaurant_tables where id = new.restaurant_table_id for update;
    if has_other_operational_order then
      update public.restaurant_tables set status = 'OCCUPIED', is_active = true where id = new.restaurant_table_id;
    else
      update public.restaurant_tables set status = 'CLEANING', is_active = true where id = new.restaurant_table_id;
      perform public.log_table_activity(new.restaurant_table_id, new.id, 'PAYMENT_COMPLETED', prior, 'CLEANING', null,
        jsonb_build_object('order_number', new.order_number, 'kitchen_fulfillment_independent', true));
    end if;
  elsif new.status = 'CANCELLED' then
    if has_other_operational_order then
      update public.restaurant_tables set status = 'OCCUPIED', is_active = true where id = new.restaurant_table_id;
    elsif old.status in ('DRAFT', 'CONFIRMED') then
      update public.restaurant_tables set status = 'AVAILABLE', is_active = true where id = new.restaurant_table_id;
    else
      update public.restaurant_tables set status = 'CLEANING', is_active = true where id = new.restaurant_table_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.start_kitchen_batch(p_order_id uuid, p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  batch public.order_item_batches%rowtype;
  staff_role text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into batch from public.order_item_batches where id = p_batch_id and order_id = p_order_id for update;
  if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
  if ord.payment_status not in ('UNPAID', 'PAID') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if batch.status in ('PREPARING', 'READY') then return to_jsonb(batch); end if;
  if batch.status <> 'PENDING' then raise exception 'KITCHEN_BATCH_NOT_PENDING'; end if;
  update public.order_items set item_status = 'PREPARING' where batch_id = batch.id and item_status = 'SUBMITTED';
  update public.order_item_batches set status = 'PREPARING', started_at = coalesce(started_at, clock_timestamp())
  where id = batch.id returning * into batch;
  if ord.payment_status <> 'PAID' then
    perform set_config('app.status_change_notes', 'Kitchen started round ' || batch.batch_no, true);
    update public.orders set status = 'PREPARING', kitchen_started_at = coalesce(kitchen_started_at, clock_timestamp()) where id = ord.id;
  else
    update public.orders set kitchen_started_at = coalesce(kitchen_started_at, clock_timestamp()) where id = ord.id;
  end if;
  return to_jsonb(batch);
end;
$$;

create or replace function public.ready_kitchen_batch(p_order_id uuid, p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  batch public.order_item_batches%rowtype;
  staff_role text;
  next_status text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into batch from public.order_item_batches where id = p_batch_id and order_id = p_order_id for update;
  if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
  if ord.payment_status not in ('UNPAID', 'PAID') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if batch.status = 'READY' then return to_jsonb(batch); end if;
  if batch.status <> 'PREPARING' then raise exception 'KITCHEN_BATCH_NOT_PREPARING'; end if;
  update public.order_items set item_status = 'READY' where batch_id = batch.id and item_status = 'PREPARING';
  update public.order_item_batches set status = 'READY', ready_at = coalesce(ready_at, clock_timestamp())
  where id = batch.id returning * into batch;
  if ord.payment_status <> 'PAID' then
    next_status := case
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'PREPARING') then 'PREPARING'
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'SUBMITTED') then 'CONFIRMED'
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'READY') then 'READY'
      else ord.status end;
    perform set_config('app.status_change_notes', 'Kitchen completed round ' || batch.batch_no, true);
    update public.orders set status = next_status where id = ord.id;
  end if;
  return to_jsonb(batch);
end;
$$;

create or replace function public.serve_ready_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  staff_role text;
  next_status text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'READY') then
    if ord.status in ('SERVED', 'COMPLETED') and not exists (
      select 1 from public.order_items where order_id = p_order_id and item_status in ('SUBMITTED', 'PREPARING', 'READY')
    ) then return ord; end if;
    raise exception 'ORDER_NOT_READY';
  end if;
  update public.order_items set item_status = 'SERVED' where order_id = p_order_id and item_status = 'READY';
  update public.order_item_batches batch set status = 'SERVED', served_at = coalesce(served_at, clock_timestamp())
  where batch.order_id = p_order_id and batch.status = 'READY'
    and not exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status <> 'SERVED');
  next_status := case
    when ord.payment_status = 'PAID' then 'COMPLETED'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'SUBMITTED') then 'CONFIRMED'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'READY') then 'READY'
    else 'SERVED' end;
  perform set_config('app.status_change_notes', 'Ready kitchen items served', true);
  update public.orders set status = next_status where id = p_order_id returning * into ord;
  return ord;
end;
$$;

create or replace function public.complete_table_cleaning(
  p_table_id uuid,
  p_operation_key text default null
) returns public.restaurant_tables
language plpgsql security definer set search_path = public
as $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'AVAILABLE' then return current_table; end if;
  if current_table.status <> 'CLEANING' then raise exception 'INVALID_TABLE_TRANSITION'; end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_table_id
      and payment_status in ('UNPAID', 'PARTIALLY_PAID')
      and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  if exists (
    select 1 from public.orders ord join public.order_items item on item.order_id = ord.id
    where ord.restaurant_table_id = p_table_id and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
  ) then raise exception 'KITCHEN_ITEMS_NOT_FULFILLED'; end if;
  update public.restaurant_tables set status = 'AVAILABLE', is_active = true where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(p_table_id, null, 'CLEANING_COMPLETED', 'CLEANING', 'AVAILABLE', p_operation_key, '{}'::jsonb);
  return updated_table;
end;
$$;

revoke all on function public.complete_payment(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text) to authenticated;
revoke all on function public.start_kitchen_batch(uuid, uuid) from public, anon;
revoke all on function public.ready_kitchen_batch(uuid, uuid) from public, anon;
grant execute on function public.start_kitchen_batch(uuid, uuid) to authenticated;
grant execute on function public.ready_kitchen_batch(uuid, uuid) to authenticated;
revoke all on function public.serve_ready_order(uuid) from public, anon;
grant execute on function public.serve_ready_order(uuid) to authenticated;
revoke all on function public.complete_table_cleaning(uuid, text) from public, anon;
grant execute on function public.complete_table_cleaning(uuid, text) to authenticated;
