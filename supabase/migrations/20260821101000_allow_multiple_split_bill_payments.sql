-- Whole-order payments remain one-per-order. Split and mixed payments are
-- linked to a bill and legitimately produce multiple PAID rows per order.
drop index if exists public.idx_payments_one_paid_per_order;

create unique index idx_payments_one_paid_per_order
  on public.payments(order_id)
  where status = 'PAID' and bill_id is null;
