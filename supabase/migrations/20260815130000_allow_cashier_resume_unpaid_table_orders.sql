-- Cashiers must be able to resume and settle unpaid orders created by waiters
-- on another terminal. Mutations remain protected by the transactional RPCs.

drop policy if exists "Active staff can read all orders" on public.orders;
create policy "Active staff can read all orders"
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER', 'CASHIER')
  )
);

drop policy if exists "Active staff can read all order items" on public.order_items;
create policy "Active staff can read all order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER', 'CASHIER')
  )
);

drop policy if exists "Active staff can read all order item options" on public.order_item_options;
create policy "Active staff can read all order item options"
on public.order_item_options for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER', 'CASHIER')
  )
);

drop policy if exists "Active staff can read all payments" on public.payments;
create policy "Active staff can read all payments"
on public.payments for select to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'CASHIER')
  )
);

drop policy if exists "Staff can read order status history" on public.order_status_history;
create policy "Staff can read order status history"
on public.order_status_history for select to authenticated
using (
  public.is_active_pos_user()
  and (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'ACTIVE'
        and p.role_name in ('ADMIN', 'MANAGER', 'KITCHEN', 'WAITER', 'CASHIER')
    )
  )
);
