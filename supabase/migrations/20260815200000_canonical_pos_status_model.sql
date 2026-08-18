-- Canonical POS status model.
-- Persisted values remain uppercase to match the existing database convention;
-- API/UI labels may render them in lowercase/title case.

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.restaurant_tables drop constraint if exists restaurant_tables_status_check;
alter table public.order_items drop constraint if exists order_items_item_status_check;

update public.orders
set status = case status
  when 'PLACED' then 'CONFIRMED'
  when 'COLLECTED' then 'SERVED'
  when 'REFUNDED' then 'COMPLETED'
  else status
end,
payment_status = case payment_status
  when 'PAID' then 'PAID'
  when 'REFUNDED' then 'REFUNDED'
  else 'UNPAID'
end;

update public.order_items
set item_status = 'SERVED'
where item_status = 'COLLECTED';

update public.restaurant_tables
set status = 'DISABLED', is_active = false
where status = 'OUT_OF_SERVICE';

alter table public.orders alter column status set default 'DRAFT';
alter table public.orders alter column payment_status set default 'UNPAID';

alter table public.orders
  add constraint orders_status_check check (
    status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED')
  ),
  add constraint orders_payment_status_check check (
    payment_status in ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED')
  );

alter table public.restaurant_tables
  add constraint restaurant_tables_status_check check (
    status in ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED')
  );

alter table public.order_items
  add constraint order_items_item_status_check check (
    item_status in ('DRAFT', 'SUBMITTED', 'PREPARING', 'READY', 'SERVED', 'VOIDED')
  );

-- Compatibility normalizers make rolling deployments safe while older Edge
-- Function instances drain. New application code only emits canonical values.
create or replace function public.normalize_pos_status_values()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'orders' then
    new.status := case new.status
      when 'PLACED' then 'CONFIRMED'
      when 'COLLECTED' then 'SERVED'
      when 'REFUNDED' then 'COMPLETED'
      else new.status
    end;
    new.payment_status := case new.payment_status
      when 'PENDING' then 'UNPAID'
      when 'PROCESSING' then 'UNPAID'
      when 'FAILED' then 'UNPAID'
      when 'CANCELLED' then 'UNPAID'
      else new.payment_status
    end;
  elsif tg_table_name = 'order_items' then
    if new.item_status = 'COLLECTED' then new.item_status := 'SERVED'; end if;
  elsif tg_table_name = 'restaurant_tables' then
    if new.status = 'OUT_OF_SERVICE' then new.status := 'DISABLED'; end if;
    if new.status = 'DISABLED' then new.is_active := false; end if;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_pos_status_values() from public, anon, authenticated;

drop trigger if exists trg_normalize_order_status_values on public.orders;
create trigger trg_normalize_order_status_values
before insert or update of status, payment_status on public.orders
for each row execute function public.normalize_pos_status_values();

drop trigger if exists trg_normalize_order_item_status_values on public.order_items;
create trigger trg_normalize_order_item_status_values
before insert or update of item_status on public.order_items
for each row execute function public.normalize_pos_status_values();

drop trigger if exists trg_normalize_table_status_values on public.restaurant_tables;
create trigger trg_normalize_table_status_values
before insert or update of status on public.restaurant_tables
for each row execute function public.normalize_pos_status_values();

-- Rewrite deployed private workers and lifecycle helpers without duplicating
-- their audited transaction bodies. Only exact legacy domain literals and
-- order.payment_status comparisons are changed; payment-attempt PENDING states
-- intentionally remain intact in public.payments.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname <> 'normalize_pos_status_values'
  loop
    definition := pg_get_functiondef(fn.oid);
    if definition like '%''PLACED''%'
      or definition like '%''COLLECTED''%'
      or definition like '%''OUT_OF_SERVICE''%'
      or definition like '%payment_status%''PENDING''%'
      or definition like '%payment_status%''CANCELLED''%'
    then
      definition := replace(definition, '''PLACED''', '''CONFIRMED''');
      definition := replace(definition, '''COLLECTED''', '''SERVED''');
      definition := replace(definition, '''OUT_OF_SERVICE''', '''DISABLED''');
      definition := replace(definition, 'payment_status <> ''PENDING''', 'payment_status <> ''UNPAID''');
      definition := replace(definition, 'payment_status<>''PENDING''', 'payment_status<>''UNPAID''');
      definition := replace(definition, 'payment_status = ''PENDING''', 'payment_status = ''UNPAID''');
      definition := replace(definition, 'payment_status=''PENDING''', 'payment_status=''UNPAID''');
      definition := replace(definition, 'payment_status = ''CANCELLED''', 'payment_status = ''UNPAID''');
      definition := replace(definition, 'payment_status=''CANCELLED''', 'payment_status=''UNPAID''');
      execute definition;
    end if;
  end loop;
end;
$$;

create or replace function public.start_kitchen_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  ord public.orders%rowtype;
  staff_role text;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status = 'PREPARING' then return ord; end if;
  if ord.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_READY_TO_START'; end if;

  update public.order_items set item_status = 'PREPARING'
  where order_id = p_order_id and item_status = 'SUBMITTED';
  perform set_config('app.status_change_notes', 'Kitchen started preparation', true);
  update public.orders
  set status = 'PREPARING', kitchen_started_at = clock_timestamp()
  where id = p_order_id returning * into ord;
  return ord;
end;
$$;

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
  ord public.orders%rowtype;
  staff_role text;
  target text := upper(trim(coalesce(p_new_status, '')));
  result public.orders%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if staff_role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  if target not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if target = 'CANCELLED' then
    if ord.payment_status in ('PAID', 'PARTIALLY_PAID') then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if staff_role not in ('ADMIN', 'MANAGER')
      and (ord.user_id <> auth.uid() or ord.status not in ('DRAFT', 'CONFIRMED'))
    then raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'; end if;
    update public.order_items
    set item_status = 'VOIDED',
        void_reason = coalesce(nullif(left(p_notes, 1000), ''), 'Order cancelled'),
        voided_by = auth.uid(), voided_at = now()
    where order_id = p_order_id and item_status not in ('SERVED', 'VOIDED');
    update public.payments set status = 'CANCELLED'
    where order_id = p_order_id and status in ('PENDING', 'PROCESSING', 'FAILED');
    update public.orders set status = 'CANCELLED', payment_status = 'UNPAID'
    where id = p_order_id returning * into result;
    return result;
  end if;

  if not (
    (ord.status = 'DRAFT' and target = 'CONFIRMED') or
    (ord.status = 'CONFIRMED' and target = 'PREPARING') or
    (ord.status = 'PREPARING' and target = 'READY') or
    (ord.status = 'READY' and target = 'SERVED') or
    (ord.status = 'SERVED' and target = 'COMPLETED')
  ) then raise exception 'INVALID_ORDER_TRANSITION'; end if;

  if staff_role not in ('ADMIN', 'MANAGER') then
    if staff_role = 'KITCHEN' and target not in ('PREPARING', 'READY') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if staff_role in ('WAITER', 'CASHIER') and target <> 'SERVED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if target = 'COMPLETED' and ord.payment_status <> 'PAID' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;

  if target = 'PREPARING' then
    update public.order_items set item_status = 'PREPARING'
    where order_id = p_order_id and item_status = 'SUBMITTED';
  elsif target = 'READY' then
    update public.order_items set item_status = 'READY'
    where order_id = p_order_id and item_status in ('SUBMITTED', 'PREPARING');
  elsif target = 'SERVED' then
    update public.order_items set item_status = 'SERVED'
    where order_id = p_order_id and item_status = 'READY';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  update public.orders
  set status = case when target = 'SERVED' and payment_status = 'PAID' then 'COMPLETED' else target end,
      kitchen_started_at = case
        when target = 'PREPARING' then coalesce(kitchen_started_at, clock_timestamp())
        else kitchen_started_at
      end
  where id = p_order_id returning * into result;
  return result;
end;
$$;

create or replace function public.serve_ready_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  ord public.orders%rowtype;
  staff_role text;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status = 'SERVED' then return ord; end if;
  if ord.status <> 'READY' then raise exception 'ORDER_NOT_READY'; end if;
  update public.order_items set item_status = 'SERVED'
  where order_id = p_order_id and item_status = 'READY';
  perform set_config('app.status_change_notes', 'Order served', true);
  update public.orders
  set status = case when payment_status = 'PAID' then 'COMPLETED' else 'SERVED' end
  where id = p_order_id returning * into ord;
  return ord;
end;
$$;

-- Rebuild the canonical active-table uniqueness predicate.
drop index if exists public.idx_one_active_order_per_restaurant_table;
create unique index idx_one_active_order_per_restaurant_table
on public.orders(restaurant_table_id)
where restaurant_table_id is not null
  and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED');

revoke all on function public.start_kitchen_order(uuid) from public, anon;
revoke all on function public.transition_pos_order(uuid, text, text) from public, anon;
revoke all on function public.serve_ready_order(uuid) from public, anon;
grant execute on function public.start_kitchen_order(uuid) to authenticated;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;
grant execute on function public.serve_ready_order(uuid) to authenticated;
