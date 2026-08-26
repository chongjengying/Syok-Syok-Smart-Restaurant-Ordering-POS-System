-- Phase 4: enforce restaurant-table state transitions and serialize concurrent
-- state changes. Order placement continues to claim available tables inside
-- create_pos_order, while this RPC handles explicit staff operations.

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
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
  staff_role text;
  target_status text := upper(coalesce(trim(p_new_status), ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  select role_name into staff_role
  from public.profiles
  where id = auth.uid() and status = 'ACTIVE';

  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'Administrator, manager, or waiter access is required';
  end if;

  if target_status not in ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED') then
    raise exception 'Restaurant table status is invalid';
  end if;

  select * into current_table
  from public.restaurant_tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Restaurant table does not exist';
  end if;

  if current_table.status = target_status then
    return current_table;
  end if;

  if staff_role = 'WAITER' and target_status = 'DISABLED' then
    raise exception 'Only administrators and managers may disable tables';
  end if;

  if not (
    (current_table.status = 'AVAILABLE' and target_status in ('OCCUPIED', 'RESERVED', 'DISABLED')) or
    (current_table.status = 'RESERVED' and target_status in ('AVAILABLE', 'OCCUPIED', 'DISABLED')) or
    (current_table.status = 'OCCUPIED' and target_status in ('AVAILABLE', 'CLEANING')) or
    (current_table.status = 'CLEANING' and target_status in ('AVAILABLE', 'DISABLED')) or
    (current_table.status = 'DISABLED' and target_status = 'AVAILABLE')
  ) then
    raise exception 'Invalid restaurant table transition from % to %', current_table.status, target_status;
  end if;

  if target_status in ('AVAILABLE', 'CLEANING', 'DISABLED') and exists (
    select 1
    from public.orders
    where restaurant_table_id = current_table.id
      and status not in ('COMPLETED', 'CANCELLED', 'REFUNDED')
  ) then
    raise exception 'Restaurant table has an active order';
  end if;

  update public.restaurant_tables
  set status = target_status,
      is_active = target_status <> 'DISABLED'
  where id = current_table.id
  returning * into updated_table;

  return updated_table;
end;
$$;

revoke all on function public.transition_restaurant_table(uuid, text) from public;
revoke all on function public.transition_restaurant_table(uuid, text) from anon;
grant execute on function public.transition_restaurant_table(uuid, text) to authenticated;

comment on function public.transition_restaurant_table(uuid, text) is
  'Serializes and validates explicit restaurant-table state transitions for operational staff.';
