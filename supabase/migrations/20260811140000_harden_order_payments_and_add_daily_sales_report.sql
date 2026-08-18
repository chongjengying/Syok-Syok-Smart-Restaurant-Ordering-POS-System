alter table public.orders
  add column if not exists idempotency_key text;

update public.orders
set idempotency_key = null
where idempotency_key is not null
  and btrim(idempotency_key) = '';

alter table public.orders drop constraint if exists orders_idempotency_key_length_check;
alter table public.orders
  add constraint orders_idempotency_key_length_check
  check (idempotency_key is null or char_length(btrim(idempotency_key)) between 1 and 128);

create unique index if not exists idx_orders_user_idempotency_key
  on public.orders(user_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_payments_one_paid_per_order
  on public.payments(order_id)
  where status = 'PAID';

create or replace function public.confirm_pos_payment(
  p_payment_id uuid,
  p_provider text,
  p_transaction_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_payment public.payments%rowtype;
  current_order public.orders%rowtype;
begin
  select * into current_payment
  from public.payments
  where id = p_payment_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Payment does not exist';
  end if;

  select * into current_order
  from public.orders
  where id = current_payment.order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if current_payment.status = 'PAID' then
    return jsonb_build_object(
      'payment', row_to_json(current_payment),
      'order', row_to_json(current_order)
    );
  end if;

  if current_payment.status not in ('PENDING', 'PROCESSING', 'FAILED') then
    raise exception 'Payment cannot be confirmed from status %', current_payment.status;
  end if;

  if current_order.status in ('CANCELLED', 'REFUNDED') then
    raise exception 'Payment cannot be confirmed for an order in status %', current_order.status;
  end if;

  if round(coalesce(current_payment.amount, 0), 2) <> round(coalesce(current_order.total, 0), 2) then
    raise exception 'Payment amount does not match the order total';
  end if;

  if exists (
    select 1
    from public.payments other_payment
    where other_payment.order_id = current_payment.order_id
      and other_payment.id <> current_payment.id
      and other_payment.status = 'PAID'
  ) then
    raise exception 'Another successful payment already exists for this order';
  end if;

  update public.payments
  set status = 'PAID',
      provider = left(nullif(btrim(p_provider), ''), 50),
      transaction_reference = left(nullif(btrim(p_transaction_reference), ''), 150),
      paid_at = now()
  where id = p_payment_id
  returning * into current_payment;

  update public.orders
  set payment_status = 'PAID'
  where id = current_payment.order_id
  returning * into current_order;

  return jsonb_build_object(
    'payment', row_to_json(current_payment),
    'order', row_to_json(current_order)
  );
end;
$$;

drop function if exists public.create_pos_order(jsonb, text, text, text);
drop function if exists public.create_pos_order(jsonb, text, text, text, text);
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
  existing_order public.orders%rowtype;
  existing_payment public.payments%rowtype;
  new_order public.orders%rowtype;
  new_order_item public.order_items%rowtype;
  new_payment public.payments%rowtype;
  order_item jsonb;
  product_record public.products%rowtype;
  group_record record;
  selected_option_ids jsonb;
  selected_count integer;
  group_selected_count integer;
  item_option_total numeric(12, 2);
  item_unit_price numeric(12, 2);
  order_subtotal numeric(12, 2) := 0;
  order_tax numeric(12, 2);
  order_total numeric(12, 2);
  selected_table_id uuid;
  order_number_value text;
  normalized_idempotency_key text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Between 1 and 100 order items are required';
  end if;

  p_payment_method := upper(p_payment_method);
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'Unsupported payment method';
  end if;

  if p_dining_mode not in ('dine-in', 'takeaway') then
    raise exception 'Unsupported dining mode';
  end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');

  if normalized_idempotency_key is not null then
    select *
    into existing_order
    from public.orders
    where user_id = current_user_id
      and idempotency_key = normalized_idempotency_key
    limit 1;

    if found then
      select *
      into existing_payment
      from public.payments
      where order_id = existing_order.id
      order by created_at desc
      limit 1;

      return jsonb_build_object(
        'id', existing_order.id,
        'order_number', existing_order.order_number,
        'subtotal', existing_order.subtotal,
        'tax', existing_order.tax,
        'total', existing_order.total,
        'status', existing_order.status,
        'payment_status', existing_order.payment_status,
        'dining_mode', existing_order.dining_mode,
        'table_id', existing_order.restaurant_table_id,
        'payment_id', existing_payment.id,
        'created_at', existing_order.created_at
      );
    end if;
  end if;

  if p_dining_mode = 'dine-in' then
    begin
      selected_table_id := p_table_id::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid restaurant table ID';
    end;

    perform 1
    from public.restaurant_tables
    where id = selected_table_id
      and is_active = true
      and status = 'AVAILABLE'
    for update;

    if not found then
      raise exception 'Restaurant table is not available';
    end if;
  end if;

  for order_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(order_item) <> 'object'
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
      or (order_item->>'quantity')::numeric not between 1 and 99
    then
      raise exception 'Each item requires a productId and quantity from 1 to 99';
    end if;

    select * into product_record
    from public.products
    where id::text = order_item->>'productId'
      and status = true;

    if not found then
      raise exception 'Product % is not available', order_item->>'productId';
    end if;

    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(selected_option_ids) <> 'array' then
      raise exception 'optionIds must be an array';
    end if;

    select count(*), coalesce(sum(po.price_adjustment), 0)
    into selected_count, item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id and po.is_available = true
    join public.product_option_groups pog on pog.id = po.option_group_id and pog.product_id = product_record.id;

    if selected_count <> jsonb_array_length(selected_option_ids) then
      raise exception 'One or more selected options are invalid or unavailable';
    end if;

    for group_record in
      select *
      from public.product_option_groups
      where product_id = product_record.id
    loop
      select count(*)
      into group_selected_count
      from jsonb_array_elements_text(selected_option_ids) selected(id)
      join public.product_options po on po.id::text = selected.id
      where po.option_group_id = group_record.id;

      if group_selected_count < group_record.min_selection
        or group_selected_count > group_record.max_selection
        or (group_record.is_required and group_selected_count = 0)
      then
        raise exception 'Invalid selection count for option group %', group_record.name;
      end if;
    end loop;

    item_unit_price := product_record.sell_price + item_option_total;
    order_subtotal := order_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  order_subtotal := round(order_subtotal, 2);
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
    payment_status,
    dining_mode,
    table_id,
    restaurant_table_id,
    idempotency_key
  ) values (
    order_number_value,
    current_user_id,
    order_subtotal,
    0,
    order_tax,
    order_total,
    'PLACED',
    'PENDING',
    p_dining_mode,
    case when selected_table_id is null then null else p_table_id end,
    selected_table_id,
    normalized_idempotency_key
  ) returning * into new_order;

  for order_item in select value from jsonb_array_elements(p_items)
  loop
    select * into product_record
    from public.products
    where id::text = order_item->>'productId';

    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);

    select coalesce(sum(po.price_adjustment), 0)
    into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;

    item_unit_price := product_record.sell_price + item_option_total;

    insert into public.order_items (
      order_id,
      product_id,
      quantity,
      unit_price,
      subtotal,
      product_name_snapshot,
      special_request
    ) values (
      new_order.id,
      product_record.id,
      (order_item->>'quantity')::integer,
      item_unit_price,
      item_unit_price * (order_item->>'quantity')::integer,
      product_record.product_name,
      nullif(left(order_item->>'specialRequest', 1000), '')
    ) returning * into new_order_item;

    insert into public.order_item_options (
      order_item_id,
      option_group_name,
      option_name,
      price_adjustment
    )
    select
      new_order_item.id,
      pog.name,
      po.name,
      po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  insert into public.payments (
    order_id,
    user_id,
    payment_method,
    amount,
    reference,
    transaction_reference,
    provider,
    status,
    paid_at
  ) values (
    new_order.id,
    current_user_id,
    p_payment_method,
    order_total,
    order_number_value,
    null,
    null,
    'PENDING',
    null
  ) returning * into new_payment;

  return jsonb_build_object(
    'id', new_order.id,
    'order_number', new_order.order_number,
    'subtotal', new_order.subtotal,
    'tax', new_order.tax,
    'total', new_order.total,
    'status', new_order.status,
    'payment_status', new_order.payment_status,
    'dining_mode', new_order.dining_mode,
    'table_id', new_order.restaurant_table_id,
    'payment_id', new_payment.id,
    'created_at', new_order.created_at
  );
end;
$$;

grant execute on function public.create_pos_order(jsonb, text, text, text, text) to authenticated;
grant execute on function public.confirm_pos_payment(uuid, text, text) to authenticated;

create or replace view public.daily_sales_report
with (security_invoker = true)
as
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
  round(o.subtotal, 2) as subtotal,
  round(o.tax, 2) as tax,
  round(o.discount, 2) as discount,
  round(p.amount, 2) as amount_paid,
  round(o.total, 2) as order_total,
  coalesce(p.paid_at, p.created_at) as paid_at
from public.payments p
join public.orders o on o.id = p.order_id
where p.status = 'PAID';

grant select on public.daily_sales_report to authenticated;
