-- Staff roles need SELECT access for KDS/waiter realtime subscriptions.
drop policy if exists "Staff can read all orders" on public.orders;
create policy "Staff can read all orders"
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists "Staff can read all order items" on public.order_items;
create policy "Staff can read all order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists "Staff can read all payments" on public.payments;
create policy "Staff can read all payments"
on public.payments for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role_name in ('ADMIN', 'MANAGER')
  )
);
