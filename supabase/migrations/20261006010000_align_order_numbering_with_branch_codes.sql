begin;

-- Branch codes allow 30 characters. The counter key must retain the full code
-- so numbering remains unique per branch without truncation or collisions.
alter table public.configurable_number_counters
  alter column branch_code type varchar(30);

-- Maximum configured order number: 8-character prefix, 30-character branch
-- code, 8-character date, 10-digit sequence, and three separators (59 chars).
-- The report exposes this column, so rebuild its view and invoker RPC inside
-- this transaction while preserving its role gate and existing grants.
drop function public.get_daily_sales_report(date, date);
drop view public.daily_sales_report;

alter table public.orders
  alter column order_number type varchar(64);

create view public.daily_sales_report
with (security_invoker = true)
as
with paid_rows as (
  select p.*, row_number() over (
    partition by p.order_id order by coalesce(p.paid_at, p.created_at), p.id
  ) as order_payment_position
  from public.payments p where p.status = 'PAID'
)
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
  case when p.order_payment_position = 1 then round(o.subtotal, 2) else 0::numeric end as subtotal,
  case when p.order_payment_position = 1 then round(o.tax, 2) else 0::numeric end as tax,
  case when p.order_payment_position = 1 then round(o.discount, 2) else 0::numeric end as discount,
  round(p.amount, 2) as amount_paid,
  round(o.total, 2) as order_total,
  coalesce(p.paid_at, p.created_at) as paid_at,
  case when p.order_payment_position = 1 then round(o.service_charge, 2) else 0::numeric end as service_charge,
  p.payment_number
from paid_rows p
join public.orders o on o.id = p.order_id
where public.current_pos_role() in ('ADMIN', 'MANAGER');

revoke all on public.daily_sales_report from public, anon, authenticated;
grant select on public.daily_sales_report to service_role, authenticated;

create function public.get_daily_sales_report(
  p_date_from date default null,
  p_date_to date default null
)
returns setof public.daily_sales_report
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if public.current_pos_role() not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  return query
  select report.* from public.daily_sales_report report
  where (p_date_from is null or report.report_date >= p_date_from)
    and (p_date_to is null or report.report_date <= p_date_to)
  order by report.paid_at desc;
end;
$$;
revoke all on function public.get_daily_sales_report(date, date) from public, anon;
grant execute on function public.get_daily_sales_report(date, date) to authenticated;

commit;
