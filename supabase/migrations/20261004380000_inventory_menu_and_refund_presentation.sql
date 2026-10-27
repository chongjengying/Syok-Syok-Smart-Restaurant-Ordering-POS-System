begin;
do $patch$ declare d text; begin
 select pg_get_functiondef('public.get_current_branch_menu(uuid,text,integer,integer,uuid)'::regprocedure) into d;
 d:=replace(d,'''isAvailable'',not bp.sold_out,''soldOut'',bp.sold_out',
  '''isAvailable'',not bp.sold_out and not exists(select 1 from public.inventory_items i where i.company_id=s.company_id and i.branch_id=s.branch_id and i.product_id=p.id and i.stock_on_hand<=0),
   ''soldOut'',bp.sold_out or exists(select 1 from public.inventory_items i where i.company_id=s.company_id and i.branch_id=s.branch_id and i.product_id=p.id and i.stock_on_hand<=0),
   ''stockTracked'',exists(select 1 from public.inventory_items i where i.company_id=s.company_id and i.branch_id=s.branch_id and i.product_id=p.id),
   ''stockQuantity'',(select i.stock_on_hand from public.inventory_items i where i.company_id=s.company_id and i.branch_id=s.branch_id and i.product_id=p.id)');
 execute d;
 select pg_get_functiondef('public.list_admin_refunds(text,text,text,date,date,integer,integer)'::regprocedure) into d;
 d:=replace(d,'''orderItemId'',ri.order_item_id',
  '''refundItemId'',ri.id,
   ''returnedQuantity'',coalesce((select sum(m.quantity_delta) from public.inventory_movements m where m.company_id=o.company_id and m.reference_type=''REFUND_ITEM'' and m.reference_id=ri.id and m.movement_type=''RETURN''),0),
   ''stockTracked'',exists(select 1 from public.inventory_movements m join public.inventory_items i on i.id=m.inventory_item_id join public.order_items oi on oi.id=ri.order_item_id where m.company_id=o.company_id and m.reference_type=''ORDER'' and m.reference_id=o.id and m.movement_type=''SALE'' and i.product_id=oi.product_id and i.branch_id=o.branch_id),
   ''orderItemId'',ri.order_item_id');
 d:=replace(d,'where public.can_access_branch(o.branch_id)',
  'where o.company_id=public.current_user_company_id() and public.can_access_branch(o.branch_id)');
 execute d;
end $patch$;
-- Reserve server-owned idempotency namespaces for sale/transfer/refund operations.
do $patch$ declare d text; begin
 select pg_get_functiondef('public.adjust_inventory(uuid,uuid,numeric,text,text,text,bigint)'::regprocedure) into d;
 d:=replace(d,' company:=public.require_inventory_branch(p_branch_id,true);',
  ' company:=public.require_inventory_branch(p_branch_id,true);
 if p_idempotency_key ~ ''^(sale:|transfer:|refund-return:)'' then raise exception ''RESERVED_INVENTORY_REQUEST_KEY''; end if;');
 execute d;
 select pg_get_functiondef('public.deduct_settled_sale_inventory()'::regprocedure) into d;
 d:=replace(d,' for line in',
  ' if exists(select 1 from public.order_items oi join public.products p on p.id=oi.product_id where oi.order_id=new.id and oi.item_status<>''VOIDED'' and p.company_id<>company) then raise exception ''SALE_INVENTORY_COMPANY_MISMATCH''; end if;
 for line in');
 execute d;
end $patch$;
notify pgrst,'reload schema';
commit;
