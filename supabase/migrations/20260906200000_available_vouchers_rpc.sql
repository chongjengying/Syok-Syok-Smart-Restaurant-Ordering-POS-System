create or replace function public.get_available_vouchers(p_order_id uuid, p_search text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype;
begin
  if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into o from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) - 'usage_count' order by v.expires_at)
    from public.vouchers v
    where v.status='ACTIVE' and now() between v.starts_at and v.expires_at
      and (p_search is null or v.code ilike '%'||p_search||'%' or v.name ilike '%'||p_search||'%')
      and o.subtotal >= coalesce(v.min_spend,0)
      and (v.usage_limit is null or v.usage_count < v.usage_limit)
      and (v.order_type is null or replace(upper(v.order_type),'-','_')=replace(upper(case when o.dining_mode='dine-in' then 'DINE_IN' else 'TAKEAWAY' end),'-','_'))), '[]'::jsonb);
end $$;
grant execute on function public.get_available_vouchers(uuid,text) to authenticated;
