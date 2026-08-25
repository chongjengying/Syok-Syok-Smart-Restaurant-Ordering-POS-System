begin;

-- Product sales are recognized once per fully paid order using the immutable
-- final receipt timestamp. Split-payment rows are intentionally not joined, so
-- they cannot multiply item quantities or product revenue.
create or replace function public.get_product_sales_report(
  p_date_from date,
  p_date_to date
)
returns table (
  product_id uuid,
  product_code text,
  product_name text,
  category_id uuid,
  category_code text,
  category_name text,
  quantity_sold bigint,
  order_count bigint,
  gross_sales numeric,
  average_unit_price numeric,
  first_sold_at timestamptz,
  last_sold_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if public.current_pos_role() not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_date_from is null or p_date_to is null then
    raise exception 'REPORT_DATE_RANGE_REQUIRED';
  end if;
  if p_date_from > p_date_to then raise exception 'INVALID_DATE_RANGE'; end if;
  if p_date_to - p_date_from > 366 then raise exception 'REPORT_DATE_RANGE_TOO_LARGE'; end if;

  return query
  select
    item.product_id,
    product.product_code::text,
    product.product_name::text,
    product.category_id,
    category.category_code::text,
    category.name::text,
    sum(item.quantity)::bigint,
    count(distinct item.order_id)::bigint,
    round(sum(item.subtotal), 2)::numeric,
    round(sum(item.subtotal) / nullif(sum(item.quantity), 0), 2)::numeric,
    min(receipt.issued_at),
    max(receipt.issued_at)
  from public.receipts receipt
  join public.orders pos_order on pos_order.id = receipt.order_id
  join public.order_items item on item.order_id = pos_order.id
  join public.products product on product.id = item.product_id
  left join public.categories category on category.id = product.category_id
  where pos_order.payment_status = 'PAID'
    and item.item_status <> 'VOIDED'
    and receipt.issued_at >= (p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur')
    and receipt.issued_at < ((p_date_to + 1)::timestamp at time zone 'Asia/Kuala_Lumpur')
  group by
    item.product_id,
    product.product_code,
    product.product_name,
    product.category_id,
    category.category_code,
    category.name
  order by sum(item.quantity) desc, sum(item.subtotal) desc, product.product_name;
end;
$$;

revoke all on function public.get_product_sales_report(date,date) from public, anon;
grant execute on function public.get_product_sales_report(date,date) to authenticated;

commit;
