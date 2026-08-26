-- Add-on items must join the table's existing bill and be idempotent. The RPC
-- validates products/options and recalculates totals from authoritative prices
-- inside one transaction.

create table if not exists public.order_item_batches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  request_items jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.order_items
  add column if not exists batch_id uuid references public.order_item_batches(id) on delete restrict,
  add column if not exists sent_at timestamptz not null default now();

create index if not exists idx_order_item_batches_order_created
  on public.order_item_batches(order_id, created_at);
create index if not exists idx_order_items_order_sent
  on public.order_items(order_id, sent_at);

alter table public.order_item_batches enable row level security;
drop policy if exists "Active staff can read order item batches" on public.order_item_batches;
create policy "Active staff can read order item batches"
on public.order_item_batches for select to authenticated
using (public.is_active_pos_user());

grant select on public.order_item_batches to authenticated;
grant all on public.order_item_batches to service_role;

create or replace function public.append_pos_order_items(
  p_order_id uuid,
  p_items jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_order public.orders%rowtype;
  current_payment public.payments%rowtype;
  existing_batch public.order_item_batches%rowtype;
  new_batch public.order_item_batches%rowtype;
  new_order_item public.order_items%rowtype;
  order_item jsonb;
  product_record public.products%rowtype;
  group_record record;
  selected_option_ids jsonb;
  selected_count integer;
  distinct_selected_count integer;
  group_selected_count integer;
  item_option_total numeric(12, 2);
  item_unit_price numeric(12, 2);
  added_subtotal numeric(12, 2) := 0;
  updated_subtotal numeric(12, 2);
  updated_tax numeric(12, 2);
  updated_service_charge numeric(12, 2);
  updated_total numeric(12, 2);
  normalized_idempotency_key text;
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0));

  select * into existing_batch from public.order_item_batches
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key;
  if found then
    if existing_batch.order_id <> p_order_id or existing_batch.request_items <> p_items then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    select * into current_order from public.orders where id = p_order_id;
    select * into current_payment from public.payments
      where order_id = p_order_id order by created_at desc limit 1;
    return jsonb_build_object(
      'id', current_order.id, 'order_number', current_order.order_number,
      'subtotal', current_order.subtotal, 'tax', current_order.tax,
      'service_charge', current_order.service_charge, 'discount', current_order.discount,
      'total', current_order.total, 'status', current_order.status,
      'payment_status', current_order.payment_status,
      'dining_mode', current_order.dining_mode,
      'table_id', current_order.restaurant_table_id,
      'payment_id', current_payment.id, 'created_at', current_order.created_at,
      'batch_id', existing_batch.id
    );
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.status not in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if current_order.payment_status <> 'PENDING' then raise exception 'ORDER_ALREADY_PAID'; end if;

  select * into current_payment from public.payments
  where order_id = p_order_id and status = 'PENDING'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'PENDING_PAYMENT_NOT_FOUND'; end if;

  for order_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(order_item) <> 'object'
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
      or (order_item->>'quantity')::numeric not between 1 and 99
    then raise exception 'INVALID_ITEM_QUANTITY'; end if;

    select * into product_record from public.products
    where id::text = order_item->>'productId' and status = true;
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(selected_option_ids) <> 'array' then raise exception 'INVALID_OPTION_IDS'; end if;
    select count(*), count(distinct selected.id), coalesce(sum(po.price_adjustment), 0)
    into selected_count, distinct_selected_count, item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id and po.is_available = true
    join public.product_option_groups pog on pog.id = po.option_group_id
      and pog.product_id = product_record.id;
    if selected_count <> jsonb_array_length(selected_option_ids)
      or distinct_selected_count <> selected_count
    then raise exception 'INVALID_OR_DUPLICATE_OPTIONS'; end if;

    for group_record in select * from public.product_option_groups
      where product_id = product_record.id
    loop
      select count(*) into group_selected_count
      from jsonb_array_elements_text(selected_option_ids) selected(id)
      join public.product_options po on po.id::text = selected.id
      where po.option_group_id = group_record.id;
      if group_selected_count < group_record.min_selection
        or group_selected_count > group_record.max_selection
        or (group_record.is_required and group_selected_count = 0)
      then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    added_subtotal := added_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  insert into public.order_item_batches (order_id, user_id, idempotency_key, request_items)
  values (p_order_id, current_user_id, normalized_idempotency_key, p_items)
  returning * into new_batch;

  for order_item in select value from jsonb_array_elements(p_items) loop
    select * into product_record from public.products where id::text = order_item->>'productId';
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    select coalesce(sum(po.price_adjustment), 0) into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    insert into public.order_items (
      order_id, product_id, quantity, unit_price, subtotal,
      product_name_snapshot, special_request, batch_id, sent_at
    ) values (
      p_order_id, product_record.id, (order_item->>'quantity')::integer,
      item_unit_price, round(item_unit_price * (order_item->>'quantity')::integer, 2),
      product_record.product_name, nullif(left(order_item->>'specialRequest', 1000), ''),
      new_batch.id, now()
    ) returning * into new_order_item;
    insert into public.order_item_options (
      order_item_id, option_group_name, option_name, price_adjustment
    ) select new_order_item.id, pog.name, po.name, po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  updated_subtotal := round(current_order.subtotal + added_subtotal, 2);
  updated_tax := round(updated_subtotal * 0.06, 2);
  updated_service_charge := round(updated_subtotal * 0.10, 2);
  updated_total := round(updated_subtotal - current_order.discount + updated_tax + updated_service_charge, 2);

  perform set_config('app.status_change_notes', 'Add-on items sent to kitchen', true);
  update public.orders set
    subtotal = updated_subtotal,
    tax = updated_tax,
    service_charge = updated_service_charge,
    total = updated_total,
    status = 'PLACED'
  where id = p_order_id
  returning * into current_order;

  update public.payments set amount = updated_total
  where id = current_payment.id and status = 'PENDING'
  returning * into current_payment;

  return jsonb_build_object(
    'id', current_order.id, 'order_number', current_order.order_number,
    'subtotal', current_order.subtotal, 'tax', current_order.tax,
    'service_charge', current_order.service_charge, 'discount', current_order.discount,
    'total', current_order.total, 'status', current_order.status,
    'payment_status', current_order.payment_status,
    'dining_mode', current_order.dining_mode,
    'table_id', current_order.restaurant_table_id,
    'payment_id', current_payment.id, 'created_at', current_order.created_at,
    'batch_id', new_batch.id
  );
end;
$$;

revoke all on function public.append_pos_order_items(uuid, jsonb, text) from public;
grant execute on function public.append_pos_order_items(uuid, jsonb, text) to authenticated;
