begin;
-- Movement actor columns reference staff profiles, not terminal Auth identities.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.apply_inventory_movement(uuid,uuid,uuid,numeric,text,text,text,bigint,text,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'fingerprint text;','fingerprint text; actor uuid; session public.terminal_staff_sessions;');
 definition:=replace(definition,' fingerprint:=md5(', E' session:=public.current_terminal_staff_session();\n select p.id into actor from public.profiles p where p.id=coalesce(session.staff_id,auth.uid()) and p.company_id=p_company;\n fingerprint:=md5(');
 definition:=replace(definition,'p_product,auth.uid())','p_product,actor)');
 definition:=replace(definition,'updated_by=auth.uid()','updated_by=actor');
 definition:=replace(definition,'fingerprint,auth.uid(),','fingerprint,actor,');
 definition:=replace(definition,' previous:=to_jsonb(item);',E' if p_type=\'OPENING\' and (item.version<>0 or item.stock_on_hand<>0) then raise exception \'OPENING_STOCK_ALREADY_RECORDED\'; end if;\n previous:=to_jsonb(item);');
 execute definition;
end $$;
create or replace function public.list_inventory_products(p_branch_id uuid) returns table(id uuid,product_name text,product_code varchar)
language plpgsql stable security definer set search_path=public as $$
declare company uuid;
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_branch_id);
 return query select p.id,p.product_name,p.product_code from public.products p
 where p.company_id=company and p.status and not exists(select 1 from public.inventory_items i where i.company_id=company and i.branch_id=p_branch_id and i.product_id=p.id)
 order by p.product_name,p.id;
end $$;
create or replace function public.get_pos_product_stock(p_product_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare session public.terminal_staff_sessions; item public.inventory_items;
begin
 session:=public.current_terminal_staff_session();
 if session.id is null or not public.has_pos_permission('product.view') then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED' using errcode='42501'; end if;
 if not exists(select 1 from public.products p join public.branch_products bp on bp.product_id=p.id and bp.branch_id=session.branch_id
 where p.id=p_product_id and p.company_id=session.company_id and p.status and bp.selling_enabled)
 then raise exception 'PRODUCT_NOT_FOUND' using errcode='42501'; end if;
 select * into item from public.inventory_items where company_id=session.company_id and branch_id=session.branch_id and product_id=p_product_id;
 return jsonb_build_object('productId',p_product_id,'branchId',session.branch_id,'tracked',item.id is not null,'quantity',item.stock_on_hand);
end $$;
notify pgrst,'reload schema';
commit;
