-- Keep product and option availability/pricing stable from validation through
-- order_items.unit_price snapshotting. Locks are acquired in UUID order to
-- avoid deadlocks between orders containing the same products in a different
-- cart order.

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
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;

  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if (p_dining_mode = 'dine-in' and normalized_table_id is null)
    or (p_dining_mode = 'takeaway' and normalized_table_id is not null)
  then raise exception 'INVALID_TABLE_ID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  request_fingerprint := md5(
    p_items::text || '|' || upper(coalesce(p_payment_method, '')) || '|' ||
    p_dining_mode || '|' || coalesce(normalized_table_id, '')
  );

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0)
  );
  select * into existing_order from public.orders
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key limit 1;
  if found and existing_order.idempotency_fingerprint is distinct from request_fingerprint then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
  end if;
  perform set_config('app.order_idempotency_fingerprint', request_fingerprint, true);

  -- Lock all matching catalog rows before the private worker validates them.
  -- Missing IDs are intentionally left for the worker to reject with the
  -- domain-specific PRODUCT_NOT_AVAILABLE / option validation errors.
  perform 1
  from public.products product
  join (
    select distinct item->>'productId' as id
    from jsonb_array_elements(p_items) item
  ) requested on requested.id = product.id::text
  order by product.id
  for share of product;

  perform 1
  from public.product_option_groups option_group
  where option_group.product_id in (
    select product.id
    from public.products product
    join (
      select distinct item->>'productId' as id
      from jsonb_array_elements(p_items) item
    ) requested on requested.id = product.id::text
  )
  order by option_group.id
  for share of option_group;

  perform 1
  from public.product_options product_option
  join (
    select distinct option_id
    from jsonb_array_elements(p_items) item
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(item->'optionIds') = 'array'
        then item->'optionIds' else '[]'::jsonb end
    ) as selected(option_id)
  ) requested on requested.option_id = product_option.id::text
  order by product_option.id
  for share of product_option;

  return public.create_pos_order_unbound(
    p_items, upper(p_payment_method), p_dining_mode,
    normalized_table_id, normalized_idempotency_key
  );
end;
$$;

revoke all on function public.place_order(jsonb, text, text, text, text) from public;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;
