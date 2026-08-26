begin;

create or replace function public.get_paid_product_sales_report_v1(p_date_from date, p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare from_at timestamptz; to_at timestamptz; rows jsonb;
begin
  if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to or p_date_to-p_date_from > 366 then raise exception 'INVALID_REPORT_RANGE'; end if;
  from_at := p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur'; to_at := (p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
  with paid_orders as (
    select distinct payment.order_id from public.payments payment
    where payment.status='PAID' and payment.paid_at>=from_at and payment.paid_at<to_at
  ), product_totals as (
    select product.id product_id,product.product_code,items.product_name_snapshot product_name,category.name category_name,
      sum(items.quantity) quantity_sold,count(distinct orders.id) order_count,sum(items.subtotal) gross_sales,
      sum(case when orders.subtotal>0 then items.subtotal/orders.subtotal*orders.discount else 0 end) discount_allocated
    from paid_orders paid join public.orders orders on orders.id=paid.order_id
    join public.order_items items on items.order_id=orders.id and items.item_status<>'VOIDED'
    join public.products product on product.id=items.product_id left join public.categories category on category.id=product.category_id
    group by product.id,product.product_code,items.product_name_snapshot,category.name
  ), calculated as (
    select *,gross_sales-discount_allocated net_sales,case when quantity_sold>0 then gross_sales/quantity_sold else 0 end average_unit_price,
      case when sum(gross_sales-discount_allocated) over()>0 then (gross_sales-discount_allocated)/sum(gross_sales-discount_allocated) over()*100 else 0 end sales_contribution
    from product_totals
  ) select coalesce(jsonb_agg(to_jsonb(calculated) order by net_sales desc),'[]'::jsonb) into rows from calculated;
  return rows;
end; $$;

create or replace function public.get_paid_category_sales_report_v1(p_date_from date, p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare from_at timestamptz; to_at timestamptz; rows jsonb;
begin
  if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is null or p_date_to is null or p_date_from > p_date_to or p_date_to-p_date_from > 366 then raise exception 'INVALID_REPORT_RANGE'; end if;
  from_at := p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur'; to_at := (p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
  with paid_orders as (
    select distinct payment.order_id from public.payments payment where payment.status='PAID' and payment.paid_at>=from_at and payment.paid_at<to_at
  ), category_totals as (
    select category.id category_id,category.category_code,category.name category_name,sum(items.quantity) quantity_sold,count(distinct orders.id) order_count,
      sum(items.subtotal) gross_sales,sum(case when orders.subtotal>0 then items.subtotal/orders.subtotal*orders.discount else 0 end) discount
    from paid_orders paid join public.orders orders on orders.id=paid.order_id join public.order_items items on items.order_id=orders.id and items.item_status<>'VOIDED'
    join public.products product on product.id=items.product_id join public.categories category on category.id=product.category_id
    group by category.id,category.category_code,category.name
  ), calculated as (
    select *,gross_sales-discount net_sales,case when sum(gross_sales-discount) over()>0 then (gross_sales-discount)/sum(gross_sales-discount) over()*100 else 0 end sales_percentage from category_totals
  ) select coalesce(jsonb_agg(to_jsonb(calculated) order by net_sales desc),'[]'::jsonb) into rows from calculated;
  return rows;
end; $$;

create or replace function public.get_pos_report_summary_v1(p_report_id text,p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare from_at timestamptz;to_at timestamptz;result jsonb;
begin
  if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is null or p_date_to is null or p_date_from>p_date_to or p_date_to-p_date_from>366 then raise exception 'INVALID_REPORT_RANGE'; end if;
  if lower(p_report_id)<>'daily-sales' then return '{}'::jsonb; end if;
  from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
  with paid_orders as (
    select distinct orders.* from public.orders orders join public.payments payment on payment.order_id=orders.id
    where payment.status='PAID' and payment.paid_at>=from_at and payment.paid_at<to_at
  ), payment_totals as (
    select coalesce(sum(amount),0) total_collected,
      coalesce(sum(amount) filter(where payment_method='CASH'),0) cash_total,
      coalesce(sum(amount) filter(where payment_method='QR'),0) qr_total,
      coalesce(sum(amount) filter(where payment_method='CARD'),0) card_total,
      coalesce(sum(amount) filter(where payment_method not in('CASH','QR','CARD')),0) other_total
    from public.payments where status='PAID' and paid_at>=from_at and paid_at<to_at
  ), refunds as (
    select coalesce(sum(amount),0) refund_amount,count(*) refund_count from public.refunds where status='COMPLETED' and refunded_at>=from_at and refunded_at<to_at
  ), orders_summary as (
    select coalesce(sum(subtotal),0) gross_sales,coalesce(sum(discount),0) discount_amount,coalesce(sum(subtotal-discount),0) net_sales,
      coalesce(sum(tax),0) tax_amount,coalesce(sum(service_charge),0) service_charge,coalesce(sum(total),0) sales_before_refund,count(*) order_count
    from paid_orders
  ) select jsonb_build_object('grossSales',o.gross_sales,'discountAmount',o.discount_amount,'netSales',o.net_sales,'taxAmount',o.tax_amount,
    'serviceCharge',o.service_charge,'refundAmount',r.refund_amount,'finalSales',o.sales_before_refund-r.refund_amount,
    'totalCollected',p.total_collected-r.refund_amount,'orderCount',o.order_count,'averageOrderValue',case when o.order_count>0 then (o.sales_before_refund-r.refund_amount)/o.order_count else 0 end,
    'cancelledOrderCount',(select count(*) from public.orders where status='CANCELLED' and created_at>=from_at and created_at<to_at),'refundCount',r.refund_count,
    'cashTotal',p.cash_total,'qrTotal',p.qr_total,'cardTotal',p.card_total,'otherTotal',p.other_total) into result from orders_summary o cross join payment_totals p cross join refunds r;
  return result;
end; $$;

revoke all on function public.get_paid_product_sales_report_v1(date,date),public.get_paid_category_sales_report_v1(date,date),public.get_pos_report_summary_v1(text,date,date) from public,anon;
grant execute on function public.get_paid_product_sales_report_v1(date,date),public.get_paid_category_sales_report_v1(date,date),public.get_pos_report_summary_v1(text,date,date) to authenticated;
commit;
