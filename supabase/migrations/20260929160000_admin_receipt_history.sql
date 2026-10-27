begin;

create or replace function public.list_admin_receipts(
  p_search text default null, p_date_from date default null, p_date_to date default null,
  p_branch_id uuid default null, p_terminal_id uuid default null, p_cashier_id uuid default null,
  p_payment_method text default null, p_limit integer default 25, p_offset integer default 0
)
returns table(
  id uuid, receipt_number text, order_id uuid, order_number text, branch_id uuid, branch_name text,
  terminal_id uuid, terminal_name text, terminal_code text, cashier jsonb, restaurant jsonb,
  items jsonb, financial jsonb, payments jsonb, receipt_status text, issued_at timestamptz,
  reprint_count integer, total_count bigint
)
language plpgsql stable security definer set search_path=public as $$
declare normalized_search text:=nullif(btrim(coalesce(p_search,'')),'');
begin
  if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_date_from is not null and p_date_to is not null and p_date_from>p_date_to then raise exception 'INVALID_REPORT_RANGE'; end if;
  return query
  with rows as (
    select r.id,r.receipt_number::text,r.order_id,r.order_number_snapshot::text order_number,r.branch_id,
      b.name::text branch_name,r.terminal_id,t.name::text terminal_name,t.terminal_code::text,
      r.cashier_snapshot cashier,r.restaurant_snapshot restaurant,r.line_items_snapshot items,
      r.financial_snapshot financial,r.payments_snapshot payments,r.issued_at,r.reprint_count,
      case when r.status='VOIDED' then 'VOIDED'
        when coalesce(ref.refunded,0)>=r.total then 'FULLY_REFUNDED'
        when coalesce(ref.refunded,0)>0 then 'PARTIALLY_REFUNDED' else 'PAID' end::text receipt_status,
      count(*) over() total_count
    from public.receipts r
    join public.branches b on b.id=r.branch_id
    left join public.pos_terminals t on t.id=r.terminal_id
    left join lateral (select coalesce(sum(amount),0) refunded from public.refunds where payment_id in (select (value->>'id')::uuid from jsonb_array_elements(r.payments_snapshot) value) and status='COMPLETED') ref on true
    where public.can_access_branch(r.branch_id)
      and (p_branch_id is null or r.branch_id=p_branch_id)
      and (p_terminal_id is null or r.terminal_id=p_terminal_id)
      and (p_cashier_id is null or r.issued_by=p_cashier_id or r.cashier_snapshot->>'id'=p_cashier_id::text)
      and (p_payment_method is null or exists(select 1 from jsonb_array_elements(r.payments_snapshot) value where upper(value->>'method')=upper(p_payment_method)))
      and (p_date_from is null or r.issued_at>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur')
      and (p_date_to is null or r.issued_at<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur')
      and (normalized_search is null or lower(concat_ws(' ',r.receipt_number,r.order_number_snapshot,b.name,t.name,t.terminal_code,r.cashier_snapshot->>'name')) like '%'||lower(normalized_search)||'%')
  )
  select * from rows order by issued_at desc,id desc limit greatest(1,least(coalesce(p_limit,25),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

revoke all on function public.list_admin_receipts(text,date,date,uuid,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.list_admin_receipts(text,date,date,uuid,uuid,uuid,text,integer,integer) to authenticated;
commit;
