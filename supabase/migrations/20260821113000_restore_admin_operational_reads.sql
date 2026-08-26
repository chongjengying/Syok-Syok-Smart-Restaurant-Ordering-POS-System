begin;

drop policy if exists operational_staff_read_order_batches on public.order_item_batches;
create policy operational_staff_read_order_batches on public.order_item_batches
for select to authenticated
using (
  public.current_pos_role() in ('ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER')
  and public.can_read_pos_order(order_id)
);

drop policy if exists front_of_house_read_order_submissions on public.order_submissions;
create policy front_of_house_read_order_submissions on public.order_submissions
for select to authenticated
using (
  public.current_pos_role() in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  and public.can_read_pos_order(order_id)
);

drop policy if exists kitchen_roles_read_kitchen_orders on public.kitchen_orders;
create policy kitchen_roles_read_kitchen_orders on public.kitchen_orders
for select to authenticated
using (
  public.current_pos_role() in ('ADMIN', 'MANAGER', 'KITCHEN')
  and public.can_read_pos_order(order_id)
);

drop policy if exists kitchen_roles_read_kitchen_items on public.kitchen_order_items;
create policy kitchen_roles_read_kitchen_items on public.kitchen_order_items
for select to authenticated
using (
  public.current_pos_role() in ('ADMIN', 'MANAGER', 'KITCHEN')
  and exists (
    select 1 from public.kitchen_orders ko
    where ko.id = kitchen_order_items.kitchen_order_id
      and public.can_read_pos_order(ko.order_id)
  )
);

drop policy if exists front_of_house_read_table_activity on public.table_activity_logs;
create policy front_of_house_read_table_activity on public.table_activity_logs
for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'WAITER'));

commit;
