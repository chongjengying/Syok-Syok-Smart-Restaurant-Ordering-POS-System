-- Phase 10: a READY dine-in order is explicitly served by front-of-house.
-- Serving is deliberately separate from payment and completion.

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
  select role_name into staff_role
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';

  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.dining_mode <> 'dine-in' then raise exception 'DINE_IN_ORDER_REQUIRED'; end if;
  if ord.status = 'SERVED' then return ord; end if;
  if ord.status <> 'READY' then raise exception 'ORDER_NOT_READY'; end if;

  update public.order_items
  set item_status = 'SERVED'
  where order_id = p_order_id and item_status = 'READY';

  perform set_config('app.status_change_notes', 'Waiter served order', true);
  update public.orders
  set status = 'SERVED'
  where id = p_order_id
  returning * into ord;

  return ord;
end;
$$;

revoke all on function public.serve_ready_order(uuid) from public;
grant execute on function public.serve_ready_order(uuid) to authenticated;
