-- Allow settlement after kitchen submission, without confusing financial
-- completion with operational fulfillment. Paid orders remain active until all
-- ready food is served, at which point the existing serving RPC completes the
-- order and moves a dine-in table to CLEANING.

create or replace function public.complete_payment(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
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
  select role_name into staff_role from public.profiles
  where id = caller_id and status = 'ACTIVE';
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

  select * into existing_payment from public.payments
  where idempotency_key = normalized_key for update;
  if found then
    if existing_payment.order_id <> p_order_id
      or existing_payment.request_fingerprint is distinct from fingerprint
    then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    if existing_payment.status = 'PAID' then
      return jsonb_build_object('payment', row_to_json(existing_payment), 'order', row_to_json(ord), 'replayed', true);
    end if;
  end if;

  if ord.payment_status = 'PAID'
    or exists (select 1 from public.payments where order_id = ord.id and status = 'PAID')
  then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_PAYABLE'; end if;
  if exists (
    select 1 from public.order_items where order_id = ord.id and item_status = 'DRAFT'
  ) then raise exception 'ORDER_HAS_UNSENT_ITEMS'; end if;
  if normalized_amount <> round(coalesce(ord.total, 0), 2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  if ord.dining_mode = 'dine-in' then
    perform 1 from public.restaurant_tables
    where id = ord.restaurant_table_id and is_active for update;
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

  perform set_config(
    'app.status_change_notes',
    case when ord.status = 'SERVED' then 'Payment completed' else 'Early payment completed; fulfillment continues' end,
    true
  );
  update public.orders
  set payment_status = 'PAID',
      status = case when status = 'SERVED' then 'COMPLETED' else status end
  where id = ord.id returning * into ord;

  if ord.dining_mode = 'dine-in' and ord.status = 'COMPLETED' then
    update public.restaurant_tables set status = 'CLEANING', is_active = true
    where id = ord.restaurant_table_id;
  end if;

  return jsonb_build_object('payment', row_to_json(pay), 'order', row_to_json(ord), 'replayed', false);
end;
$$;

-- The tender-aware seven-argument wrapper remains the only public payment
-- boundary; it calls this private worker and persists cash/change amounts.
revoke all on function public.complete_payment(uuid, text, numeric, text, text, text)
from public, anon, authenticated;

-- Early payment must not stop the kitchen. Patch the two batch workers while
-- retaining every existing order/batch lock and status validation.
do $$
declare
  signature regprocedure;
  definition text;
  old_guard constant text := 'if ord.payment_status <> ''UNPAID'' then raise exception ''ORDER_ALREADY_PAID''; end if;';
  new_guard constant text := 'if ord.payment_status not in (''UNPAID'', ''PAID'') then raise exception ''ORDER_NOT_ACTIVE''; end if;';
begin
  foreach signature in array array[
    'public.start_kitchen_batch(uuid,uuid)'::regprocedure,
    'public.ready_kitchen_batch(uuid,uuid)'::regprocedure
  ]
  loop
    definition := pg_get_functiondef(signature);
    if position(old_guard in definition) = 0 then
      raise exception 'EXPECTED_KITCHEN_PAYMENT_GUARD_NOT_FOUND: %', signature;
    end if;
    execute replace(definition, old_guard, new_guard);
  end loop;
end;
$$;

revoke all on function public.start_kitchen_batch(uuid, uuid) from public, anon;
revoke all on function public.ready_kitchen_batch(uuid, uuid) from public, anon;
grant execute on function public.start_kitchen_batch(uuid, uuid) to authenticated;
grant execute on function public.ready_kitchen_batch(uuid, uuid) to authenticated;
