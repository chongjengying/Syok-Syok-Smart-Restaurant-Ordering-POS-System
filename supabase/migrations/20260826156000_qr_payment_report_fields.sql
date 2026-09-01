begin;
create or replace function public.get_payment_report_v1(p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare from_at timestamptz;to_at timestamptz;rows jsonb;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
 select coalesce(jsonb_agg(to_jsonb(item) order by item.payment_at desc),'[]'::jsonb)into rows from(
  select payment.id payment_id,payment.payment_number,orders.order_number,receipt.receipt_number,coalesce(payment.paid_at,payment.created_at) payment_at,payment.payment_method,
   payment.provider_id,provider.display_name provider_name,
   case when payment.payment_method='QR' then payment.qr_scheme end qr_scheme,case when payment.payment_method='QR' then payment.qr_mode end qr_mode,payment.amount payment_amount,payment.status payment_status,
   coalesce(payment.transaction_reference,payment.reference) transaction_reference,cashier.name cashier,confirmed.name confirmed_by,payment.confirmed_at,payment.confirmation_mode,coalesce(refunded.refunded_amount,0)refunded_amount
  from public.payments payment join public.orders orders on orders.id=payment.order_id left join public.receipts receipt on receipt.order_id=orders.id left join public.profiles cashier on cashier.id=payment.user_id left join public.profiles confirmed on confirmed.id=payment.confirmed_by left join public.payment_providers provider on provider.provider_id=payment.provider_id left join lateral(select sum(refund.amount)refunded_amount from public.refunds refund where refund.payment_id=payment.id and refund.status='COMPLETED')refunded on true
  where coalesce(payment.paid_at,payment.created_at)>=from_at and coalesce(payment.paid_at,payment.created_at)<to_at
 )item;return rows;
end;$$;
revoke all on function public.get_payment_report_v1(date,date)from public,anon;grant execute on function public.get_payment_report_v1(date,date)to authenticated;

create or replace function public.get_pos_report_page_v1(p_report_id text,p_date_from date,p_date_to date,p_search text default null,p_sort_key text default null,p_sort_direction text default 'asc',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare all_rows jsonb;page_rows jsonb;total bigint;safe_limit integer:=least(greatest(coalesce(p_limit,50),1),100);safe_offset integer:=greatest(coalesce(p_offset,0),0);needle text:=nullif(btrim(coalesce(p_search,'')),'');sort_key text:=nullif(regexp_replace(coalesce(p_sort_key,''),'[^a-zA-Z0-9_]','','g'),'');direction text:=case when lower(p_sort_direction)='desc'then'desc'else'asc'end;
begin
 if not public.has_pos_permission('report.view')then raise exception'INSUFFICIENT_PERMISSION';end if;
 case lower(p_report_id)when'product-sales'then all_rows:=public.get_paid_product_sales_report_v1(p_date_from,p_date_to);when'category-sales'then all_rows:=public.get_paid_category_sales_report_v1(p_date_from,p_date_to);when'staff-sales'then all_rows:=public.get_staff_sales_report_v1(p_date_from,p_date_to);when'cancellations'then all_rows:=public.get_cancellation_report_v1(p_date_from,p_date_to);when'payments'then all_rows:=public.get_payment_report_v1(p_date_from,p_date_to);else all_rows:=public.get_pos_report_v1(p_report_id,p_date_from,p_date_to);end case;
 select count(*)into total from jsonb_array_elements(all_rows)element where needle is null or element::text ilike'%'||needle||'%';
 select coalesce(jsonb_agg(value order by sequence),'[]'::jsonb)into page_rows from(select element value,row_number()over(order by case when sort_key is null then ordinal end asc,case when direction='asc'and element->>sort_key~'^-?[0-9]+(\\.[0-9]+)?$'then(element->>sort_key)::numeric end asc nulls last,case when direction='desc'and element->>sort_key~'^-?[0-9]+(\\.[0-9]+)?$'then(element->>sort_key)::numeric end desc nulls last,case when direction='asc'then lower(element->>sort_key)end asc nulls last,case when direction='desc'then lower(element->>sort_key)end desc nulls last,ordinal asc)sequence from jsonb_array_elements(all_rows)with ordinality source(element,ordinal)where needle is null or element::text ilike'%'||needle||'%'order by sequence limit safe_limit offset safe_offset)page;
 return jsonb_build_object('rows',page_rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end;$$;
revoke all on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer)from public,anon;grant execute on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer)to authenticated;
commit;
