begin;

create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  start_at timestamptz := date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
  waiting_payment_count integer;
  long_wait_count integer;
  preparing_count integer;
  result jsonb;
begin
  if not public.has_pos_permission('dashboard.view') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select count(distinct o.restaurant_table_id) into waiting_payment_count
  from public.orders o
  where o.dining_mode = 'dine-in'
    and o.restaurant_table_id is not null
    and o.status = 'SERVED'
    and o.payment_status in ('UNPAID', 'PARTIALLY_PAID');

  select count(*) into preparing_count
  from public.order_item_batches b
  where b.status = 'PREPARING';

  select count(*) into long_wait_count
  from public.order_item_batches b
  where b.status in ('PENDING', 'PREPARING')
    and coalesce(b.started_at, b.created_at) <= now() - interval '20 minutes';

  select jsonb_build_object(
    'todaySales', coalesce((select sum(amount) from public.payments where status = 'PAID' and coalesce(paid_at, created_at) >= start_at), 0),
    'todayOrders', (select count(*) from public.orders where created_at >= start_at),
    'totalOrders', (select count(*) from public.orders where created_at >= start_at),
    'averageOrderValue', coalesce((select avg(total) from public.orders where payment_status = 'PAID' and created_at >= start_at), 0),
    'dineInOrders', (select count(*) from public.orders where created_at >= start_at and dining_mode = 'dine-in'),
    'takeawayOrders', (select count(*) from public.orders where created_at >= start_at and dining_mode = 'takeaway'),
    'paymentMethods', coalesce((
      select jsonb_object_agg(payment_method, total)
      from (
        select payment_method, sum(amount) total
        from public.payments
        where status = 'PAID'
          and coalesce(paid_at, created_at) >= start_at
        group by payment_method
      ) methods
    ), '{}'::jsonb),
    'openOrders', (select count(*) from public.orders where status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')),
    'activeOrders', (select count(*) from public.orders where status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')),
    'completedOrders', (select count(*) from public.orders where created_at >= start_at and status = 'COMPLETED'),
    'cancelledOrders', (select count(*) from public.orders where created_at >= start_at and status = 'CANCELLED'),
    'currentOccupiedTables', (select count(*) from public.restaurant_tables where status = 'OCCUPIED' and is_active = true),
    'availableTables', (select count(*) from public.restaurant_tables where status = 'AVAILABLE' and is_active = true),
    'tablesWaitingForPayment', waiting_payment_count,
    'tablesCleaning', (select count(*) from public.restaurant_tables where status = 'CLEANING' and is_active = true),
    'kitchenOrdersPreparing', preparing_count,
    'ordersWaitingTooLong', long_wait_count,
    'tableStatus', coalesce((
      select jsonb_object_agg(status, total)
      from (
        select status, count(*) total
        from public.restaurant_tables
        group by status
      ) statuses
    ), '{}'::jsonb),
    'orderStatus', coalesce((
      select jsonb_object_agg(status, total)
      from (
        select status, count(*) total
        from public.orders
        where created_at >= start_at
        group by status
      ) statuses
    ), '{}'::jsonb),
    'topProducts', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select oi.product_name_snapshot name, sum(oi.quantity) quantity, sum(oi.subtotal) sales
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.created_at >= start_at
          and o.status <> 'CANCELLED'
          and oi.item_status <> 'VOIDED'
        group by oi.product_name_snapshot
        order by quantity desc, sales desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'recentOrders', coalesce((
      select jsonb_agg(to_jsonb(o))
      from (
        select ord.id, ord.order_number, ord.dining_mode, ord.status, ord.payment_status,
          ord.total, ord.created_at, table_ref.table_number
        from public.orders ord
        left join public.restaurant_tables table_ref on table_ref.id = ord.restaurant_table_id
        order by ord.created_at desc
        limit 6
      ) o
    ), '[]'::jsonb),
    'recentActivities', coalesce((
      select jsonb_agg(to_jsonb(a))
      from (
        select id, action, entity_type, entity_id, actor_id, created_at
        from public.audit_logs
        order by created_at desc
        limit 8
      ) a
    ), '[]'::jsonb),
    'salesTrend', coalesce((
      select jsonb_agg(to_jsonb(s) order by sales_day)
      from (
        select d::date as sales_day, coalesce(sum(p.amount), 0) sales
        from generate_series((start_at - interval '6 day')::date, start_at::date, interval '1 day') d
        left join public.payments p on (coalesce(p.paid_at, p.created_at) at time zone 'Asia/Kuala_Lumpur')::date = d::date
          and p.status = 'PAID'
        group by d
      ) s
    ), '[]'::jsonb),
    'alerts', (
      select coalesce(jsonb_agg(alert), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'code', 'TABLES_WAITING_PAYMENT',
          'title', 'Tables waiting for payment',
          'message', waiting_payment_count || ' table(s) have served orders that are not fully paid.'
        ) alert
        where waiting_payment_count > 0
        union all
        select jsonb_build_object(
          'code', 'KITCHEN_WAIT_TOO_LONG',
          'title', 'Orders waiting too long',
          'message', long_wait_count || ' kitchen batch(es) have waited more than 20 minutes.'
        )
        where long_wait_count > 0
        union all
        select jsonb_build_object(
          'code', 'KITCHEN_PREPARING',
          'title', 'Kitchen orders preparing',
          'message', preparing_count || ' kitchen batch(es) are currently preparing.'
        )
        where preparing_count > 0
      ) alerts
    ),
    'hasInventory', false,
    'lowStockProducts', '[]'::jsonb
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_dashboard() from public, anon;
grant execute on function public.get_admin_dashboard() to authenticated;

commit;
