alter table public.orders
  add column if not exists draft_version bigint not null default 0;

create or replace function public.replace_pos_draft_items(
  p_order_id uuid,
  p_items jsonb,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid:=auth.uid(); ord public.orders%rowtype; item jsonb; product public.products%rowtype;
  new_item public.order_items%rowtype; ids jsonb; option_total numeric(12,2); unit numeric(12,2);
  selected_count int; distinct_count int; group_count int; grp record; mode text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'DRAFT_VERSION_REQUIRED'; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.draft_version <> p_expected_version then raise exception 'STALE_DRAFT_VERSION'; end if;
  if ord.status not in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED','COLLECTED') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if ord.payment_status not in ('PENDING','UNPAID') then raise exception 'ORDER_ALREADY_PAID'; end if;
  if not exists(select 1 from public.profiles where id=uid and status='ACTIVE' and role_name in ('ADMIN','MANAGER','WAITER','CASHIER'))
    then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  delete from public.order_items where order_id=p_order_id and item_status='DRAFT';
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'quantity','') !~ '^[0-9]+$' or (item->>'quantity')::int not between 1 and 99
      then raise exception 'INVALID_ITEM_QUANTITY'; end if;
    select * into product from public.products where id::text=item->>'productId' and status=true;
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    ids:=coalesce(item->'optionIds','[]'::jsonb);
    if jsonb_typeof(ids)<>'array' then raise exception 'INVALID_OPTION_IDS'; end if;
    select count(*),count(distinct x.id),coalesce(sum(po.price_adjustment),0)
      into selected_count,distinct_count,option_total
      from jsonb_array_elements_text(ids) x(id)
      join public.product_options po on po.id::text=x.id and po.is_available
      join public.product_option_groups pog on pog.id=po.option_group_id and pog.product_id=product.id;
    if selected_count<>jsonb_array_length(ids) or distinct_count<>selected_count then raise exception 'INVALID_OR_DUPLICATE_OPTIONS'; end if;
    for grp in select * from public.product_option_groups where product_id=product.id loop
      select count(*) into group_count from jsonb_array_elements_text(ids) x(id)
      join public.product_options po on po.id::text=x.id where po.option_group_id=grp.id;
      if group_count<grp.min_selection or group_count>grp.max_selection or (grp.is_required and group_count=0)
        then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    mode:=upper(coalesce(item->>'serviceMode',case when ord.dining_mode='takeaway' then 'TAKEAWAY' else 'DINE_IN' end));
    if mode not in ('DINE_IN','TAKEAWAY') or (ord.dining_mode='takeaway' and mode<>'TAKEAWAY') then raise exception 'INVALID_SERVICE_MODE'; end if;
    unit:=round(product.sell_price+option_total,2);
    insert into public.order_items(order_id,product_id,quantity,unit_price,subtotal,product_name_snapshot,special_request,sent_at,service_mode,item_status)
    values(ord.id,product.id,(item->>'quantity')::int,unit,round(unit*(item->>'quantity')::int,2),product.product_name,nullif(left(item->>'specialRequest',1000),''),null,mode,'DRAFT') returning * into new_item;
    insert into public.order_item_options(order_item_id,product_option_id,option_group_name,option_name,price_adjustment)
    select new_item.id,po.id,pog.name,po.name,po.price_adjustment from jsonb_array_elements_text(ids) x(id)
    join public.product_options po on po.id::text=x.id join public.product_option_groups pog on pog.id=po.option_group_id;
  end loop;
  ord:=public.recalculate_pos_order(p_order_id);
  update public.orders set draft_version=draft_version+1 where id=p_order_id returning * into ord;
  return jsonb_build_object('id',ord.id,'total',ord.total,'status',ord.status,'draft_version',ord.draft_version);
end;
$$;

revoke all on function public.replace_pos_draft_items(uuid,jsonb) from authenticated;
revoke all on function public.replace_pos_draft_items(uuid,jsonb,bigint) from public;
grant execute on function public.replace_pos_draft_items(uuid,jsonb,bigint) to authenticated;
