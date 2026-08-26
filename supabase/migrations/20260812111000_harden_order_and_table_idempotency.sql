-- Bind idempotency keys to request content and keep order/payment cancellation
-- consistent. Refunds require a future dedicated provider-aware operation.

alter table public.orders
  add column if not exists idempotency_fingerprint text;

alter table public.orders drop constraint if exists orders_idempotency_fingerprint_length_check;
alter table public.orders
  add constraint orders_idempotency_fingerprint_length_check
  check (idempotency_fingerprint is null or char_length(idempotency_fingerprint) = 32);

create or replace function public.transition_pos_order(
  p_order_id uuid,
  p_new_status text,
  p_notes text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  staff_role text;
  target_status text := upper(trim(coalesce(p_new_status, '')));
  updated_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if staff_role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if not (
    (current_order.status = 'DRAFT' and target_status in ('PLACED', 'CANCELLED')) or
    (current_order.status = 'PLACED' and target_status in ('CONFIRMED', 'CANCELLED')) or
    (current_order.status = 'CONFIRMED' and target_status in ('PREPARING', 'CANCELLED')) or
    (current_order.status = 'PREPARING' and target_status in ('READY', 'CANCELLED')) or
    (current_order.status = 'READY' and target_status in ('SERVED', 'CANCELLED')) or
    (current_order.status = 'SERVED' and target_status = 'COMPLETED')
  ) then
    if current_order.status = 'COMPLETED' and target_status = 'REFUNDED' then
      raise exception 'REFUND_REQUIRES_PAYMENT_OPERATION';
    end if;
    raise exception 'INVALID_ORDER_TRANSITION';
  end if;

  if staff_role not in ('ADMIN', 'MANAGER') then
    if target_status = 'CANCELLED' then
      if current_order.user_id <> auth.uid() or current_order.status not in ('DRAFT', 'PLACED') then
        raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION';
      end if;
    elsif staff_role = 'KITCHEN' and target_status not in ('CONFIRMED', 'PREPARING', 'READY') then
      raise exception 'INSUFFICIENT_PERMISSION';
    elsif staff_role = 'WAITER' and target_status <> 'SERVED' then
      raise exception 'INSUFFICIENT_PERMISSION';
    elsif staff_role = 'CASHIER' and target_status <> 'COMPLETED' then
      raise exception 'INSUFFICIENT_PERMISSION';
    elsif staff_role not in ('KITCHEN', 'WAITER', 'CASHIER') then
      raise exception 'INSUFFICIENT_PERMISSION';
    end if;
  end if;

  if target_status = 'COMPLETED' and current_order.payment_status <> 'PAID' then
    raise exception 'PAYMENT_NOT_CONFIRMED';
  end if;
  if target_status = 'CANCELLED' and current_order.payment_status = 'PAID' then
    raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  if target_status = 'CANCELLED' then
    update public.payments set status = 'CANCELLED'
    where order_id = p_order_id and status in ('PENDING', 'PROCESSING', 'FAILED');
    update public.orders set status = target_status, payment_status = 'CANCELLED'
    where id = p_order_id returning * into updated_order;
  else
    update public.orders set status = target_status
    where id = p_order_id returning * into updated_order;
  end if;
  return updated_order;
end;
$$;

revoke all on function public.transition_pos_order(uuid, text, text) from public;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;

-- Patch the current create function in-place using a guard trigger. The RPC
-- supplies the fingerprint through a transaction-local setting before INSERT.
create or replace function public.guard_order_idempotency_fingerprint()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.idempotency_key is not null then
    new.idempotency_fingerprint := nullif(current_setting('app.order_idempotency_fingerprint', true), '');
    if new.idempotency_fingerprint is null then
      raise exception 'IDEMPOTENCY_FINGERPRINT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_order_idempotency_fingerprint on public.orders;
create trigger trg_guard_order_idempotency_fingerprint
before insert on public.orders
for each row execute function public.guard_order_idempotency_fingerprint();

-- Keep the already-audited order creation implementation as a private worker.
-- The public wrapper serializes requests by user/key and binds a key to the
-- canonical request payload before the worker can insert an order.
alter function public.create_pos_order(jsonb, text, text, text, text)
  rename to create_pos_order_unbound;

revoke all on function public.create_pos_order_unbound(jsonb, text, text, text, text)
  from public, authenticated;

create function public.create_pos_order(
  p_items jsonb,
  p_payment_method text,
  p_dining_mode text,
  p_table_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_idempotency_key text;
  request_fingerprint text;
  existing_order public.orders%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  request_fingerprint := md5(
    coalesce(p_items, 'null'::jsonb)::text || '|' ||
    upper(coalesce(p_payment_method, '')) || '|' ||
    coalesce(p_dining_mode, '') || '|' ||
    coalesce(p_table_id, '')
  );

  -- Transaction-scoped locks make simultaneous retries deterministic. The
  -- worker takes the same re-entrant lock, so the check and insert stay atomic.
  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0)
  );

  select * into existing_order
  from public.orders
  where user_id = current_user_id
    and idempotency_key = normalized_idempotency_key
  limit 1;

  if found and existing_order.idempotency_fingerprint is distinct from request_fingerprint then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
  end if;

  perform set_config('app.order_idempotency_fingerprint', request_fingerprint, true);

  return public.create_pos_order_unbound(
    p_items,
    p_payment_method,
    p_dining_mode,
    p_table_id,
    normalized_idempotency_key
  );
end;
$$;

revoke all on function public.create_pos_order(jsonb, text, text, text, text) from public;
grant execute on function public.create_pos_order(jsonb, text, text, text, text) to authenticated;
