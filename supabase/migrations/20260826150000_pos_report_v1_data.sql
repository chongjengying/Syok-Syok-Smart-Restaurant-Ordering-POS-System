begin;

create or replace function public.get_pos_report_v1(
  p_report_id text,
  p_date_from date,
  p_date_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report_id text := lower(btrim(coalesce(p_report_id, '')));
  from_at timestamptz;
  to_at timestamptz;
  rows jsonb;
begin
  if not public.has_pos_permission('report.view') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to then
    raise exception 'INVALID_REPORT_RANGE';
  end if;
  if p_date_to - p_date_from > 366 then
    raise exception 'REPORT_RANGE_TOO_LARGE';
  end if;

  -- Current business-day fallback is Malaysia calendar date. A future closing-
  -- hour setting can replace this boundary without changing the report API.
  from_at := p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';
  to_at := (p_date_to + 1)::timestamp at time zone 'Asia/Kuala_Lumpur';

  if report_id = 'daily-sales' then
    return public.get_admin_report('daily', p_date_from, p_date_to);
  elsif report_id = 'product-sales' then
    return public.get_admin_report('products', p_date_from, p_date_to);
  elsif report_id = 'category-sales' then
    return public.get_admin_report('category', p_date_from, p_date_to);
  elsif report_id = 'staff-sales' then
    return public.get_admin_report('staff', p_date_from, p_date_to);
  elsif report_id = 'cancellations' then
    return public.get_admin_report('cancellations', p_date_from, p_date_to);
  elsif report_id = 'refunds' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.refunded_at desc), '[]'::jsonb)
    into rows
    from (
      select refund.id,
             refund.refund_number,
             payment.payment_number original_payment_number,
             receipt.receipt_number,
             orders.order_number,
             payment.amount original_payment_amount,
             refund.amount refund_amount,
             payment.payment_method refund_method,
             'FULL_OR_PARTIAL_PAYMENT' refund_type,
             refund.reason,
             requester.name requested_by,
             requester.name approved_by,
             refund.refunded_at
      from public.refunds refund
      join public.orders orders on orders.id = refund.order_id
      join public.payments payment on payment.id = refund.payment_id
      left join public.receipts receipt on receipt.order_id = orders.id
      left join public.profiles requester on requester.id = refund.requested_by
      where refund.status = 'COMPLETED'
        and refund.refunded_at >= from_at and refund.refunded_at < to_at
    ) item;
    return rows;
  elsif report_id = 'order-transactions' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at desc), '[]'::jsonb)
    into rows
    from (
      select orders.id order_id,
             orders.order_number,
             (orders.created_at at time zone 'Asia/Kuala_Lumpur')::date business_date,
             orders.created_at order_date_time,
             orders.dining_mode order_type,
             table_row.table_number,
             null::integer guest_count,
             staff.name staff_name,
             orders.subtotal,
             orders.discount,
             orders.tax,
             orders.service_charge,
             orders.total grand_total,
             payment_methods.methods payment_method,
             orders.payment_status,
             orders.status order_status,
             orders.created_at,
             completed.completed_at
      from public.orders orders
      left join public.restaurant_tables table_row on table_row.id = orders.restaurant_table_id
      left join public.profiles staff on staff.id = orders.user_id
      left join lateral (
        select string_agg(distinct payment.payment_method, ', ' order by payment.payment_method) methods
        from public.payments payment
        where payment.order_id = orders.id and payment.status in ('PAID', 'REFUNDED')
      ) payment_methods on true
      left join lateral (
        select max(history.changed_at) completed_at
        from public.order_status_history history
        where history.order_id = orders.id and history.new_status in ('COMPLETED', 'REFUNDED')
      ) completed on true
      where orders.created_at >= from_at and orders.created_at < to_at
    ) item;
    return rows;
  elsif report_id = 'payments' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.payment_at desc), '[]'::jsonb)
    into rows
    from (
      select payment.id payment_id,
             payment.payment_number,
             orders.order_number,
             receipt.receipt_number,
             coalesce(payment.paid_at, payment.created_at) payment_at,
             payment.payment_method,
             payment.amount payment_amount,
             payment.status payment_status,
             coalesce(payment.transaction_reference, payment.reference) transaction_reference,
             cashier.name cashier,
             coalesce(refunded.refunded_amount, 0) refunded_amount
      from public.payments payment
      join public.orders orders on orders.id = payment.order_id
      left join public.receipts receipt on receipt.order_id = orders.id
      left join public.profiles cashier on cashier.id = payment.user_id
      left join lateral (
        select sum(refund.amount) refunded_amount
        from public.refunds refund
        where refund.payment_id = payment.id and refund.status = 'COMPLETED'
      ) refunded on true
      where coalesce(payment.paid_at, payment.created_at) >= from_at
        and coalesce(payment.paid_at, payment.created_at) < to_at
    ) item;
    return rows;
  elsif report_id = 'hourly-sales' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.business_date, item.hour_start), '[]'::jsonb)
    into rows
    from (
      select (payment.paid_at at time zone 'Asia/Kuala_Lumpur')::date business_date,
             date_trunc('hour', payment.paid_at at time zone 'Asia/Kuala_Lumpur') hour_start,
             to_char(date_trunc('hour', payment.paid_at at time zone 'Asia/Kuala_Lumpur'), 'HH24:MI') || ' - ' ||
               to_char(date_trunc('hour', payment.paid_at at time zone 'Asia/Kuala_Lumpur') + interval '1 hour', 'HH24:MI') hour_slot,
             count(distinct payment.order_id) order_count,
             null::bigint guest_count,
             coalesce(sum(items.quantity), 0) quantity_sold,
             sum(payment.amount) net_sales,
             round(sum(payment.amount) / nullif(count(distinct payment.order_id), 0), 2) average_order_value
      from public.payments payment
      left join lateral (
        select sum(order_item.quantity) quantity
        from public.order_items order_item
        where order_item.order_id = payment.order_id and order_item.item_status <> 'VOIDED'
      ) items on true
      where payment.status = 'PAID' and payment.paid_at >= from_at and payment.paid_at < to_at
      group by 1, 2
    ) item;
    return rows;
  elsif report_id = 'kitchen-performance' then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.submitted_at desc), '[]'::jsonb)
    into rows
    from (
      select batch.id batch_id,
             batch.batch_number kds_number,
             orders.order_number,
             orders.dining_mode order_type,
             table_row.table_number,
             batch.created_at submitted_at,
             batch.started_at preparing_at,
             batch.ready_at,
             batch.served_at,
             case when batch.started_at is not null and batch.ready_at is not null
               then round(extract(epoch from (batch.ready_at - batch.started_at)) / 60.0, 2) end preparation_minutes,
             case when batch.ready_at is not null and batch.served_at is not null
               then round(extract(epoch from (batch.served_at - batch.ready_at)) / 60.0, 2) end waiting_minutes,
             case when batch.served_at is not null
               then round(extract(epoch from (batch.served_at - batch.created_at)) / 60.0, 2) end fulfilment_minutes,
             batch.status kitchen_status,
             case when batch.ready_at is null and now() - batch.created_at > interval '20 minutes'
                    or batch.ready_at - batch.created_at > interval '20 minutes'
               then true else false end delay_flag
      from public.order_item_batches batch
      join public.orders orders on orders.id = batch.order_id
      left join public.restaurant_tables table_row on table_row.id = orders.restaurant_table_id
      where batch.created_at >= from_at and batch.created_at < to_at
    ) item;
    return rows;
  else
    raise exception 'UNSUPPORTED_REPORT_TYPE';
  end if;
end;
$$;

revoke all on function public.get_pos_report_v1(text, date, date) from public, anon;
grant execute on function public.get_pos_report_v1(text, date, date) to authenticated;

create index if not exists idx_orders_reporting_created_status_payment
  on public.orders(created_at desc, status, payment_status);
create index if not exists idx_payments_reporting_paid_status_method
  on public.payments(paid_at desc, status, payment_method)
  where paid_at is not null;
create index if not exists idx_order_items_reporting_product
  on public.order_items(product_id, order_id)
  where item_status <> 'VOIDED';
create index if not exists idx_order_item_batches_reporting_created
  on public.order_item_batches(created_at desc, status);

commit;
