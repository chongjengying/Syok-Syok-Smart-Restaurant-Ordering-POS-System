begin;
create function public.transfer_inventory(p_source_branch uuid,p_destination_branch uuid,p_product uuid,p_quantity numeric,p_reason text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare company uuid; source_result jsonb; destination_result jsonb; key text; transfer_id uuid;
begin
 if not public.has_pos_permission('inventory.manage') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_source_branch,true);
 if public.require_inventory_branch(p_destination_branch,true)<>company then raise exception 'INVENTORY_BRANCH_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_source_branch=p_destination_branch or p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity')
 or length(btrim(coalesce(p_idempotency_key,''))) not between 1 and 100 then raise exception 'INVALID_INVENTORY_TRANSFER'; end if;
 if not exists(select 1 from public.products where id=p_product and company_id=company) then raise exception 'INVENTORY_PRODUCT_OR_BRANCH_NOT_FOUND' using errcode='42501'; end if;
 key:='transfer:'||p_idempotency_key;
 -- Serialize both request identity and reversed transfers before acquiring item locks.
 perform pg_advisory_xact_lock(hashtextextended('inventory-transfer:'||company::text||':'||p_idempotency_key,0));
 perform pg_advisory_xact_lock(hashtextextended('inventory-transfer-product:'||company::text||':'||p_product::text,0));
 perform 1 from public.inventory_items where company_id=company and product_id=p_product and branch_id in (p_source_branch,p_destination_branch) order by branch_id for update;
 select reference_id into transfer_id from public.inventory_movements where company_id=company and idempotency_key=key||':out';
 transfer_id:=coalesce(transfer_id,gen_random_uuid());
 source_result:=public.apply_inventory_movement(company,p_source_branch,p_product,-p_quantity,'TRANSFER_OUT',p_reason,key||':out',null,'TRANSFER',transfer_id);
 destination_result:=public.apply_inventory_movement(company,p_destination_branch,p_product,p_quantity,'TRANSFER_IN',p_reason,key||':in',null,'TRANSFER',transfer_id);
 return jsonb_build_object('id',transfer_id,'source',source_result,'destination',destination_result);
end $$;
revoke all on function public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) to authenticated;

-- An inventory row opts a product/branch into tracked stock. Existing untracked
-- products keep their current behavior; only full settlement deducts stock.
create function public.deduct_settled_sale_inventory() returns trigger
language plpgsql security definer set search_path=public as $$
declare line record; company uuid;
begin
 if new.payment_status<>'PAID' or old.payment_status='PAID' then return new; end if;
 select company_id into company from public.branches where id=new.branch_id;
 if company is distinct from new.company_id then raise exception 'SALE_INVENTORY_COMPANY_MISMATCH'; end if;
 for line in
  select oi.product_id,sum(oi.quantity) quantity from public.order_items oi
  join public.inventory_items i on i.product_id=oi.product_id and i.branch_id=new.branch_id and i.company_id=company
  join public.products p on p.id=oi.product_id and p.company_id=company
  where oi.order_id=new.id and oi.item_status<>'VOIDED' group by oi.product_id order by oi.product_id
 loop
  perform public.apply_inventory_movement(company,new.branch_id,line.product_id,-line.quantity,'SALE','Sale '||new.order_number,
   'sale:'||new.id::text||':'||line.product_id::text,null,'ORDER',new.id);
 end loop;
 return new;
end $$;
create trigger settled_sale_inventory after update of payment_status on public.orders
for each row execute function public.deduct_settled_sale_inventory();
revoke all on function public.deduct_settled_sale_inventory() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
