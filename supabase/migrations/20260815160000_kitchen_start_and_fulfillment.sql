-- Persist the real kitchen start time and provide one atomic START action.

alter table public.orders
  add column if not exists kitchen_started_at timestamptz;

update public.orders
set kitchen_started_at = coalesce(kitchen_started_at, updated_at, created_at)
where status in ('PREPARING', 'READY');

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
  if ord.payment_status <> 'PENDING' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status = 'PREPARING' then return ord; end if;
  if ord.status not in ('PLACED', 'CONFIRMED') then raise exception 'ORDER_NOT_READY_TO_START'; end if;

  if ord.status = 'PLACED' then
    perform set_config('app.status_change_notes', 'Kitchen accepted order', true);
    update public.orders set status = 'CONFIRMED' where id = p_order_id;
  end if;

  update public.order_items set item_status = 'PREPARING'
  where order_id = p_order_id and item_status = 'SUBMITTED';

  perform set_config('app.status_change_notes', 'Kitchen started preparation', true);
  update public.orders
    set status = 'PREPARING', kitchen_started_at = clock_timestamp()
    where id = p_order_id returning * into ord;
  return ord;
end;
$$;

revoke all on function public.start_kitchen_order(uuid) from public;
grant execute on function public.start_kitchen_order(uuid) to authenticated;

-- READY is fulfilled according to order type. This restores the operational
-- distinction between serving a table and collecting a takeaway.
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
  role text;
  target text := upper(trim(coalesce(p_new_status, '')));
  result public.orders%rowtype;
begin
  select role_name into role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if target = 'CANCELLED' then
    if ord.payment_status = 'PAID' then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if role not in ('ADMIN', 'MANAGER') and (ord.user_id <> auth.uid() or ord.status not in ('DRAFT', 'PLACED'))
      then raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'; end if;
    update public.order_items set item_status = 'VOIDED',
      void_reason = coalesce(nullif(left(p_notes, 1000), ''), 'Order cancelled'),
      voided_by = auth.uid(), voided_at = now()
    where order_id = p_order_id and item_status not in ('SERVED', 'COLLECTED', 'VOIDED');
    update public.payments set status = 'CANCELLED'
    where order_id = p_order_id and status in ('PENDING', 'PROCESSING', 'FAILED');
    update public.orders set status = 'CANCELLED', payment_status = 'CANCELLED'
    where id = p_order_id returning * into result;
    return result;
  end if;

  if not (
    (ord.status = 'PLACED' and target = 'CONFIRMED') or
    (ord.status = 'CONFIRMED' and target = 'PREPARING') or
    (ord.status = 'PREPARING' and target = 'READY') or
    (ord.status = 'READY' and target in ('SERVED', 'COLLECTED')) or
    (ord.status in ('SERVED', 'COLLECTED') and target = 'COMPLETED')
  ) then raise exception 'INVALID_ORDER_TRANSITION'; end if;

  if role not in ('ADMIN', 'MANAGER') then
    if role = 'KITCHEN' and target not in ('CONFIRMED', 'PREPARING', 'READY') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if role = 'WAITER' and target not in ('SERVED', 'COLLECTED') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if role = 'CASHIER' and target <> 'COMPLETED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if target = 'SERVED' and ord.dining_mode <> 'dine-in' then raise exception 'INVALID_FULFILLMENT_STATUS'; end if;
  if target = 'COLLECTED' and ord.dining_mode <> 'takeaway' then raise exception 'INVALID_FULFILLMENT_STATUS'; end if;
  if target = 'COMPLETED' and ord.payment_status <> 'PAID' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;

  if target = 'PREPARING' then
    update public.order_items set item_status = 'PREPARING'
    where order_id = p_order_id and item_status = 'SUBMITTED';
  elsif target = 'READY' then
    update public.order_items set item_status = 'READY'
    where order_id = p_order_id and item_status in ('SUBMITTED', 'PREPARING');
  elsif target in ('SERVED', 'COLLECTED') then
    update public.order_items set item_status = target
    where order_id = p_order_id and item_status = 'READY';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  update public.orders
  set status = case when target in ('SERVED', 'COLLECTED') and payment_status = 'PAID' then 'COMPLETED' else target end,
      kitchen_started_at = case when target = 'PREPARING' then coalesce(kitchen_started_at, clock_timestamp()) else kitchen_started_at end
  where id = p_order_id returning * into result;
  return result;
end;
$$;

revoke all on function public.transition_pos_order(uuid, text, text) from public;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;

