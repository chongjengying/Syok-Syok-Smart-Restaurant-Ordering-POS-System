-- Phases 11-12: authoritative, transactional and idempotent single payment.

alter table public.payments
  add column if not exists idempotency_key text,
  add column if not exists request_fingerprint text;

alter table public.payments drop constraint if exists payments_idempotency_key_length_check;
alter table public.payments
  add constraint payments_idempotency_key_length_check
  check (idempotency_key is null or char_length(btrim(idempotency_key)) between 1 and 128);

alter table public.payments drop constraint if exists payments_request_fingerprint_check;
alter table public.payments
  add constraint payments_request_fingerprint_check
  check (request_fingerprint is null or char_length(request_fingerprint) = 32);

create unique index if not exists idx_payments_idempotency_key
  on public.payments(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_payments_one_paid_per_order
  on public.payments(order_id)
  where status = 'PAID';

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

  select role_name into staff_role
  from public.profiles
  where id = caller_id and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'INVALID_PAYMENT_METHOD';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_final_amount is null or p_final_amount < 0 then raise exception 'INVALID_FINAL_AMOUNT'; end if;
  normalized_amount := round(p_final_amount, 2);
  fingerprint := md5(p_order_id::text || '|' || normalized_method || '|' || normalized_amount::text);

  -- Serialize retries using the same key, then serialize every payment for the order.
  perform pg_advisory_xact_lock(hashtextextended('payment:' || normalized_key, 0));
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into existing_payment
  from public.payments
  where idempotency_key = normalized_key
  for update;
  if found then
    if existing_payment.order_id <> p_order_id
      or existing_payment.request_fingerprint is distinct from fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    if existing_payment.status = 'PAID' then
      return jsonb_build_object('payment', row_to_json(existing_payment), 'order', row_to_json(ord), 'replayed', true);
    end if;
  end if;

  if ord.payment_status = 'PAID'
    or exists (select 1 from public.payments where order_id = ord.id and status = 'PAID') then
    raise exception 'ORDER_ALREADY_PAID';
  end if;
  if ord.status in ('DRAFT', 'CANCELLED', 'REFUNDED', 'COMPLETED') then
    raise exception 'ORDER_NOT_PAYABLE';
  end if;
  if ord.dining_mode = 'dine-in' and ord.status <> 'SERVED' then
    raise exception 'ORDER_NOT_SERVED';
  end if;
  if ord.dining_mode = 'takeaway' and ord.status <> 'COLLECTED' then
    raise exception 'ORDER_NOT_COLLECTED';
  end if;
  if normalized_amount <> round(coalesce(ord.total, 0), 2) then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if ord.dining_mode = 'dine-in' then
    perform 1 from public.restaurant_tables
    where id = ord.restaurant_table_id and is_active
    for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  end if;

  -- Retire order-time placeholders; the successful payment is created here.
  update public.payments
  set status = 'CANCELLED', updated_at = now()
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

  perform set_config('app.status_change_notes', 'Payment completed', true);
  update public.orders
  set payment_status = 'PAID', status = 'COMPLETED'
  where id = ord.id
  returning * into ord;

  -- This remains inside the RPC transaction. Any later failure rolls it back.
  if ord.dining_mode = 'dine-in' then
    update public.restaurant_tables
    set status = 'CLEANING', is_active = true
    where id = ord.restaurant_table_id;
  end if;

  return jsonb_build_object('payment', row_to_json(pay), 'order', row_to_json(ord), 'replayed', false);
end;
$$;

revoke all on function public.complete_payment(uuid, text, numeric, text, text, text) from public;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text) to authenticated;
