-- Kept separate so environments that applied the initial Phase 15 migration
-- during development receive the final payment/report boundaries as well.

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

revoke all on function public.enforce_paid_payment_role() from public, anon, authenticated;

drop trigger if exists trg_enforce_paid_payment_role on public.payments;
create trigger trg_enforce_paid_payment_role
before insert or update of status on public.payments
for each row execute function public.enforce_paid_payment_role();

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

revoke all on public.daily_sales_report from anon;
grant select on public.daily_sales_report to authenticated;

