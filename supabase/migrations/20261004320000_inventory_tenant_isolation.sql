begin;

do $$ begin
 if exists(select 1 from public.inventory_items i join public.branches b on b.id=i.branch_id
  join public.products p on p.id=i.product_id where b.company_id is distinct from p.company_id or i.stock_on_hand<0)
 then raise exception 'INVENTORY_OWNER_OR_BALANCE_REPAIR_REQUIRED'; end if;
end $$;
alter table public.branches add constraint inventory_branch_company_identity unique(company_id,id);
alter table public.products add constraint inventory_product_company_identity unique(company_id,id);
alter table public.inventory_items add column company_id uuid;
update public.inventory_items i set company_id=b.company_id from public.branches b where b.id=i.branch_id;
alter table public.inventory_items alter column company_id set not null;
alter table public.inventory_items
 add constraint inventory_company_fk foreign key(company_id) references public.companies(id) on delete restrict,
 add constraint inventory_branch_owner_fk foreign key(company_id,branch_id) references public.branches(company_id,id) on delete restrict,
 add constraint inventory_product_owner_fk foreign key(company_id,product_id) references public.products(company_id,id) on delete restrict,
 add constraint inventory_company_identity unique(company_id,id),
 add constraint inventory_nonnegative_balance check(stock_on_hand>=0 and stock_on_hand::text not in ('NaN','Infinity','-Infinity'));
alter table public.inventory_items drop constraint inventory_items_branch_id_fkey,drop constraint inventory_items_product_id_fkey;
alter table public.inventory_movements add column company_id uuid,add column request_fingerprint text;
update public.inventory_movements m set company_id=i.company_id from public.inventory_items i where i.id=m.inventory_item_id;
alter table public.inventory_movements alter column company_id set not null;
alter table public.inventory_movements
 add constraint movement_inventory_owner_fk foreign key(company_id,inventory_item_id) references public.inventory_items(company_id,id) on delete restrict;
alter table public.inventory_movements drop constraint inventory_movements_inventory_item_id_fkey,drop constraint inventory_movements_idempotency_key_key;
alter table public.inventory_movements add constraint inventory_tenant_request_unique unique(company_id,idempotency_key);
create index inventory_company_branch_idx on public.inventory_items(company_id,branch_id,product_id);
create index inventory_movement_company_created_idx on public.inventory_movements(company_id,created_at desc);

create function public.can_access_inventory_branch(p_branch_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.branches b join public.companies c on c.id=b.company_id and c.status='ACTIVE'
 where b.id=p_branch_id and b.company_id=public.current_user_company_id() and public.can_access_branch(b.id))
$$;
revoke all on function public.can_access_inventory_branch(uuid) from public,anon;
grant execute on function public.can_access_inventory_branch(uuid) to authenticated;
create function public.require_inventory_branch(p_branch_id uuid,p_write boolean default false) returns uuid
language plpgsql stable security definer set search_path=public as $$
declare company uuid;
begin
 select b.company_id into company from public.branches b
 where b.id=p_branch_id and public.can_access_inventory_branch(b.id) and (not p_write or b.status='ACTIVE');
 if not found then raise exception 'INVENTORY_BRANCH_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 return company;
end $$;
revoke all on function public.require_inventory_branch(uuid,boolean) from public,anon,authenticated;
create policy inventory_tenant_scope on public.inventory_items as restrictive for all to authenticated
 using(company_id=public.current_user_company_id() and public.can_access_inventory_branch(branch_id))
 with check(company_id=public.current_user_company_id() and public.can_access_inventory_branch(branch_id));
create policy inventory_movement_tenant_scope on public.inventory_movements as restrictive for all to authenticated
 using(company_id=public.current_user_company_id() and exists(select 1 from public.inventory_items i
  where i.id=inventory_item_id and i.company_id=inventory_movements.company_id and public.can_access_inventory_branch(i.branch_id)))
 with check(company_id=public.current_user_company_id() and exists(select 1 from public.inventory_items i
  where i.id=inventory_item_id and i.company_id=inventory_movements.company_id and public.can_access_inventory_branch(i.branch_id)));

create function public.guard_inventory_history() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'INVENTORY_MOVEMENT_IMMUTABLE'; end $$;
create trigger inventory_history_immutable before update or delete on public.inventory_movements
for each row execute function public.guard_inventory_history();
create function public.guard_inventory_identity() returns trigger language plpgsql set search_path=public as $$
begin
 if new.company_id is distinct from old.company_id or new.branch_id is distinct from old.branch_id or new.product_id is distinct from old.product_id
 then raise exception 'INVENTORY_IDENTITY_IMMUTABLE'; end if;
 return new;
end $$;
create trigger inventory_identity_immutable before update on public.inventory_items for each row execute function public.guard_inventory_identity();
revoke all on function public.guard_inventory_history(),public.guard_inventory_identity() from public,anon,authenticated;

create or replace function public.list_inventory(p_branch_id uuid,p_search text default null,p_low_stock_only boolean default false,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare company uuid; result jsonb; total bigint;
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_branch_id);
 select count(*) into total from public.inventory_items i join public.products p on p.id=i.product_id and p.company_id=company
 where i.company_id=company and i.branch_id=p_branch_id
 and (coalesce(p_search,'')='' or strpos(lower(p.product_name),lower(p_search))>0 or strpos(lower(p.product_code),lower(p_search))>0)
 and (not coalesce(p_low_stock_only,false) or i.stock_on_hand<=i.reorder_level);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
  select i.*,p.product_code,p.product_name from public.inventory_items i join public.products p on p.id=i.product_id and p.company_id=company
  where i.company_id=company and i.branch_id=p_branch_id
  and (coalesce(p_search,'')='' or strpos(lower(p.product_name),lower(p_search))>0 or strpos(lower(p.product_code),lower(p_search))>0)
  and (not coalesce(p_low_stock_only,false) or i.stock_on_hand<=i.reorder_level)
  order by (i.stock_on_hand<=i.reorder_level) desc,p.product_name,i.id
  limit least(greatest(coalesce(p_limit,25),1),100) offset greatest(coalesce(p_offset,0),0)
 ) x;
 return jsonb_build_object('rows',result,'total',total);
end $$;

-- Private transactional writer shared by adjustments, transfers and sale settlement.
create function public.apply_inventory_movement(p_company uuid,p_branch uuid,p_product uuid,p_delta numeric,p_type text,p_reason text,p_key text,p_version bigint default null,p_reference_type text default null,p_reference_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.inventory_items; movement public.inventory_movements; previous jsonb; fingerprint text;
begin
 if p_delta is null or p_delta=0 or p_delta::text in ('NaN','Infinity','-Infinity') or p_delta<>round(p_delta,3)
 or length(btrim(coalesce(p_key,''))) not between 1 and 128 or length(btrim(coalesce(p_reason,''))) not between 3 and 500
 then raise exception 'INVALID_INVENTORY_ADJUSTMENT'; end if;
 if not exists(select 1 from public.branches where id=p_branch and company_id=p_company)
 or not exists(select 1 from public.products where id=p_product and company_id=p_company)
 then raise exception 'INVENTORY_PRODUCT_OR_BRANCH_NOT_FOUND' using errcode='42501'; end if;
 fingerprint:=md5(jsonb_build_array(p_company,p_branch,p_product,p_delta,p_type,btrim(p_reason),p_version,p_reference_type,p_reference_id)::text);
 perform pg_advisory_xact_lock(hashtextextended('inventory:'||p_company::text||':'||p_key,0));
 select * into movement from public.inventory_movements where company_id=p_company and idempotency_key=p_key;
 if found then
  if movement.request_fingerprint is distinct from fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
  select * into item from public.inventory_items where company_id=p_company and id=movement.inventory_item_id;
  return jsonb_build_object('item',to_jsonb(item),'movement',to_jsonb(movement),'replayed',true);
 end if;
 insert into public.inventory_items(company_id,branch_id,product_id,updated_by) values(p_company,p_branch,p_product,auth.uid())
 on conflict(branch_id,product_id) do nothing;
 select * into item from public.inventory_items where company_id=p_company and branch_id=p_branch and product_id=p_product for update;
 if p_version is not null and item.version<>p_version then raise exception 'INVENTORY_VERSION_CHANGED'; end if;
 if item.stock_on_hand+p_delta<0 then raise exception 'INSUFFICIENT_STOCK'; end if;
 previous:=to_jsonb(item);
 update public.inventory_items set stock_on_hand=stock_on_hand+p_delta,version=version+1,updated_at=now(),updated_by=auth.uid()
 where id=item.id and company_id=p_company returning * into item;
 insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity_delta,balance_after,reason,idempotency_key,request_fingerprint,created_by,reference_type,reference_id)
 values(p_company,item.id,p_type,p_delta,item.stock_on_hand,btrim(p_reason),p_key,fingerprint,auth.uid(),p_reference_type,p_reference_id) returning * into movement;
 perform public.write_pos_audit_diff('INVENTORY_'||p_type,'INVENTORY',item.id,p_reason,previous,to_jsonb(item),
  jsonb_build_object('companyId',p_company,'branchId',p_branch,'productId',p_product,'movementId',movement.id,'referenceType',p_reference_type,'referenceId',p_reference_id));
 return jsonb_build_object('item',to_jsonb(item),'movement',to_jsonb(movement),'replayed',false);
end $$;
revoke all on function public.apply_inventory_movement(uuid,uuid,uuid,numeric,text,text,text,bigint,text,uuid) from public,anon,authenticated;
create or replace function public.adjust_inventory(p_branch_id uuid,p_product_id uuid,p_quantity_delta numeric,p_movement_type text,p_reason text,p_idempotency_key text,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare company uuid; kind text:=upper(btrim(coalesce(p_movement_type,'')));
begin
 if not public.has_pos_permission('inventory.manage') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_branch_id,true);
 if kind not in ('OPENING','PURCHASE','WASTE','ADJUSTMENT','RETURN') or (kind in ('OPENING','PURCHASE','RETURN') and p_quantity_delta<0)
 or (kind='WASTE' and p_quantity_delta>0) then raise exception 'INVALID_INVENTORY_MOVEMENT_TYPE'; end if;
 return public.apply_inventory_movement(company,p_branch_id,p_product_id,p_quantity_delta,kind,p_reason,p_idempotency_key,p_expected_version);
end $$;

create function public.list_inventory_branches() returns table(id uuid,name text)
language sql stable security definer set search_path=public as $$
 select b.id,b.name from public.branches b where b.status='ACTIVE' and public.has_pos_permission('inventory.view') and public.can_access_inventory_branch(b.id) order by b.name,b.id
$$;
create function public.get_inventory_history(p_inventory_id uuid,p_limit integer default 100,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare item public.inventory_items; result jsonb;
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 select * into item from public.inventory_items where id=p_inventory_id and company_id=public.current_user_company_id() and public.can_access_inventory_branch(branch_id);
 if not found then raise exception 'INVENTORY_NOT_FOUND' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.inventory_movements where company_id=item.company_id and inventory_item_id=item.id order by created_at desc,id limit least(greatest(coalesce(p_limit,100),1),500) offset greatest(coalesce(p_offset,0),0)) x;
 return result;
end $$;
create function public.get_inventory_report(p_branch_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare company uuid; result jsonb;
begin
 if not public.has_pos_permission('inventory.view') then raise exception 'INSUFFICIENT_PERMISSION' using errcode='42501'; end if;
 company:=public.require_inventory_branch(p_branch_id);
 select jsonb_build_object('itemCount',count(*),'quantity',coalesce(sum(i.stock_on_hand),0),
 'costValue',coalesce(sum(i.stock_on_hand*p.cost_price),0),'lowStockCount',count(*) filter(where i.stock_on_hand<=i.reorder_level))
 into result from public.inventory_items i join public.products p on p.id=i.product_id and p.company_id=company
 where i.company_id=company and i.branch_id=p_branch_id;
 return result;
end $$;
revoke all on function public.list_inventory_branches(),public.get_inventory_history(uuid,integer,integer),public.get_inventory_report(uuid) from public,anon;
grant execute on function public.list_inventory_branches(),public.get_inventory_history(uuid,integer,integer),public.get_inventory_report(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
