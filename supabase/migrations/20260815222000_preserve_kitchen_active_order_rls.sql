-- Preserve legacy/canonical active-order visibility while also allowing a
-- served bill back into KDS when it receives a new active kitchen batch.

create or replace function public.can_read_pos_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_pos_role()
    when 'ADMIN' then true
    when 'MANAGER' then true
    when 'WAITER' then true
    when 'CASHIER' then true
    when 'KITCHEN' then exists (
      select 1
      from public.orders pos_order
      where pos_order.id = p_order_id
        and (
          pos_order.status in ('CONFIRMED', 'PREPARING', 'READY')
          or exists (
            select 1 from public.order_items item
            where item.order_id = pos_order.id
              and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
          )
        )
    )
    else false
  end
$$;

revoke all on function public.can_read_pos_order(uuid) from public, anon;
grant execute on function public.can_read_pos_order(uuid) to authenticated;
