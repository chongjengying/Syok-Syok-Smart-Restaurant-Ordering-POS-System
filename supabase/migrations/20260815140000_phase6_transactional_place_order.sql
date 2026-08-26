-- Phase 6: canonical transactional order placement entry point.
--
-- PostgreSQL functions execute inside the caller's transaction. The private
-- create_pos_order_unbound worker performs the locked table claim, validates
-- every product/option, reads current database prices, inserts the order and
-- its items, snapshots unit_price, creates the pending payment, and lets the
-- table lifecycle trigger mark a dine-in table OCCUPIED. Any exception aborts
-- the statement and rolls all of those changes back together.

create or replace function public.place_order(
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
  normalized_table_id text := nullif(btrim(coalesce(p_table_id, '')), '');
  request_fingerprint text;
  existing_order public.orders%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id
      and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  if p_dining_mode not in ('dine-in', 'takeaway') then
    raise exception 'INVALID_DINING_MODE';
  end if;
  if p_dining_mode = 'dine-in' and normalized_table_id is null then
    raise exception 'INVALID_TABLE_ID';
  end if;
  if p_dining_mode = 'takeaway' and normalized_table_id is not null then
    raise exception 'INVALID_TABLE_ID';
  end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;

  request_fingerprint := md5(
    coalesce(p_items, 'null'::jsonb)::text || '|' ||
    upper(coalesce(p_payment_method, '')) || '|' ||
    p_dining_mode || '|' ||
    coalesce(normalized_table_id, '')
  );

  -- Serialize retries before reading or creating the idempotent order.
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

  -- The insert guard records this fingerprint on the order in this transaction.
  perform set_config('app.order_idempotency_fingerprint', request_fingerprint, true);

  return public.create_pos_order_unbound(
    p_items,
    upper(p_payment_method),
    p_dining_mode,
    normalized_table_id,
    normalized_idempotency_key
  );
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text) from public;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;

comment on function public.place_order(jsonb, text, text, text, text) is
  'Atomically validates and places a POS order using authoritative database prices.';

-- Safe compatibility entry point for older deployed clients. New code calls
-- place_order directly; this wrapper cannot bypass any Phase 6 validation.
create or replace function public.create_pos_order(
  p_items jsonb,
  p_payment_method text,
  p_dining_mode text,
  p_table_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select public.place_order(
    p_items,
    p_payment_method,
    p_dining_mode,
    p_table_id,
    p_idempotency_key
  );
$$;

revoke all on function public.create_pos_order(jsonb, text, text, text, text) from public;
grant execute on function public.create_pos_order(jsonb, text, text, text, text) to authenticated;

