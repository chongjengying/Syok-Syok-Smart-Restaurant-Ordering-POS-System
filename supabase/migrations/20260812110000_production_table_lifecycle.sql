-- Production restaurant-table lifecycle, audit trail, concurrency controls,
-- transactional moves, manual cleaning completion, and authoritative order
-- charge calculation.

alter table public.restaurant_tables drop constraint if exists restaurant_tables_status_check;
update public.restaurant_tables set status = 'OUT_OF_SERVICE' where status = 'DISABLED';
alter table public.restaurant_tables
  add constraint restaurant_tables_status_check check (
    status in ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE')
  );

update public.restaurant_tables
set is_active = status <> 'OUT_OF_SERVICE';

create unique index if not exists idx_one_active_order_per_restaurant_table
  on public.orders(restaurant_table_id)
  where restaurant_table_id is not null
    and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED');

create table if not exists public.table_activity_logs (
  id uuid primary key default gen_random_uuid(),
  restaurant_table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  action varchar(50) not null check (action in (
    'TABLE_RESERVED', 'RESERVATION_RELEASED', 'TABLE_OCCUPIED',
    'ORDER_MOVED_IN', 'ORDER_MOVED_OUT', 'ORDER_CANCELLED',
    'PAYMENT_COMPLETED', 'CLEANING_STARTED', 'CLEANING_COMPLETED',
    'TABLE_OUT_OF_SERVICE', 'TABLE_RESTORED', 'MANAGER_OVERRIDE'
  )),
  from_status varchar(20),
  to_status varchar(20),
  performed_by uuid references public.profiles(id) on delete set null,
  operation_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint table_activity_operation_key_length check (
    operation_key is null or char_length(btrim(operation_key)) between 1 and 128
  )
);

create index if not exists idx_table_activity_table_time
  on public.table_activity_logs(restaurant_table_id, created_at desc);
create index if not exists idx_table_activity_order_time
  on public.table_activity_logs(order_id, created_at desc)
  where order_id is not null;
create unique index if not exists idx_table_activity_operation_idempotency
  on public.table_activity_logs(performed_by, action, operation_key)
  where operation_key is not null;

alter table public.table_activity_logs enable row level security;

create policy "Operational staff can read table activity"
on public.table_activity_logs for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER')
  )
);

grant select on public.table_activity_logs to authenticated;
grant all on public.table_activity_logs to service_role;

create or replace function public.log_table_activity(
  p_table_id uuid,
  p_order_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_operation_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.table_activity_logs (
    restaurant_table_id, order_id, action, from_status, to_status,
    performed_by, operation_key, metadata
  ) values (
    p_table_id, p_order_id, p_action, p_from_status, p_to_status,
    auth.uid(), nullif(left(btrim(coalesce(p_operation_key, '')), 128), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (performed_by, action, operation_key)
    where operation_key is not null
  do nothing;
end;
$$;

revoke all on function public.log_table_activity(uuid, uuid, text, text, text, text, jsonb) from public;

create or replace function public.sync_restaurant_table_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_table_status text;
  target_table_status text;
  activity_action text;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select status into prior_table_status
    from public.restaurant_tables
    where id = new.restaurant_table_id
    for update;

    update public.restaurant_tables
    set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id
      and is_active = true
      and status in ('AVAILABLE', 'RESERVED');

    if not found then
      raise exception 'TABLE_NOT_AVAILABLE';
    end if;

    perform public.log_table_activity(
      new.restaurant_table_id, new.id, 'TABLE_OCCUPIED',
      prior_table_status, 'OCCUPIED', new.idempotency_key,
      jsonb_build_object('order_number', new.order_number)
    );
    return new;
  end if;

  if new.status is not distinct from old.status
    and new.payment_status is not distinct from old.payment_status
  then
    return new;
  end if;

  target_table_status := null;
  activity_action := null;

  if new.status = 'COMPLETED' and new.payment_status = 'PAID' then
    target_table_status := 'CLEANING';
    activity_action := 'CLEANING_STARTED';
  elsif new.status = 'CANCELLED' and old.status in ('DRAFT', 'PLACED') then
    target_table_status := 'AVAILABLE';
    activity_action := 'ORDER_CANCELLED';
  elsif new.status = 'CANCELLED' then
    target_table_status := 'CLEANING';
    activity_action := 'ORDER_CANCELLED';
  end if;

  if target_table_status is not null then
    select status into prior_table_status
    from public.restaurant_tables
    where id = new.restaurant_table_id
    for update;

    update public.restaurant_tables
    set status = target_table_status,
        is_active = target_table_status <> 'OUT_OF_SERVICE'
    where id = new.restaurant_table_id;

    perform public.log_table_activity(
      new.restaurant_table_id, new.id, activity_action,
      prior_table_status, target_table_status, null,
      jsonb_build_object(
        'order_number', new.order_number,
        'previous_order_status', old.status,
        'order_status', new.status,
        'payment_status', new.payment_status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_restaurant_table_status on public.orders;
create trigger trg_sync_restaurant_table_status
after insert or update of status, payment_status on public.orders
for each row execute function public.sync_restaurant_table_status();

create or replace function public.complete_table_cleaning(
  p_table_id uuid,
  p_operation_key text default null
)
returns public.restaurant_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into current_table from public.restaurant_tables
  where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'AVAILABLE' then return current_table; end if;
  if current_table.status <> 'CLEANING' then raise exception 'INVALID_TABLE_TRANSITION'; end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_table_id
      and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  update public.restaurant_tables set status = 'AVAILABLE', is_active = true
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null, 'CLEANING_COMPLETED', 'CLEANING', 'AVAILABLE',
    p_operation_key, '{}'::jsonb
  );
  return updated_table;
end;
$$;

create or replace function public.set_table_out_of_service(
  p_table_id uuid,
  p_reason text default null,
  p_operation_key text default null
)
returns public.restaurant_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into current_table from public.restaurant_tables
  where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'OUT_OF_SERVICE' then return current_table; end if;
  if current_table.status not in ('AVAILABLE', 'CLEANING') then
    raise exception 'INVALID_TABLE_TRANSITION';
  end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_table_id
      and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  update public.restaurant_tables set status = 'OUT_OF_SERVICE', is_active = false
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null, 'TABLE_OUT_OF_SERVICE', current_table.status, 'OUT_OF_SERVICE',
    p_operation_key, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500))
  );
  return updated_table;
end;
$$;

create or replace function public.restore_pos_table(
  p_table_id uuid,
  p_operation_key text default null
)
returns public.restaurant_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into current_table from public.restaurant_tables
  where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'AVAILABLE' then return current_table; end if;
  if current_table.status <> 'OUT_OF_SERVICE' then raise exception 'INVALID_TABLE_TRANSITION'; end if;

  update public.restaurant_tables set status = 'AVAILABLE', is_active = true
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null, 'TABLE_RESTORED', 'OUT_OF_SERVICE', 'AVAILABLE',
    p_operation_key, '{}'::jsonb
  );
  return updated_table;
end;
$$;

create or replace function public.move_pos_order(
  p_order_id uuid,
  p_destination_table_id uuid,
  p_operation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  current_order public.orders%rowtype;
  source_table public.restaurant_tables%rowtype;
  destination_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.dining_mode <> 'dine-in' or current_order.restaurant_table_id is null then
    raise exception 'ORDER_HAS_NO_TABLE';
  end if;
  if current_order.status not in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if current_order.restaurant_table_id = p_destination_table_id then
    return jsonb_build_object('order', row_to_json(current_order));
  end if;

  perform 1 from public.restaurant_tables
  where id in (current_order.restaurant_table_id, p_destination_table_id)
  order by id for update;

  select * into source_table from public.restaurant_tables
  where id = current_order.restaurant_table_id;
  select * into destination_table from public.restaurant_tables
  where id = p_destination_table_id;
  if destination_table.id is null then raise exception 'TABLE_NOT_FOUND'; end if;
  if not destination_table.is_active or destination_table.status not in ('AVAILABLE', 'RESERVED') then
    raise exception 'DESTINATION_TABLE_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_destination_table_id
      and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  update public.orders
  set restaurant_table_id = p_destination_table_id,
      table_id = p_destination_table_id::text
  where id = p_order_id returning * into current_order;
  update public.restaurant_tables set status = 'CLEANING', is_active = true
  where id = source_table.id;
  update public.restaurant_tables set status = 'OCCUPIED', is_active = true
  where id = destination_table.id;

  perform public.log_table_activity(
    source_table.id, p_order_id, 'ORDER_MOVED_OUT', source_table.status, 'CLEANING',
    p_operation_key, jsonb_build_object('destination_table_id', destination_table.id)
  );
  perform public.log_table_activity(
    destination_table.id, p_order_id, 'ORDER_MOVED_IN', destination_table.status, 'OCCUPIED',
    p_operation_key, jsonb_build_object('source_table_id', source_table.id)
  );
  return jsonb_build_object(
    'order', row_to_json(current_order),
    'sourceTable', (select row_to_json(t) from public.restaurant_tables t where t.id = source_table.id),
    'destinationTable', (select row_to_json(t) from public.restaurant_tables t where t.id = destination_table.id)
  );
end;
$$;

create or replace function public.transition_restaurant_table(
  p_table_id uuid,
  p_new_status text
)
returns public.restaurant_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  target_status text := upper(trim(coalesce(p_new_status, '')));
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if target_status = 'CLEANING' or target_status = 'OCCUPIED' then
    raise exception 'USE_CONTROLLED_BUSINESS_OPERATION';
  end if;
  if target_status = 'OUT_OF_SERVICE' then
    if staff_role not in ('ADMIN', 'MANAGER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    return public.set_table_out_of_service(p_table_id, null, null);
  end if;
  if target_status = 'AVAILABLE' then
    select * into current_table from public.restaurant_tables where id = p_table_id;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
    if current_table.status = 'CLEANING' then return public.complete_table_cleaning(p_table_id, null); end if;
    if current_table.status = 'OUT_OF_SERVICE' then return public.restore_pos_table(p_table_id, null); end if;
  end if;

  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = target_status then return current_table; end if;
  if not (
    (current_table.status = 'AVAILABLE' and target_status = 'RESERVED') or
    (current_table.status = 'RESERVED' and target_status = 'AVAILABLE')
  ) then raise exception 'INVALID_TABLE_TRANSITION'; end if;

  update public.restaurant_tables set status = target_status, is_active = true
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null,
    case when target_status = 'RESERVED' then 'TABLE_RESERVED' else 'RESERVATION_RELEASED' end,
    current_table.status, target_status, null, '{}'::jsonb
  );
  return updated_table;
end;
$$;

revoke all on function public.complete_table_cleaning(uuid, text) from public;
revoke all on function public.set_table_out_of_service(uuid, text, text) from public;
revoke all on function public.restore_pos_table(uuid, text) from public;
revoke all on function public.move_pos_order(uuid, uuid, text) from public;
revoke all on function public.transition_restaurant_table(uuid, text) from public;
grant execute on function public.complete_table_cleaning(uuid, text) to authenticated;
grant execute on function public.set_table_out_of_service(uuid, text, text) to authenticated;
grant execute on function public.restore_pos_table(uuid, text) to authenticated;
grant execute on function public.move_pos_order(uuid, uuid, text) to authenticated;
grant execute on function public.transition_restaurant_table(uuid, text) to authenticated;

-- Calculate every monetary component once inside the authoritative transaction.
create or replace function public.create_pos_order(
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
  distinct_selected_count integer;
  group_selected_count integer;
  item_option_total numeric(12, 2);
  item_unit_price numeric(12, 2);
  order_subtotal numeric(12, 2) := 0;
  order_tax numeric(12, 2);
  order_service_charge numeric(12, 2);
  order_discount numeric(12, 2) := 0;
  order_total numeric(12, 2);
  selected_table_id uuid;
  order_number_value text;
  normalized_idempotency_key text;
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;
  p_payment_method := upper(p_payment_method);
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'UNSUPPORTED_PAYMENT_METHOD';
  end if;
  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'INVALID_DINING_MODE'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0));

  select * into existing_order from public.orders
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key limit 1;
  if found then
    select * into existing_payment from public.payments
    where order_id = existing_order.id order by created_at desc limit 1;
    return jsonb_build_object(
      'id', existing_order.id, 'order_number', existing_order.order_number,
      'subtotal', existing_order.subtotal, 'tax', existing_order.tax,
      'service_charge', existing_order.service_charge, 'discount', existing_order.discount,
      'total', existing_order.total, 'status', existing_order.status,
      'payment_status', existing_order.payment_status,
      'dining_mode', existing_order.dining_mode,
      'table_id', existing_order.restaurant_table_id,
      'payment_id', existing_payment.id, 'created_at', existing_order.created_at
    );
  end if;

  if p_dining_mode = 'dine-in' then
    begin selected_table_id := p_table_id::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_TABLE_ID'; end;
    perform 1 from public.restaurant_tables
    where id = selected_table_id and is_active = true
      and status in ('AVAILABLE', 'RESERVED') for update;
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists (
      select 1 from public.orders where restaurant_table_id = selected_table_id
        and status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
    ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  end if;

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
    order_subtotal := order_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  order_subtotal := round(order_subtotal, 2);
  order_tax := round(order_subtotal * 0.06, 2);
  order_service_charge := round(order_subtotal * 0.10, 2);
  order_total := round(order_subtotal - order_discount + order_tax + order_service_charge, 2);
  order_number_value := 'POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    || '-' || upper(substr(md5(random()::text), 1, 8));

  insert into public.orders (
    order_number, user_id, subtotal, discount, tax, service_charge, total,
    status, payment_status, dining_mode, table_id, restaurant_table_id, idempotency_key
  ) values (
    order_number_value, current_user_id, order_subtotal, order_discount,
    order_tax, order_service_charge, order_total, 'PLACED', 'PENDING', p_dining_mode,
    case when selected_table_id is null then null else selected_table_id::text end,
    selected_table_id, normalized_idempotency_key
  ) returning * into new_order;

  for order_item in select value from jsonb_array_elements(p_items) loop
    select * into product_record from public.products where id::text = order_item->>'productId';
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    select coalesce(sum(po.price_adjustment), 0) into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    insert into public.order_items (
      order_id, product_id, quantity, unit_price, subtotal,
      product_name_snapshot, special_request
    ) values (
      new_order.id, product_record.id, (order_item->>'quantity')::integer,
      item_unit_price, round(item_unit_price * (order_item->>'quantity')::integer, 2),
      product_record.product_name, nullif(left(order_item->>'specialRequest', 1000), '')
    ) returning * into new_order_item;
    insert into public.order_item_options (
      order_item_id, option_group_name, option_name, price_adjustment
    ) select new_order_item.id, pog.name, po.name, po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  insert into public.payments (
    order_id, user_id, payment_method, amount, reference,
    transaction_reference, provider, status, paid_at
  ) values (
    new_order.id, current_user_id, p_payment_method, new_order.total,
    order_number_value, null, null, 'PENDING', null
  ) returning * into new_payment;

  return jsonb_build_object(
    'id', new_order.id, 'order_number', new_order.order_number,
    'subtotal', new_order.subtotal, 'tax', new_order.tax,
    'service_charge', new_order.service_charge, 'discount', new_order.discount,
    'total', new_order.total, 'status', new_order.status,
    'payment_status', new_order.payment_status,
    'dining_mode', new_order.dining_mode,
    'table_id', new_order.restaurant_table_id,
    'payment_id', new_payment.id, 'created_at', new_order.created_at
  );
end;
$$;

drop trigger if exists trg_split_pos_order_charges on public.orders;

revoke all on function public.create_pos_order(jsonb, text, text, text, text) from public;
grant execute on function public.create_pos_order(jsonb, text, text, text, text) to authenticated;

alter table public.table_activity_logs replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.table_activity_logs;
  exception when duplicate_object then null;
  end;
end $$;
