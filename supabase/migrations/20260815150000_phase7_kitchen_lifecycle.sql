-- Phase 7 kitchen lifecycle: CONFIRMED -> PREPARING -> READY -> SERVED.
-- PLACED remains the submitted/awaiting-acceptance state immediately before
-- CONFIRMED. Both dine-in and takeaway orders finish kitchen handling at
-- SERVED; payment completion remains a separate workflow.

-- A takeaway order cannot contain dine-in service rows. This also protects the
-- direct place_order path, whose insert relies on the column default.
update public.order_items item
set service_mode = 'TAKEAWAY'
from public.orders ord
where ord.id = item.order_id
  and ord.dining_mode = 'takeaway'
  and item.service_mode <> 'TAKEAWAY';

create or replace function public.enforce_takeaway_order_item_service_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and dining_mode = 'takeaway'
  ) then
    new.service_mode := 'TAKEAWAY';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_takeaway_order_item_service_mode on public.order_items;
create trigger trg_enforce_takeaway_order_item_service_mode
before insert or update of order_id, service_mode on public.order_items
for each row execute function public.enforce_takeaway_order_item_service_mode();

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
  select role_name into role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if target = 'CANCELLED' then
    if ord.payment_status = 'PAID' then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if role not in ('ADMIN', 'MANAGER')
      and (ord.user_id <> auth.uid() or ord.status not in ('DRAFT', 'PLACED'))
    then raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'; end if;
    update public.order_items
      set item_status = 'VOIDED',
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
    (ord.status = 'READY' and target = 'SERVED') or
    (ord.status in ('SERVED', 'COLLECTED') and target = 'COMPLETED')
  ) then raise exception 'INVALID_ORDER_TRANSITION'; end if;

  if role not in ('ADMIN', 'MANAGER') then
    if role = 'KITCHEN' and target not in ('CONFIRMED', 'PREPARING', 'READY') then
      raise exception 'INSUFFICIENT_PERMISSION';
    end if;
    if role = 'WAITER' and target <> 'SERVED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if role = 'CASHIER' and target <> 'COMPLETED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if target = 'COMPLETED' and ord.payment_status <> 'PAID' then
    raise exception 'PAYMENT_NOT_CONFIRMED';
  end if;

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
    set status = case when target = 'SERVED' and payment_status = 'PAID' then 'COMPLETED' else target end
    where id = p_order_id returning * into result;
  return result;
end;
$$;

revoke all on function public.transition_pos_order(uuid, text, text) from public;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;
