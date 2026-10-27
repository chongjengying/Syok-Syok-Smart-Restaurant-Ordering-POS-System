begin;
create function public.return_refund_stock(p_refund_item_id uuid,p_quantity numeric,p_reason text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare ri public.refund_items; refund public.refunds; sale public.orders; line public.order_items; company uuid; key text; returned numeric;
begin
 if not public.has_pos_permission('inventory.manage') or not public.has_pos_permission('payment.refund')
 then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 select * into ri from public.refund_items where id=p_refund_item_id for update;
 if not found then raise exception 'REFUND_ITEM_NOT_FOUND' using errcode='42501'; end if;
 select * into refund from public.refunds where id=ri.refund_id and status='COMPLETED';
 select * into sale from public.orders where id=refund.order_id and company_id=public.current_user_company_id();
 if sale.id is null then raise exception 'REFUND_ITEM_NOT_FOUND' using errcode='42501'; end if;
 company:=public.require_inventory_branch(sale.branch_id,true);
 select * into line from public.order_items where id=ri.order_item_id and order_id=sale.id;
 if line.id is null or p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity')
 or p_quantity<>trunc(p_quantity) or length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 48 then raise exception 'INVALID_REFUND_STOCK_RETURN'; end if;
 if not exists(select 1 from public.inventory_movements m join public.inventory_items i on i.id=m.inventory_item_id
  where m.company_id=company and m.reference_type='ORDER' and m.reference_id=sale.id and m.movement_type='SALE'
  and i.product_id=line.product_id and i.branch_id=sale.branch_id)
 then raise exception 'SALE_STOCK_WAS_NOT_TRACKED'; end if;
 key:='refund-return:'||p_idempotency_key||':'||ri.id::text;
 if not exists(select 1 from public.inventory_movements where company_id=company and idempotency_key=key) then
  select coalesce(sum(quantity_delta),0) into returned from public.inventory_movements
  where company_id=company and reference_type='REFUND_ITEM' and reference_id=ri.id and movement_type='RETURN';
  if returned+p_quantity>ri.quantity then raise exception 'REFUND_RETURN_EXCEEDS_QUANTITY'; end if;
 end if;
 return public.apply_inventory_movement(company,sale.branch_id,line.product_id,p_quantity,'RETURN',p_reason,key,null,'REFUND_ITEM',ri.id);
end $$;
revoke all on function public.return_refund_stock(uuid,numeric,text,text) from public,anon;
grant execute on function public.return_refund_stock(uuid,numeric,text,text) to authenticated;

create function public.get_pos_product_stock(p_product_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare session public.terminal_staff_sessions; item public.inventory_items;
begin
 session:=public.current_terminal_staff_session();
 if session.id is null or not public.has_pos_permission('product.view') then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.products where id=p_product_id and company_id=session.company_id and (branch_id is null or branch_id=session.branch_id))
 then raise exception 'PRODUCT_NOT_FOUND' using errcode='42501'; end if;
 select * into item from public.inventory_items where company_id=session.company_id and branch_id=session.branch_id and product_id=p_product_id;
 return jsonb_build_object('productId',p_product_id,'branchId',session.branch_id,'tracked',item.id is not null,'quantity',item.stock_on_hand);
end $$;
revoke all on function public.get_pos_product_stock(uuid) from public,anon;
grant execute on function public.get_pos_product_stock(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
