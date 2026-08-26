begin;
create or replace function public.get_pos_report_summary_v2(p_report_id text,p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare report_id text:=lower(p_report_id);all_rows jsonb;cards jsonb;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if report_id='daily-sales' then return public.get_pos_report_summary_v1(p_report_id,p_date_from,p_date_to);end if;
 case report_id when 'product-sales' then all_rows:=public.get_paid_product_sales_report_v1(p_date_from,p_date_to);when 'category-sales' then all_rows:=public.get_paid_category_sales_report_v1(p_date_from,p_date_to);when 'staff-sales' then all_rows:=public.get_staff_sales_report_v1(p_date_from,p_date_to);when 'cancellations' then all_rows:=public.get_cancellation_report_v1(p_date_from,p_date_to);else all_rows:=public.get_pos_report_v1(p_report_id,p_date_from,p_date_to);end case;
 if report_id='payments' then
  select jsonb_build_array(jsonb_build_object('label','Total Payment','value',coalesce(sum((e->>'payment_amount')::numeric)filter(where e->>'payment_status'='PAID'),0),'type','currency'),jsonb_build_object('label','Refund Total','value',coalesce(sum((e->>'refunded_amount')::numeric),0),'type','currency'),jsonb_build_object('label','Failed Payments','value',count(*)filter(where e->>'payment_status'='FAILED'),'type','number'))into cards from jsonb_array_elements(all_rows)e;
 elsif report_id in('product-sales','category-sales')then
  select jsonb_build_array(jsonb_build_object('label',case when report_id='product-sales'then'Products Sold'else'Categories'end,'value',count(*),'type','number'),jsonb_build_object('label','Quantity Sold','value',coalesce(sum((e->>'quantity_sold')::numeric),0),'type','number'),jsonb_build_object('label','Gross Sales','value',coalesce(sum((e->>'gross_sales')::numeric),0),'type','currency'),jsonb_build_object('label','Net Sales','value',coalesce(sum((e->>'net_sales')::numeric),0),'type','currency'))into cards from jsonb_array_elements(all_rows)e;
 elsif report_id='refunds'then select jsonb_build_array(jsonb_build_object('label','Refund Count','value',count(*),'type','number'),jsonb_build_object('label','Total Refund','value',coalesce(sum((e->>'refund_amount')::numeric),0),'type','currency'))into cards from jsonb_array_elements(all_rows)e;
 elsif report_id='hourly-sales'then select jsonb_build_array(jsonb_build_object('label','Orders','value',coalesce(sum((e->>'order_count')::numeric),0),'type','number'),jsonb_build_object('label','Quantity','value',coalesce(sum((e->>'quantity_sold')::numeric),0),'type','number'),jsonb_build_object('label','Net Sales','value',coalesce(sum((e->>'net_sales')::numeric),0),'type','currency'))into cards from jsonb_array_elements(all_rows)e;
 elsif report_id='kitchen-performance'then select jsonb_build_array(jsonb_build_object('label','Kitchen Orders','value',count(*),'type','number'),jsonb_build_object('label','Average Preparation','value',coalesce(avg((e->>'preparation_minutes')::numeric)filter(where e->>'preparation_minutes'is not null),0),'type','number'),jsonb_build_object('label','Delayed','value',count(*)filter(where(e->>'delay_flag')::boolean),'type','number'))into cards from jsonb_array_elements(all_rows)e;
 else select jsonb_build_array(jsonb_build_object('label','Records','value',count(*),'type','number'))into cards from jsonb_array_elements(all_rows)e;end if;
 return jsonb_build_object('cards',coalesce(cards,'[]'::jsonb));
end;$$;
revoke all on function public.get_pos_report_summary_v2(text,date,date)from public,anon;
grant execute on function public.get_pos_report_summary_v2(text,date,date)to authenticated;
commit;
