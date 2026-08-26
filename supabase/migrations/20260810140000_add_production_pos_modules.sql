-- Production POS modules: tables, product options, payments, order lifecycle,
-- status history, and realtime support.

insert into public.roles (name, description)
values
  ('MANAGER', 'Restaurant manager'),
  ('KITCHEN', 'Kitchen display user'),
  ('WAITER', 'Front-of-house waiter')
on conflict (name) do nothing;

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number varchar(20) not null unique,
  table_name varchar(100),
  capacity integer not null check (capacity > 0 and capacity <= 100),
  status varchar(20) not null default 'AVAILABLE'
    check (status in ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED')),
  area varchar(100) not null default 'Indoor',
  qr_code text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.restaurant_tables (table_number, table_name, capacity, area)
values
  ('A01', 'Table A01', 2, 'Indoor'),
  ('A02', 'Table A02', 4, 'Indoor'),
  ('A03', 'Table A03', 4, 'Indoor'),
  ('B01', 'Table B01', 2, 'Outdoor'),
  ('B02', 'Table B02', 6, 'Outdoor'),
  ('B03', 'Table B03', 4, 'Outdoor'),
  ('C01', 'Table C01', 2, 'VIP'),
  ('C02', 'Table C02', 4, 'VIP')
on conflict (table_number) do nothing;

create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name varchar(100) not null,
  selection_type varchar(20) not null check (selection_type in ('SINGLE', 'MULTIPLE')),
  is_required boolean not null default false,
  min_selection integer not null default 0 check (min_selection >= 0),
  max_selection integer not null default 1 check (max_selection >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name),
  check (min_selection <= max_selection)
);

create table if not exists public.product_options (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name varchar(100) not null,
  price_adjustment numeric(10, 2) not null default 0 check (price_adjustment >= 0),
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_group_id, name)
);

create table if not exists public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  option_group_name varchar(100) not null,
  option_name varchar(100) not null,
  price_adjustment numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.order_items
  add column if not exists special_request text;

alter table public.orders
  add column if not exists restaurant_table_id uuid references public.restaurant_tables(id) on delete restrict,
  add column if not exists payment_status varchar(20) not null default 'PENDING';

alter table public.payments
  add column if not exists transaction_reference varchar(150),
  add column if not exists provider varchar(50);

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments drop constraint if exists payments_method_check;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;

update public.payments
set transaction_reference = coalesce(transaction_reference, reference),
    payment_method = case lower(payment_method)
      when 'counter' then 'CASH'
      when 'cash' then 'CASH'
      when 'card' then 'CARD'
      when 'qr' then 'QR'
      when 'ewallet' then 'EWALLET'
      else case when upper(payment_method) in ('CASH', 'CARD', 'QR', 'EWALLET')
        then upper(payment_method) else 'CASH' end
    end,
    status = case upper(status)
      when 'SUCCESS' then 'PAID'
      when 'PAID' then 'PAID'
      when 'PROCESSING' then 'PROCESSING'
      when 'FAILED' then 'FAILED'
      when 'CANCELLED' then 'CANCELLED'
      when 'REFUNDED' then 'REFUNDED'
      else 'PENDING'
    end;

update public.orders
set payment_status = case when upper(status) in ('PAID', 'COMPLETED') then 'PAID' else 'PENDING' end,
    status = case upper(status)
      when 'PAID' then 'COMPLETED'
      when 'PENDING' then 'PLACED'
      when 'DRAFT' then 'DRAFT'
      when 'PLACED' then 'PLACED'
      when 'CONFIRMED' then 'CONFIRMED'
      when 'PREPARING' then 'PREPARING'
      when 'READY' then 'READY'
      when 'SERVED' then 'SERVED'
      when 'COMPLETED' then 'COMPLETED'
      when 'CANCELLED' then 'CANCELLED'
      when 'REFUNDED' then 'REFUNDED'
      else 'PLACED'
    end;

alter table public.orders
  add constraint orders_status_check check (
    status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'REFUNDED')
  ),
  add constraint orders_payment_status_check check (
    payment_status in ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')
  );

alter table public.payments
  add constraint payments_status_check check (
    status in ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')
  ),
  add constraint payments_method_check check (
    payment_method in ('CASH', 'CARD', 'QR', 'EWALLET')
  );

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status varchar(20),
  new_status varchar(20) not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  notes text
);

create index if not exists idx_restaurant_tables_area_status
  on public.restaurant_tables(area, status) where is_active = true;
create index if not exists idx_option_groups_product
  on public.product_option_groups(product_id, sort_order);
create index if not exists idx_product_options_group
  on public.product_options(option_group_id, sort_order);
create index if not exists idx_order_item_options_item
  on public.order_item_options(order_item_id);
create index if not exists idx_order_history_order_time
  on public.order_status_history(order_id, changed_at);
create index if not exists idx_orders_restaurant_table
  on public.orders(restaurant_table_id) where restaurant_table_id is not null;

drop trigger if exists trg_restaurant_tables_updated_at on public.restaurant_tables;
create trigger trg_restaurant_tables_updated_at
before update on public.restaurant_tables
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_product_option_groups_updated_at on public.product_option_groups;
create trigger trg_product_option_groups_updated_at
before update on public.product_option_groups
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_product_options_updated_at on public.product_options;
create trigger trg_product_options_updated_at
before update on public.product_options
for each row execute function public.update_updated_at_column();

create or replace function public.record_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (
      order_id, previous_status, new_status, changed_by, notes
    ) values (
      new.id, null, new.status, auth.uid(),
      nullif(current_setting('app.status_change_notes', true), '')
    );
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (
      order_id, previous_status, new_status, changed_by, notes
    ) values (
      new.id, old.status, new.status, auth.uid(),
      nullif(current_setting('app.status_change_notes', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_order_status_change on public.orders;
create trigger trg_record_order_status_change
after insert or update of status on public.orders
for each row execute function public.record_order_status_change();

create or replace function public.sync_restaurant_table_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dining_mode = 'dine-in' and new.restaurant_table_id is not null then
    if new.status in ('CANCELLED', 'REFUNDED')
      or (new.status = 'COMPLETED' and new.payment_status = 'PAID')
    then
      update public.restaurant_tables
      set status = 'AVAILABLE'
      where id = new.restaurant_table_id and is_active = true;
    elsif new.status not in ('COMPLETED', 'CANCELLED', 'REFUNDED') then
      update public.restaurant_tables
      set status = 'OCCUPIED'
      where id = new.restaurant_table_id and is_active = true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_restaurant_table_status on public.orders;
create trigger trg_sync_restaurant_table_status
after insert or update of status, payment_status, restaurant_table_id on public.orders
for each row execute function public.sync_restaurant_table_status();

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
  updated_order public.orders%rowtype;
begin
  select role_name into staff_role from public.profiles where id = auth.uid();
  select * into current_order from public.orders where id = p_order_id for update;

  if not found then raise exception 'Order does not exist'; end if;
  if current_order.user_id <> auth.uid()
    and coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  then raise exception 'Not authorized to update this order'; end if;

  if not (
    (current_order.status = 'DRAFT' and p_new_status in ('PLACED', 'CANCELLED')) or
    (current_order.status = 'PLACED' and p_new_status in ('CONFIRMED', 'CANCELLED')) or
    (current_order.status = 'CONFIRMED' and p_new_status in ('PREPARING', 'CANCELLED')) or
    (current_order.status = 'PREPARING' and p_new_status in ('READY', 'CANCELLED')) or
    (current_order.status = 'READY' and p_new_status in ('SERVED', 'CANCELLED')) or
    (current_order.status = 'SERVED' and p_new_status = 'COMPLETED') or
    (current_order.status = 'COMPLETED' and p_new_status = 'REFUNDED')
  ) then raise exception 'Invalid order status transition from % to %', current_order.status, p_new_status;
  end if;

  if p_new_status = 'COMPLETED' and current_order.payment_status <> 'PAID' then
    raise exception 'An order cannot be completed before payment is settled';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  update public.orders set status = p_new_status where id = p_order_id returning * into updated_order;
  return updated_order;
end;
$$;

create or replace function public.set_pos_payment_method(
  p_payment_id uuid,
  p_payment_method text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare updated_payment public.payments%rowtype;
begin
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'Unsupported payment method';
  end if;
  update public.payments
  set payment_method = p_payment_method
  where id = p_payment_id and user_id = auth.uid() and status in ('PENDING', 'FAILED')
  returning * into updated_payment;
  if not found then raise exception 'Payment does not exist or cannot be changed'; end if;
  return updated_payment;
end;
$$;

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
  updated_order public.orders%rowtype;
begin
  select * into current_payment
  from public.payments
  where id = p_payment_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Payment does not exist'; end if;
  if current_payment.status = 'PAID' then
    select * into updated_order from public.orders where id = current_payment.order_id;
    return jsonb_build_object('payment', row_to_json(current_payment), 'order', row_to_json(updated_order));
  end if;
  if current_payment.status not in ('PENDING', 'PROCESSING', 'FAILED') then
    raise exception 'Payment cannot be confirmed from status %', current_payment.status;
  end if;

  update public.payments
  set status = 'PAID', provider = left(p_provider, 50),
      transaction_reference = left(p_transaction_reference, 150), paid_at = now()
  where id = p_payment_id
  returning * into current_payment;

  update public.orders
  set payment_status = 'PAID'
  where id = current_payment.order_id
  returning * into updated_order;

  return jsonb_build_object('payment', row_to_json(current_payment), 'order', row_to_json(updated_order));
end;
$$;

-- Rebuild order creation so prices/options/table availability are authoritative
-- and payment starts pending rather than being trusted as successful.
drop function if exists public.create_pos_order(jsonb, text, text, text);
create function public.create_pos_order(
  p_items jsonb,
  p_payment_method text,
  p_dining_mode text,
  p_table_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
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
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Between 1 and 100 order items are required';
  end if;
  p_payment_method := upper(p_payment_method);
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then raise exception 'Unsupported payment method'; end if;
  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'Unsupported dining mode'; end if;

  if p_dining_mode = 'dine-in' then
    begin selected_table_id := p_table_id::uuid;
    exception when invalid_text_representation then raise exception 'Invalid restaurant table ID'; end;
    perform 1 from public.restaurant_tables
    where id = selected_table_id and is_active = true and status = 'AVAILABLE'
    for update;
    if not found then raise exception 'Restaurant table is not available'; end if;
  end if;

  for order_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(order_item) <> 'object'
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
      or (order_item->>'quantity')::numeric not between 1 and 99
    then raise exception 'Each item requires a productId and quantity from 1 to 99'; end if;

    select * into product_record from public.products
    where id::text = order_item->>'productId' and status = true;
    if not found then raise exception 'Product % is not available', order_item->>'productId'; end if;

    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(selected_option_ids) <> 'array' then raise exception 'optionIds must be an array'; end if;

    select count(*), coalesce(sum(po.price_adjustment), 0)
    into selected_count, item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id and po.is_available = true
    join public.product_option_groups pog on pog.id = po.option_group_id and pog.product_id = product_record.id;

    if selected_count <> jsonb_array_length(selected_option_ids) then
      raise exception 'One or more selected options are invalid or unavailable';
    end if;

    for group_record in
      select * from public.product_option_groups where product_id = product_record.id
    loop
      select count(*) into group_selected_count
      from jsonb_array_elements_text(selected_option_ids) selected(id)
      join public.product_options po on po.id::text = selected.id
      where po.option_group_id = group_record.id;
      if group_selected_count < group_record.min_selection
        or group_selected_count > group_record.max_selection
        or (group_record.is_required and group_selected_count = 0)
      then raise exception 'Invalid selection count for option group %', group_record.name; end if;
    end loop;

    item_unit_price := product_record.sell_price + item_option_total;
    order_subtotal := order_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  order_subtotal := round(order_subtotal, 2);
  order_tax := round(order_subtotal * 0.16, 2);
  order_total := order_subtotal + order_tax;
  order_number_value := 'POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(md5(random()::text), 1, 8));

  insert into public.orders (
    order_number, user_id, subtotal, discount, tax, total, status,
    payment_status, dining_mode, table_id, restaurant_table_id
  ) values (
    order_number_value, current_user_id, order_subtotal, 0, order_tax, order_total,
    'PLACED', 'PENDING', p_dining_mode,
    case when selected_table_id is null then null else p_table_id end,
    selected_table_id
  ) returning * into new_order;

  for order_item in select value from jsonb_array_elements(p_items)
  loop
    select * into product_record from public.products where id::text = order_item->>'productId';
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    select coalesce(sum(po.price_adjustment), 0) into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;
    item_unit_price := product_record.sell_price + item_option_total;

    insert into public.order_items (
      order_id, product_id, quantity, unit_price, subtotal,
      product_name_snapshot, special_request
    ) values (
      new_order.id, product_record.id, (order_item->>'quantity')::integer,
      item_unit_price, item_unit_price * (order_item->>'quantity')::integer,
      product_record.product_name, nullif(left(order_item->>'specialRequest', 1000), '')
    ) returning * into new_order_item;

    insert into public.order_item_options (
      order_item_id, option_group_name, option_name, price_adjustment
    )
    select new_order_item.id, pog.name, po.name, po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  insert into public.payments (
    order_id, user_id, payment_method, amount, reference,
    transaction_reference, provider, status, paid_at
  ) values (
    new_order.id, current_user_id, p_payment_method, order_total,
    order_number_value, null, null, 'PENDING', null
  ) returning * into new_payment;

  return jsonb_build_object(
    'id', new_order.id, 'order_number', new_order.order_number,
    'subtotal', new_order.subtotal, 'tax', new_order.tax, 'total', new_order.total,
    'status', new_order.status, 'payment_status', new_order.payment_status,
    'dining_mode', new_order.dining_mode, 'table_id', new_order.restaurant_table_id,
    'payment_id', new_payment.id, 'created_at', new_order.created_at
  );
end;
$$;

alter table public.restaurant_tables enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;
alter table public.order_item_options enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists "Authenticated users can read restaurant tables" on public.restaurant_tables;
create policy "Authenticated users can read restaurant tables"
on public.restaurant_tables for select to authenticated using (true);
drop policy if exists "Authenticated users can read option groups" on public.product_option_groups;
create policy "Authenticated users can read option groups"
on public.product_option_groups for select to authenticated using (true);
drop policy if exists "Authenticated users can read product options" on public.product_options;
create policy "Authenticated users can read product options"
on public.product_options for select to authenticated using (true);
drop policy if exists "Users can read own order item options" on public.order_item_options;
create policy "Users can read own order item options"
on public.order_item_options for select to authenticated using (
  exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_options.order_item_id and o.user_id = auth.uid()
  )
);
drop policy if exists "Staff can read order status history" on public.order_status_history;
create policy "Staff can read order status history"
on public.order_status_history for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER'))
);

grant select on public.restaurant_tables, public.product_option_groups, public.product_options to authenticated;
grant select on public.order_item_options, public.order_status_history to authenticated;
grant execute on function public.create_pos_order(jsonb, text, text, text) to authenticated;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;
grant execute on function public.set_pos_payment_method(uuid, text) to authenticated;
grant execute on function public.confirm_pos_payment(uuid, text, text) to authenticated;
grant all on public.restaurant_tables, public.product_option_groups, public.product_options,
  public.order_item_options, public.order_status_history to service_role;

alter table public.restaurant_tables replica identity full;
alter table public.orders replica identity full;
alter table public.order_items replica identity full;
alter table public.payments replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.restaurant_tables; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.payments; exception when duplicate_object then null; end;
end;
$$;
