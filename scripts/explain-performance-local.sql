begin;
set local session_replication_role = replica;

create temp table perf_context as
select profile.id as user_id, product.id as product_id
from public.profiles profile cross join public.products product
limit 1;

insert into public.orders (
  id, order_number, user_id, subtotal, tax, service_charge, total,
  status, payment_status, dining_mode, created_at, updated_at
)
select
  md5('perf-order-' || n)::uuid,
  'PERF-' || lpad(n::text, 6, '0'),
  context.user_id, 5, 0, 0, 5,
  'COMPLETED', 'PAID', 'takeaway',
  timestamptz '2026-08-01 00:00:00+08' + (n || ' seconds')::interval,
  timestamptz '2026-08-01 00:00:00+08' + (n || ' seconds')::interval
from generate_series(1, 10000) n cross join perf_context context;

insert into public.order_items (
  id, order_id, product_id, quantity, unit_price, subtotal,
  product_name_snapshot, service_mode, item_status
)
select
  md5('perf-item-' || n)::uuid,
  md5('perf-order-' || n)::uuid,
  context.product_id, 1, 5, 5,
  'Performance Product', 'TAKEAWAY', 'SERVED'
from generate_series(1, 10000) n cross join perf_context context;

insert into public.payments (
  id, order_id, user_id, payment_method, amount, status, paid_at,
  payment_number, split_type
)
select
  md5('perf-payment-' || n)::uuid,
  md5('perf-order-' || n)::uuid,
  context.user_id, 'CASH', 5, 'PAID',
  timestamptz '2026-08-01 00:00:00+08' + (n || ' seconds')::interval,
  'PAY-20991231-' || lpad(n::text, 6, '0'), 'FULL'
from generate_series(1, 10000) n cross join perf_context context;

insert into public.receipts (
  id, receipt_number, order_id, issued_by, subtotal, discount, tax,
  service_charge, total, paid_amount, issued_at
)
select
  md5('perf-receipt-' || n)::uuid,
  'RCP-20991231-' || lpad(n::text, 6, '0'),
  md5('perf-order-' || n)::uuid,
  context.user_id, 5, 0, 0, 0, 5, 5,
  timestamptz '2026-08-01 00:00:00+08' + (n || ' seconds')::interval
from generate_series(1, 10000) n cross join perf_context context;

analyze public.orders;
analyze public.order_items;
analyze public.payments;
analyze public.receipts;

explain (analyze, buffers)
select
  coalesce(payment.paid_at, payment.created_at)::date as report_date,
  sum(payment.amount) as amount_paid
from public.payments payment
join public.orders pos_order on pos_order.id = payment.order_id
where payment.status = 'PAID'
  and coalesce(payment.paid_at, payment.created_at) >= timestamptz '2026-08-01 00:00:00+08'
  and coalesce(payment.paid_at, payment.created_at) < timestamptz '2026-09-01 00:00:00+08'
group by 1;

explain (analyze, buffers)
select
  item.product_id,
  sum(item.quantity),
  count(distinct item.order_id),
  sum(item.subtotal),
  min(receipt.issued_at),
  max(receipt.issued_at)
from public.receipts receipt
join public.orders pos_order on pos_order.id = receipt.order_id
join public.order_items item on item.order_id = pos_order.id
where pos_order.payment_status = 'PAID'
  and item.item_status <> 'VOIDED'
  and receipt.issued_at >= timestamptz '2026-08-01 00:00:00+08'
  and receipt.issued_at < timestamptz '2026-09-01 00:00:00+08'
group by item.product_id;

rollback;
