-- Store tax and service charge separately for new orders while preserving the
-- total and historical financial values of existing orders.

alter table public.orders
  add column if not exists service_charge numeric(10, 2) not null default 0;

alter table public.orders drop constraint if exists orders_service_charge_check;
alter table public.orders
  add constraint orders_service_charge_check check (service_charge >= 0);

create or replace function public.split_pos_order_charges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- create_pos_order historically supplied the combined 16% charge in tax.
  -- Split that value at the insert boundary without trusting browser totals.
  if coalesce(new.service_charge, 0) = 0
    and abs(coalesce(new.tax, 0) - round(coalesce(new.subtotal, 0) * 0.16, 2)) <= 0.01
  then
    new.tax := round(new.subtotal * 0.06, 2);
    new.service_charge := round(new.subtotal * 0.10, 2);
    new.total := round(new.subtotal - new.discount + new.tax + new.service_charge, 2);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_split_pos_order_charges on public.orders;
create trigger trg_split_pos_order_charges
before insert on public.orders
for each row execute function public.split_pos_order_charges();

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
where p.status = 'PAID';

grant select on public.daily_sales_report to authenticated;
