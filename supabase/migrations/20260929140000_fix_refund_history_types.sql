begin;

create or replace function public.list_admin_refunds(
  p_search text default null,p_status text default null,p_refund_type text default null,
  p_date_from date default null,p_date_to date default null,p_limit integer default 25,p_offset integer default 0
)
returns table(
  id uuid,refund_number text,order_id uuid,order_number text,original_receipt_number text,
  payment_id uuid,payment_number text,payment_method text,amount numeric,tax_amount numeric,
  refund_type text,status text,reason text,requested_by uuid,requester_name text,
  approved_by uuid,approver_name text,branch_id uuid,terminal_id uuid,cashier_shift_id uuid,
  refunded_at timestamptz,items jsonb,total_count bigint
)
language plpgsql stable security definer set search_path=public as $$
declare normalized_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  if not public.has_pos_permission('payment.refund') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then raise exception 'INVALID_REPORT_RANGE'; end if;
  return query
  with filtered as (
    select r.*,o.order_number,p.payment_number,p.payment_method::text as payment_method_text,
      requester.name::text as requester_name,approver.name::text as approver_name,count(*) over() as total_count,
      coalesce((select jsonb_agg(jsonb_build_object('orderItemId',ri.order_item_id,'product',ri.product_name_snapshot,'quantity',ri.quantity,'amount',ri.amount,'taxAmount',ri.tax_amount) order by ri.created_at) from public.refund_items ri where ri.refund_id=r.id),'[]'::jsonb) as items
    from public.refunds r join public.orders o on o.id=r.order_id join public.payments p on p.id=r.payment_id
    left join public.profiles requester on requester.id=r.requested_by left join public.profiles approver on approver.id=r.approved_by
    where public.can_access_branch(o.branch_id) and (p_status is null or r.status=upper(p_status)) and (p_refund_type is null or r.refund_type=upper(p_refund_type))
      and (p_date_from is null or r.refunded_at>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur') and (p_date_to is null or r.refunded_at<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur')
      and (normalized_search is null or lower(concat_ws(' ',r.refund_number,o.order_number,r.original_receipt_number,p.payment_number,r.reason,requester.name)) like '%'||lower(normalized_search)||'%')
  )
  select f.id,f.refund_number::text,f.order_id,f.order_number::text,f.original_receipt_number,f.payment_id,f.payment_number::text,f.payment_method_text,
    f.amount,f.tax_amount,f.refund_type::text,f.status::text,f.reason,f.requested_by,f.requester_name,f.approved_by,f.approver_name,f.branch_id,f.terminal_id,f.cashier_shift_id,f.refunded_at,f.items,f.total_count
  from filtered f order by f.refunded_at desc,f.id desc limit greatest(1,least(coalesce(p_limit,25),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.list_admin_refunds(text,text,text,date,date,integer,integer) from public,anon;
grant execute on function public.list_admin_refunds(text,text,text,date,date,integer,integer) to authenticated;

commit;
