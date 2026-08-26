-- Keep order lifecycle authorization inside PostgreSQL so callers cannot use
-- the generic transition RPC to perform work outside their operational role.

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
  target_status text := upper(trim(coalesce(p_new_status, '')));
  updated_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select role_name into staff_role
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';

  if staff_role is null then
    raise exception 'An active staff profile is required';
  end if;

  select * into current_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order does not exist';
  end if;

  if not (
    (current_order.status = 'DRAFT' and target_status in ('PLACED', 'CANCELLED')) or
    (current_order.status = 'PLACED' and target_status in ('CONFIRMED', 'CANCELLED')) or
    (current_order.status = 'CONFIRMED' and target_status in ('PREPARING', 'CANCELLED')) or
    (current_order.status = 'PREPARING' and target_status in ('READY', 'CANCELLED')) or
    (current_order.status = 'READY' and target_status in ('SERVED', 'CANCELLED')) or
    (current_order.status = 'SERVED' and target_status = 'COMPLETED') or
    (current_order.status = 'COMPLETED' and target_status = 'REFUNDED')
  ) then
    raise exception 'Invalid order status transition from % to %', current_order.status, target_status;
  end if;

  if staff_role not in ('ADMIN', 'MANAGER') then
    if target_status = 'CANCELLED' then
      if current_order.user_id <> auth.uid() or current_order.status not in ('DRAFT', 'PLACED') then
        raise exception 'Only a manager may cancel an order after kitchen confirmation';
      end if;
    elsif staff_role = 'KITCHEN' and target_status not in ('CONFIRMED', 'PREPARING', 'READY') then
      raise exception 'Kitchen staff are not authorized for this transition';
    elsif staff_role = 'WAITER' and target_status <> 'SERVED' then
      raise exception 'Waiter staff are not authorized for this transition';
    elsif staff_role = 'CASHIER' and target_status <> 'COMPLETED' then
      raise exception 'Cashier staff are not authorized for this transition';
    elsif staff_role not in ('KITCHEN', 'WAITER', 'CASHIER') then
      raise exception 'Not authorized to update this order';
    end if;
  end if;

  if target_status = 'COMPLETED' and current_order.payment_status <> 'PAID' then
    raise exception 'An order cannot be completed before payment is settled';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  update public.orders
  set status = target_status
  where id = p_order_id
  returning * into updated_order;

  return updated_order;
end;
$$;

revoke all on function public.transition_pos_order(uuid, text, text) from public;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;

drop policy if exists "Staff can read all order item options" on public.order_item_options;
create policy "Staff can read all order item options"
on public.order_item_options for select to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);
