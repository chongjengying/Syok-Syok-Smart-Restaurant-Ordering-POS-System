-- Enforce staff activation consistently for direct Data API access and for
-- security-definer order/payment operations. Profile owners may still read
-- their own profile so the application can explain why access is denied.

create or replace function public.is_active_pos_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
  );
$$;

revoke all on function public.is_active_pos_user() from public;
grant execute on function public.is_active_pos_user() to authenticated;

drop policy if exists "Authenticated users can read categories" on public.categories;
create policy "Active staff can read categories"
on public.categories for select to authenticated
using (public.is_active_pos_user());

drop policy if exists "Authenticated users can read active products" on public.products;
create policy "Active staff can read active products"
on public.products for select to authenticated
using (status = true and public.is_active_pos_user());

drop policy if exists "Authenticated users can read roles" on public.roles;
create policy "Active staff can read roles"
on public.roles for select to authenticated
using (public.is_active_pos_user());

drop policy if exists "Authenticated users can read restaurant tables" on public.restaurant_tables;
create policy "Active staff can read restaurant tables"
on public.restaurant_tables for select to authenticated
using (public.is_active_pos_user());

drop policy if exists "Authenticated users can read option groups" on public.product_option_groups;
create policy "Active staff can read option groups"
on public.product_option_groups for select to authenticated
using (public.is_active_pos_user());

drop policy if exists "Authenticated users can read product options" on public.product_options;
create policy "Active staff can read product options"
on public.product_options for select to authenticated
using (public.is_active_pos_user());

drop policy if exists "Users can read own orders" on public.orders;
create policy "Active users can read own orders"
on public.orders for select to authenticated
using (user_id = auth.uid() and public.is_active_pos_user());

drop policy if exists "Users can create own orders" on public.orders;
create policy "Active users can create own orders"
on public.orders for insert to authenticated
with check (user_id = auth.uid() and public.is_active_pos_user());

drop policy if exists "Users can read own order items" on public.order_items;
create policy "Active users can read own order items"
on public.order_items for select to authenticated
using (
  public.is_active_pos_user()
  and exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
);

drop policy if exists "Users can create own order items" on public.order_items;
create policy "Active users can create own order items"
on public.order_items for insert to authenticated
with check (
  public.is_active_pos_user()
  and exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
);

drop policy if exists "Users can read own payments" on public.payments;
create policy "Active users can read own payments"
on public.payments for select to authenticated
using (user_id = auth.uid() and public.is_active_pos_user());

drop policy if exists "Users can create own payments" on public.payments;
create policy "Active users can create own payments"
on public.payments for insert to authenticated
with check (user_id = auth.uid() and public.is_active_pos_user());

drop policy if exists "Staff can read all orders" on public.orders;
create policy "Active staff can read all orders"
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists "Staff can read all order items" on public.order_items;
create policy "Active staff can read all order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists "Staff can read all payments" on public.payments;
create policy "Active staff can read all payments"
on public.payments for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER')
  )
);

drop policy if exists "Users can read own order item options" on public.order_item_options;
create policy "Active users can read own order item options"
on public.order_item_options for select to authenticated
using (
  public.is_active_pos_user()
  and exists (
    select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.id = order_item_options.order_item_id and o.user_id = auth.uid()
  )
);

drop policy if exists "Staff can read all order item options" on public.order_item_options;
create policy "Active staff can read all order item options"
on public.order_item_options for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists "Staff can read order status history" on public.order_status_history;
create policy "Active staff can read order status history"
on public.order_status_history for select to authenticated
using (
  public.is_active_pos_user()
  and (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
        and p.role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
    )
  )
);

create or replace function public.guard_active_pos_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_active_pos_user() then
    raise exception 'An active staff profile is required';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_active_order_write on public.orders;
create trigger trg_guard_active_order_write
before insert or update on public.orders
for each row execute function public.guard_active_pos_write();

drop trigger if exists trg_guard_active_payment_write on public.payments;
create trigger trg_guard_active_payment_write
before insert or update on public.payments
for each row execute function public.guard_active_pos_write();
