begin;

create or replace function public.set_takeaway_packaging(p_order_id uuid, p_packaging text[])
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  s public.terminal_staff_sessions;
  ord public.orders%rowtype;
  normalized text[];
  previous_packaging text[];
begin
  s := public.require_terminal_staff_session();
  if not public.has_pos_permission('order.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select coalesce(array_agg(distinct upper(value) order by upper(value)), '{}'::text[])
    into normalized from unnest(coalesce(p_packaging, '{}'::text[])) value;
  if not normalized <@ array[
    'CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN'
  ]::text[] then raise exception 'INVALID_TAKEAWAY_PACKAGING'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.company_id <> s.company_id or ord.branch_id <> s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
  if ord.dining_mode <> 'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
  if ord.status <> 'DRAFT' or ord.payment_status <> 'UNPAID' then raise exception 'ORDER_NOT_EDITABLE'; end if;
  if ord.takeaway_packaging is distinct from normalized then
    previous_packaging := ord.takeaway_packaging;
    update public.orders set takeaway_packaging = normalized where id = p_order_id returning * into ord;
    perform public.write_pos_audit('TAKEAWAY_PACKAGING_UPDATED', 'ORDER', ord.id, null,
      jsonb_build_object('branchId', s.branch_id, 'staffId', s.staff_id,
        'previous', to_jsonb(previous_packaging), 'current', to_jsonb(normalized)));
  end if;
  return ord;
end;
$$;

commit;
