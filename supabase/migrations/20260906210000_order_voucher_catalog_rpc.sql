create or replace function public.get_order_vouchers(p_order_id uuid, p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; v public.vouchers%rowtype; result jsonb := '[]'::jsonb; s text; eligible boolean;
begin
  if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into o from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  for v in select * from public.vouchers where (branch_id is null or branch_id=o.branch_id) and (p_search is null or code ilike '%'||p_search||'%' or name ilike '%'||p_search||'%') order by status='ACTIVE' desc, expires_at loop
    s := case when v.status <> 'ACTIVE' then 'DISABLED' when now() < v.starts_at then 'NOT_STARTED' when now() >= v.expires_at then 'EXPIRED' when v.usage_limit is not null and v.usage_count >= v.usage_limit then 'USAGE_LIMIT_REACHED' when o.subtotal < coalesce(v.min_spend,0) then 'MINIMUM_SPEND_NOT_REACHED' when v.order_type is not null and replace(upper(v.order_type),'-','_') <> replace(upper(case when o.dining_mode='dine-in' then 'DINE_IN' else 'TAKEAWAY' end),'-','_') then 'ORDER_TYPE_NOT_ALLOWED' else 'AVAILABLE' end;
    result := result || jsonb_build_array(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'description',v.description,'customer_description',v.customer_description,'voucher_type',v.voucher_type,'value',v.value,'min_spend',v.min_spend,'max_discount',v.max_discount,'starts_at',v.starts_at,'expires_at',v.expires_at,'status',s,'statusLabel',case s when 'AVAILABLE' then 'Available' when 'MINIMUM_SPEND_NOT_REACHED' then 'Minimum spend not reached' when 'EXPIRED' then 'Expired' when 'USAGE_LIMIT_REACHED' then 'Usage limit reached' when 'NOT_STARTED' then 'Not started' when 'ORDER_TYPE_NOT_ALLOWED' then 'Order type not allowed' else 'Disabled' end));
  end loop;
  return result;
end $$;
grant execute on function public.get_order_vouchers(uuid,text) to authenticated;
