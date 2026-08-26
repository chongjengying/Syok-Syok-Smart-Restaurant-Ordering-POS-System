create policy "Authenticated users can read categories"
on public.categories for select to authenticated
using (true);

create policy "Authenticated users can read active products"
on public.products for select to authenticated
using (status = true);

create policy "Authenticated users can read roles"
on public.roles for select to authenticated
using (true);

create policy "Users can read own orders"
on public.orders for select to authenticated
using (user_id = auth.uid());

create policy "Users can create own orders"
on public.orders for insert to authenticated
with check (user_id = auth.uid());

create policy "Users can read own order items"
on public.order_items for select to authenticated
using (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid()));

create policy "Users can create own order items"
on public.order_items for insert to authenticated
with check (exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid()));

create policy "Users can read own payments"
on public.payments for select to authenticated
using (user_id = auth.uid());

create policy "Users can create own payments"
on public.payments for insert to authenticated
with check (user_id = auth.uid());
