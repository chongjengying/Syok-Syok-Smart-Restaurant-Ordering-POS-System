-- A settled bill is immutable, but the guests may continue ordering at the
-- same table. Keep the table occupied and allow one new unpaid bill.

create or replace function public.sync_restaurant_table_status() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prior text;
  has_other_operational_order boolean;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id and is_active for update;
    if prior is null or prior not in ('AVAILABLE', 'RESERVED', 'OCCUPIED') then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists (
      select 1 from public.orders existing
      where existing.restaurant_table_id = new.restaurant_table_id
        and existing.id <> new.id
        and existing.payment_status in ('UNPAID', 'PARTIALLY_PAID')
        and existing.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
    ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
    update public.restaurant_tables set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id;
    perform public.log_table_activity(
      new.restaurant_table_id, new.id,
      case when prior = 'OCCUPIED' then 'NEW_BILL_AFTER_PAYMENT' else 'TABLE_OCCUPIED' end,
      prior, 'OCCUPIED', new.idempotency_key,
      jsonb_build_object('order_number', new.order_number)
    );
    return new;
  end if;

  select exists (
    select 1 from public.orders other_order
    where other_order.restaurant_table_id = new.restaurant_table_id
      and other_order.id <> new.id
      and other_order.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) into has_other_operational_order;

  if new.status = 'COMPLETED' and new.payment_status = 'PAID'
    and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id for update;
    update public.restaurant_tables set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id;
    if not has_other_operational_order then
      perform public.log_table_activity(
        new.restaurant_table_id, new.id, 'PAYMENT_COMPLETED', prior, 'OCCUPIED', null,
        jsonb_build_object('order_number', new.order_number, 'new_bill_allowed', true)
      );
    end if;
  elsif new.status = 'CANCELLED' then
    if has_other_operational_order then
      update public.restaurant_tables set status = 'OCCUPIED', is_active = true
      where id = new.restaurant_table_id;
    elsif old.status in ('DRAFT', 'CONFIRMED') then
      update public.restaurant_tables set status = 'AVAILABLE', is_active = true
      where id = new.restaurant_table_id;
    else
      update public.restaurant_tables set status = 'CLEANING', is_active = true
      where id = new.restaurant_table_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.start_table_cleaning(
  p_table_id uuid,
  p_operation_key text
) returns public.restaurant_tables
language plpgsql security definer set search_path = public
as $$
declare
  staff_role text;
  normalized_key text := nullif(left(btrim(coalesce(p_operation_key, '')), 128), '');
  current_table public.restaurant_tables%rowtype;
  result public.restaurant_tables%rowtype;
  prior_log public.table_activity_logs%rowtype;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('start-cleaning:' || normalized_key, 0));

  select * into prior_log from public.table_activity_logs log where log.operation_key = normalized_key limit 1;
  if found then
    if prior_log.restaurant_table_id <> p_table_id or prior_log.action <> 'CLEANING_STARTED' then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    select * into result from public.restaurant_tables where id = p_table_id;
    return result;
  end if;

  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'CLEANING' then return current_table; end if;
  if current_table.status <> 'OCCUPIED' then raise exception 'TABLE_NOT_AWAITING_CLEANING'; end if;
  if exists (
    select 1 from public.orders
    where restaurant_table_id = p_table_id
      and payment_status in ('UNPAID', 'PARTIALLY_PAID')
      and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'TABLE_HAS_ACTIVE_ORDER'; end if;
  if exists (
    select 1 from public.orders ord join public.order_items item on item.order_id = ord.id
    where ord.restaurant_table_id = p_table_id
      and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
  ) then raise exception 'KITCHEN_ITEMS_NOT_FULFILLED'; end if;

  update public.restaurant_tables set status = 'CLEANING', is_active = true
  where id = p_table_id returning * into result;
  perform public.log_table_activity(
    p_table_id, null, 'CLEANING_STARTED', 'OCCUPIED', 'CLEANING', normalized_key,
    jsonb_build_object('manual', true)
  );
  return result;
end;
$$;

revoke all on function public.sync_restaurant_table_status() from public, anon, authenticated;
revoke all on function public.start_table_cleaning(uuid, text) from public, anon;
grant execute on function public.start_table_cleaning(uuid, text) to authenticated;
