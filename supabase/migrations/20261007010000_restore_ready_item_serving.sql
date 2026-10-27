begin;

-- Financial completion does not mean the food has been served. A later RBAC
-- migration replaced item-based serving with a whole-order READY guard.
create or replace function public.serve_ready_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  served_items uuid[];
  next_status text;
begin
  if not public.has_pos_permission('order.serve') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.company_id is distinct from public.current_user_company_id()
    or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED')
    or ord.payment_status not in ('UNPAID', 'PARTIALLY_PAID', 'PAID')
    or (ord.status = 'COMPLETED' and ord.payment_status <> 'PAID') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if not exists(select 1 from public.order_items where order_id = ord.id and item_status = 'READY') then
    if ord.status in ('SERVED', 'COMPLETED') and not exists(
      select 1 from public.order_items where order_id = ord.id
        and item_status in ('DRAFT', 'SUBMITTED', 'PREPARING', 'READY')
    ) then return ord; end if;
    raise exception 'ORDER_NOT_READY';
  end if;

  perform set_config('app.status_change_notes', 'Ready kitchen items served', true);
  with served as (
    update public.order_items set item_status = 'SERVED'
    where order_id = ord.id and item_status = 'READY'
    returning id
  ) select array_agg(id) into served_items from served;
  -- The item trigger keeps batch status/timestamps synchronized as each
  -- round is fulfilled, including batches that still have preparing items.
  next_status := case
    when ord.payment_status = 'PAID' then 'COMPLETED'
    when exists(select 1 from public.order_items where order_id = ord.id and item_status = 'PREPARING') then 'PREPARING'
    when exists(select 1 from public.order_items where order_id = ord.id and item_status = 'SUBMITTED') then 'CONFIRMED'
    when exists(select 1 from public.order_items where order_id = ord.id and item_status = 'READY') then 'READY'
    else 'SERVED' end;
  update public.orders set status = next_status where id = ord.id returning * into ord;
  perform public.write_pos_audit('ORDER_READY_ITEMS_SERVED', 'ORDER', ord.id, null,
    jsonb_build_object('companyId', ord.company_id, 'branchId', ord.branch_id,
      'orderId', ord.id, 'diningMode', ord.dining_mode,
      'paymentStatus', ord.payment_status, 'servedItemIds', to_jsonb(served_items)));
  return ord;
end;
$$;

revoke all on function public.serve_ready_order(uuid) from public, anon;
grant execute on function public.serve_ready_order(uuid) to authenticated;

commit;
