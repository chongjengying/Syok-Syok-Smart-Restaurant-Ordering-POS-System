begin;

create or replace function public.get_staff_sales_report_v1(p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare from_at timestamptz;to_at timestamptz;rows jsonb;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
 with staff_rows as (
  select staff.id user_id,staff.name staff_name,staff.role_name role,
   (select count(*) from public.orders o where o.user_id=staff.id and o.created_at>=from_at and o.created_at<to_at) orders_created,
   (select count(distinct o.id) from public.orders o join public.payments pay on pay.order_id=o.id and pay.status='PAID' and pay.paid_at>=from_at and pay.paid_at<to_at where o.user_id=staff.id) total_orders,
   (select coalesce(sum(item.quantity),0) from public.orders o join public.payments pay on pay.order_id=o.id and pay.status='PAID' and pay.paid_at>=from_at and pay.paid_at<to_at join public.order_items item on item.order_id=o.id and item.item_status<>'VOIDED' where o.user_id=staff.id) items_sold,
   (select coalesce(sum(amount),0) from (select distinct o.id,o.subtotal amount from public.orders o join public.payments pay on pay.order_id=o.id and pay.status='PAID' and pay.paid_at>=from_at and pay.paid_at<to_at where o.user_id=staff.id)x) gross_sales,
   (select coalesce(sum(amount),0) from (select distinct o.id,o.total amount from public.orders o join public.payments pay on pay.order_id=o.id and pay.status='PAID' and pay.paid_at>=from_at and pay.paid_at<to_at where o.user_id=staff.id)x) net_sales,
   (select coalesce(avg(amount),0) from (select distinct o.id,o.total amount from public.orders o join public.payments pay on pay.order_id=o.id and pay.status='PAID' and pay.paid_at>=from_at and pay.paid_at<to_at where o.user_id=staff.id)x) average_order_value,
   (select count(*) from public.orders o where o.user_id=staff.id and o.status='CANCELLED' and o.created_at>=from_at and o.created_at<to_at) cancelled_orders,
   (select count(*) from public.order_items item join public.orders o on o.id=item.order_id where o.user_id=staff.id and item.item_status='VOIDED' and item.voided_at>=from_at and item.voided_at<to_at) void_items,
   (select coalesce(sum(o.discount),0) from public.orders o where o.user_id=staff.id and o.created_at>=from_at and o.created_at<to_at) discount_given,
   (select count(*) from public.refunds refund where refund.requested_by=staff.id and refund.refunded_at>=from_at and refund.refunded_at<to_at) refund_count
  from public.profiles staff
 ) select coalesce(jsonb_agg(to_jsonb(staff_rows) order by net_sales desc),'[]'::jsonb) into rows from staff_rows where orders_created>0 or total_orders>0 or cancelled_orders>0 or void_items>0 or refund_count>0;
 return rows;
end; $$;

create or replace function public.get_cancellation_report_v1(p_date_from date,p_date_to date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare from_at timestamptz;to_at timestamptz;rows jsonb;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
 with events as (
  select orders.id::text||'-ORDER' id,orders.order_number,null::text order_item_line,null::text product,null::integer quantity,orders.total original_amount,orders.total cancelled_amount,
   'Whole Order Cancel' cancellation_type,history.notes reason,actor.name cancelled_by,actor.role_name cancelled_by_role,actor.name approved_by,history.changed_at
  from public.orders orders join lateral(select * from public.order_status_history where order_id=orders.id and new_status='CANCELLED' order by changed_at desc limit 1)history on true
  left join public.profiles actor on actor.id=history.changed_by where history.changed_at>=from_at and history.changed_at<to_at
  union all
  select item.id::text id,orders.order_number,item.id::text order_item_line,item.product_name_snapshot product,item.quantity,item.subtotal original_amount,item.subtotal cancelled_amount,
   'Item Void' cancellation_type,item.void_reason reason,actor.name cancelled_by,actor.role_name cancelled_by_role,actor.name approved_by,item.voided_at changed_at
  from public.order_items item join public.orders orders on orders.id=item.order_id left join public.profiles actor on actor.id=item.voided_by
  where item.item_status='VOIDED' and item.voided_at>=from_at and item.voided_at<to_at
 ) select coalesce(jsonb_agg(to_jsonb(events) order by changed_at desc),'[]'::jsonb) into rows from events;
 return rows;
end; $$;

revoke all on function public.get_staff_sales_report_v1(date,date),public.get_cancellation_report_v1(date,date) from public,anon;
grant execute on function public.get_staff_sales_report_v1(date,date),public.get_cancellation_report_v1(date,date) to authenticated;

create or replace function public.get_pos_report_page_v1(p_report_id text,p_date_from date,p_date_to date,p_search text default null,p_sort_key text default null,p_sort_direction text default 'asc',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare all_rows jsonb;page_rows jsonb;total bigint;safe_limit integer:=least(greatest(coalesce(p_limit,50),1),100);safe_offset integer:=greatest(coalesce(p_offset,0),0);needle text:=nullif(btrim(coalesce(p_search,'')),'');sort_key text:=nullif(regexp_replace(coalesce(p_sort_key,''),'[^a-zA-Z0-9_]','','g'),'');direction text:=case when lower(p_sort_direction)='desc' then 'desc' else 'asc' end;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 case lower(p_report_id) when 'product-sales' then all_rows:=public.get_paid_product_sales_report_v1(p_date_from,p_date_to);when 'category-sales' then all_rows:=public.get_paid_category_sales_report_v1(p_date_from,p_date_to);when 'staff-sales' then all_rows:=public.get_staff_sales_report_v1(p_date_from,p_date_to);when 'cancellations' then all_rows:=public.get_cancellation_report_v1(p_date_from,p_date_to);else all_rows:=public.get_pos_report_v1(p_report_id,p_date_from,p_date_to);end case;
 select count(*) into total from jsonb_array_elements(all_rows) element where needle is null or element::text ilike '%'||needle||'%';
 select coalesce(jsonb_agg(value order by sequence),'[]'::jsonb) into page_rows from(select element value,row_number()over(order by case when sort_key is null then ordinal end asc,case when direction='asc' and element->>sort_key~'^-?[0-9]+(\.[0-9]+)?$' then(element->>sort_key)::numeric end asc nulls last,case when direction='desc' and element->>sort_key~'^-?[0-9]+(\.[0-9]+)?$' then(element->>sort_key)::numeric end desc nulls last,case when direction='asc' then lower(element->>sort_key)end asc nulls last,case when direction='desc' then lower(element->>sort_key)end desc nulls last,ordinal asc)sequence from jsonb_array_elements(all_rows)with ordinality source(element,ordinal)where needle is null or element::text ilike '%'||needle||'%' order by sequence limit safe_limit offset safe_offset)page;
 return jsonb_build_object('rows',page_rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end; $$;
revoke all on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer) from public,anon;
grant execute on function public.get_pos_report_page_v1(text,date,date,text,text,text,integer,integer) to authenticated;
commit;
