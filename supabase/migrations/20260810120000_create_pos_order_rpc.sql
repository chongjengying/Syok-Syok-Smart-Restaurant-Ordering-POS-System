-- Creates an order, its line items, and its payment in one database transaction.
-- Prices and totals are derived from active products; client-provided prices are ignored.
alter table public.orders
  add column if not exists dining_mode text not null default 'takeaway',
  add column if not exists table_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_dining_mode_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_dining_mode_check
      check (dining_mode in ('dine-in', 'takeaway'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_dine_in_table_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_dine_in_table_check
      check (dining_mode <> 'dine-in' or table_id is not null);
  end if;
end;
$$;

create or replace function public.create_pos_order(
  p_items jsonb,
  p_payment_method text,
  p_dining_mode text,
  p_table_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_order public.orders%rowtype;
  order_subtotal numeric(12, 2);
  order_tax numeric(12, 2);
  order_total numeric(12, 2);
  order_number_value text;
  item_count integer;
  matched_product_count integer;
  order_item jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Between 1 and 100 order items are required';
  end if;

  if p_payment_method not in ('card', 'ewallet', 'counter') then
    raise exception 'Unsupported payment method';
  end if;

  if p_dining_mode not in ('dine-in', 'takeaway') then
    raise exception 'Unsupported dining mode';
  end if;

  if p_dining_mode = 'dine-in' and nullif(trim(p_table_id), '') is null then
    raise exception 'A table is required for dine-in orders';
  end if;

  if length(coalesce(p_table_id, '')) > 50 then
    raise exception 'Table ID must not exceed 50 characters';
  end if;

  for order_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(order_item) <> 'object'
      or nullif(trim(order_item->>'productId'), '') is null
      or length(order_item->>'productId') > 128
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
    then
      raise exception 'Each item requires a valid productId and a quantity from 1 to 99';
    end if;

    if (order_item->>'quantity')::numeric not between 1 and 99 then
      raise exception 'Each item requires a valid productId and a quantity from 1 to 99';
    end if;
  end loop;

  select count(*)
  into item_count
  from jsonb_array_elements(p_items);

  select count(*)
  into matched_product_count
  from jsonb_array_elements(p_items) as item
  join public.products as product
    on product.id::text = item->>'productId'
   and product.status = true;

  if matched_product_count <> item_count then
    raise exception 'One or more products do not exist or are not available';
  end if;

  select round(sum(product.sell_price * (item->>'quantity')::integer), 2)
  into order_subtotal
  from jsonb_array_elements(p_items) as item
  join public.products as product
    on product.id::text = item->>'productId'
   and product.status = true;

  -- The UI currently applies 6% SST and a 10% service charge. The existing
  -- schema has one tax/charges column, so both charges are stored there.
  order_tax := round(order_subtotal * 0.16, 2);
  order_total := order_subtotal + order_tax;
  order_number_value := 'POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(md5(random()::text), 1, 8));
  insert into public.orders (
    order_number,
    user_id,
    subtotal,
    discount,
    tax,
    total,
    status,
    dining_mode,
    table_id
  )
  values (
    order_number_value,
    current_user_id,
    order_subtotal,
    0,
    order_tax,
    order_total,
    'PAID',
    p_dining_mode,
    case when p_dining_mode = 'dine-in' then trim(p_table_id) else null end
  )
  returning * into new_order;

  insert into public.order_items (
    order_id,
    product_id,
    quantity,
    unit_price,
    subtotal,
    product_name_snapshot
  )
  select
    new_order.id,
    product.id,
    (item->>'quantity')::integer,
    product.sell_price,
    round(product.sell_price * (item->>'quantity')::integer, 2),
    product.product_name
  from jsonb_array_elements(p_items) as item
  join public.products as product
    on product.id::text = item->>'productId'
   and product.status = true;

  insert into public.payments (
    order_id,
    user_id,
    payment_method,
    amount,
    reference,
    status
  )
  values (
    new_order.id,
    current_user_id,
    p_payment_method,
    order_total,
    order_number_value,
    'SUCCESS'
  );

  return jsonb_build_object(
    'id', new_order.id,
    'order_number', new_order.order_number,
    'subtotal', order_subtotal,
    'tax', order_tax,
    'total', order_total,
    'status', new_order.status,
    'dining_mode', new_order.dining_mode,
    'table_id', new_order.table_id,
    'created_at', new_order.created_at
  );
end;
$$;

revoke all on function public.create_pos_order(jsonb, text, text, text) from public;
grant execute on function public.create_pos_order(jsonb, text, text, text) to authenticated;
