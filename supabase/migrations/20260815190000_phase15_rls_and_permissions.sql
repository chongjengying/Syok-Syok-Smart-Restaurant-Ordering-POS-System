-- Phase 15: database-enforced staff authorization.
--
-- Security model:
--   * anon has no access to POS tables or RPCs.
--   * authenticated receives ordinary DML grants, but RLS decides which rows
--     and operations are allowed for the caller's active profile role.
--   * operational writes continue to use the audited SECURITY DEFINER RPCs.
--   * service_role remains server-only and bypasses RLS by design.

create or replace function public.current_pos_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role_name
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'ACTIVE'
  limit 1
$$;

create or replace function public.can_read_pos_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_pos_role()
    when 'ADMIN' then true
    when 'MANAGER' then true
    when 'WAITER' then true
    when 'CASHIER' then true
    when 'KITCHEN' then exists (
      select 1
      from public.orders o
      where o.id = p_order_id
        and o.status in ('PLACED', 'CONFIRMED', 'PREPARING', 'READY')
    )
    else false
  end
$$;

revoke all on function public.current_pos_role() from public, anon;
revoke all on function public.can_read_pos_order(uuid) from public, anon;
grant execute on function public.current_pos_role() to authenticated;
grant execute on function public.can_read_pos_order(uuid) to authenticated;

-- Remove every inherited/legacy policy before installing one coherent matrix.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

-- Make sure new and legacy POS tables are all protected.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'roles', 'profiles', 'categories', 'products', 'restaurant_tables',
    'product_option_groups', 'product_options', 'orders', 'order_items',
    'order_item_options', 'order_item_batches', 'order_submissions',
    'order_status_history', 'payments', 'kitchen_stations', 'kitchen_orders',
    'kitchen_order_items', 'table_activity_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_pos_role() = ''ADMIN'') with check (public.current_pos_role() = ''ADMIN'')',
      'admin_full_access_' || table_name,
      table_name
    );
  end loop;
end;
$$;

-- Identity and role directory. Staff can read/update only their own profile;
-- ADMIN retains full access through the policy above.
create policy staff_read_own_profile
on public.profiles for select to authenticated
using (id = auth.uid() and public.current_pos_role() is not null);

create policy staff_update_own_profile
on public.profiles for update to authenticated
using (id = auth.uid() and public.current_pos_role() is not null)
with check (id = auth.uid() and public.current_pos_role() is not null);

create policy active_staff_read_roles
on public.roles for select to authenticated
using (public.current_pos_role() is not null);

-- Menu data is readable by active operational staff so waiter/cashier order
-- entry and kitchen tickets keep working. Only ADMIN/MANAGER can mutate it.
create policy active_staff_read_categories
on public.categories for select to authenticated
using (public.current_pos_role() is not null);

create policy managers_manage_categories
on public.categories for all to authenticated
using (public.current_pos_role() = 'MANAGER')
with check (public.current_pos_role() = 'MANAGER');

create policy active_staff_read_products
on public.products for select to authenticated
using (
  public.current_pos_role() is not null
  and (status = true or public.current_pos_role() in ('ADMIN', 'MANAGER'))
);

create policy managers_manage_products
on public.products for all to authenticated
using (public.current_pos_role() = 'MANAGER')
with check (public.current_pos_role() = 'MANAGER');

create policy active_staff_read_option_groups
on public.product_option_groups for select to authenticated
using (public.current_pos_role() is not null);

create policy managers_manage_option_groups
on public.product_option_groups for all to authenticated
using (public.current_pos_role() = 'MANAGER')
with check (public.current_pos_role() = 'MANAGER');

create policy active_staff_read_product_options
on public.product_options for select to authenticated
using (
  public.current_pos_role() is not null
  and (is_available = true or public.current_pos_role() in ('ADMIN', 'MANAGER'))
);

create policy managers_manage_product_options
on public.product_options for all to authenticated
using (public.current_pos_role() = 'MANAGER')
with check (public.current_pos_role() = 'MANAGER');

-- Tables are visible to operational roles because table labels are required by
-- POS, kitchen and payment screens. Lifecycle writes remain RPC-only.
create policy operational_staff_read_tables
on public.restaurant_tables for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'WAITER', 'KITCHEN', 'CASHIER')
  and (is_active = true or public.current_pos_role() = 'MANAGER')
);

create policy front_of_house_read_table_activity
on public.table_activity_logs for select to authenticated
using (public.current_pos_role() in ('MANAGER', 'WAITER'));

-- Orders: front-of-house roles can read the order book. Kitchen can only read
-- active kitchen lifecycle orders; it cannot see completed sales/payments.
create policy authorized_staff_read_orders
on public.orders for select to authenticated
using (public.can_read_pos_order(id));

create policy authorized_staff_read_order_items
on public.order_items for select to authenticated
using (
  public.can_read_pos_order(order_id)
  and (
    public.current_pos_role() <> 'KITCHEN'
    or item_status in ('SUBMITTED', 'PREPARING', 'READY')
  )
);

create policy authorized_staff_read_order_item_options
on public.order_item_options for select to authenticated
using (
  exists (
    select 1 from public.order_items oi
    where oi.id = order_item_id
      and public.can_read_pos_order(oi.order_id)
      and (
        public.current_pos_role() <> 'KITCHEN'
        or oi.item_status in ('SUBMITTED', 'PREPARING', 'READY')
      )
  )
);

create policy front_of_house_read_order_batches
on public.order_item_batches for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'WAITER', 'CASHIER')
  and public.can_read_pos_order(order_id)
);

create policy front_of_house_read_order_submissions
on public.order_submissions for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'WAITER', 'CASHIER')
  and public.can_read_pos_order(order_id)
);

create policy authorized_staff_read_order_history
on public.order_status_history for select to authenticated
using (public.can_read_pos_order(order_id));

-- Payments and reports are intentionally not exposed to waiter or kitchen.
create policy finance_staff_read_payments
on public.payments for select to authenticated
using (public.current_pos_role() in ('MANAGER', 'CASHIER'));

-- Legacy kitchen tables remain protected even though the current KDS derives
-- its queue from orders/order_items.
create policy kitchen_roles_read_stations
on public.kitchen_stations for select to authenticated
using (public.current_pos_role() in ('MANAGER', 'KITCHEN'));

create policy kitchen_roles_read_kitchen_orders
on public.kitchen_orders for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'KITCHEN')
  and public.can_read_pos_order(order_id)
);

create policy kitchen_roles_read_kitchen_items
on public.kitchen_order_items for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'KITCHEN')
  and exists (
    select 1 from public.kitchen_orders ko
    where ko.id = kitchen_order_id
      and public.can_read_pos_order(ko.order_id)
  )
);

-- complete_payment historically admitted WAITER. Enforce the Phase 15 payment
-- role boundary in the database even if an older RPC body is still deployed.
-- Draft-order placeholder payments remain possible; only finance roles may
-- create or transition a payment to PAID.
create or replace function public.enforce_paid_payment_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
    and new.status = 'PAID'
    and public.current_pos_role() not in ('ADMIN', 'MANAGER', 'CASHIER')
  then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_paid_payment_role on public.payments;
create trigger trg_enforce_paid_payment_role
before insert or update of status on public.payments
for each row execute function public.enforce_paid_payment_role();

-- Remove dangerous inherited grants (especially TRUNCATE, REFERENCES and
-- public function execution), then re-grant only RLS-governed DML.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select, insert, update, delete on
  public.roles,
  public.profiles,
  public.categories,
  public.products,
  public.restaurant_tables,
  public.product_option_groups,
  public.product_options,
  public.orders,
  public.order_items,
  public.order_item_options,
  public.order_item_batches,
  public.order_submissions,
  public.order_status_history,
  public.payments,
  public.kitchen_stations,
  public.kitchen_orders,
  public.kitchen_order_items,
  public.table_activity_logs
to authenticated;

-- The report is an invoker-security view. The explicit role predicate is
-- necessary because CASHIER may read payment rows but must not query reports.
create or replace view public.daily_sales_report
with (security_invoker = true)
as
select
  coalesce(p.paid_at, p.created_at)::date as report_date,
  p.order_id,
  o.order_number,
  o.user_id,
  o.status as order_status,
  o.dining_mode,
  o.restaurant_table_id,
  p.id as payment_id,
  p.payment_method,
  coalesce(p.provider, 'UNSPECIFIED') as provider,
  p.transaction_reference,
  round(o.subtotal, 2) as subtotal,
  round(o.tax, 2) as tax,
  round(o.discount, 2) as discount,
  round(p.amount, 2) as amount_paid,
  round(o.total, 2) as order_total,
  coalesce(p.paid_at, p.created_at) as paid_at,
  round(o.service_charge, 2) as service_charge
from public.payments p
join public.orders o on o.id = p.order_id
where p.status = 'PAID'
  and public.current_pos_role() in ('ADMIN', 'MANAGER');
grant select on public.daily_sales_report to authenticated;

grant execute on function public.current_pos_role() to authenticated;
grant execute on function public.can_read_pos_order(uuid) to authenticated;
grant execute on function public.is_active_pos_user() to authenticated;

-- Public application boundaries. Each function also validates the caller's
-- active profile role internally before executing privileged work.
grant execute on function public.create_pos_draft(text, uuid, text) to authenticated;
grant execute on function public.replace_pos_draft_items(uuid, jsonb) to authenticated;
grant execute on function public.submit_pos_order(uuid, text) to authenticated;
grant execute on function public.append_pos_order_items(uuid, jsonb, text) to authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;
grant execute on function public.transition_pos_order(uuid, text, text) to authenticated;
grant execute on function public.start_kitchen_order(uuid) to authenticated;
grant execute on function public.serve_ready_order(uuid) to authenticated;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.transition_restaurant_table(uuid, text) to authenticated;
grant execute on function public.complete_table_cleaning(uuid, text) to authenticated;
grant execute on function public.set_table_out_of_service(uuid, text, text) to authenticated;
grant execute on function public.restore_pos_table(uuid, text) to authenticated;
grant execute on function public.move_pos_order(uuid, uuid, text) to authenticated;

-- Keep future migrations from accidentally restoring PUBLIC function access or
-- broad anon/authenticated table privileges.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
