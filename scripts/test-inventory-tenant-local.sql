\set ON_ERROR_STOP on
begin;
insert into public.companies(id,code,name,tax_type) values
 ('a0320000-0000-0000-0000-000000000001','QA_INV_A','Inventory A','TAX_EXEMPT'),
 ('a0320000-0000-0000-0000-000000000002','QA_INV_B','Inventory B','TAX_EXEMPT');
insert into public.branches(id,company_id,code,name) values
 ('a0320000-0000-0000-0000-000000000011','a0320000-0000-0000-0000-000000000001','QA_INV_A','Inventory A'),
 ('a0320000-0000-0000-0000-000000000012','a0320000-0000-0000-0000-000000000002','QA_INV_B','Inventory B'),
 ('a0320000-0000-0000-0000-000000000013','a0320000-0000-0000-0000-000000000001','QA_INV_A2','Inventory A2');
insert into auth.users(id) values('a0320000-0000-0000-0000-000000000021'),('a0320000-0000-0000-0000-000000000022');
insert into public.profiles(id,name,company_id,branch_id,role_id,role_name,status)
select f.id,'Inventory fixture',f.company,f.branch,r.id,r.name,'ACTIVE' from (values
 ('a0320000-0000-0000-0000-000000000021'::uuid,'a0320000-0000-0000-0000-000000000001'::uuid,'a0320000-0000-0000-0000-000000000011'::uuid),
 ('a0320000-0000-0000-0000-000000000022'::uuid,'a0320000-0000-0000-0000-000000000002'::uuid,'a0320000-0000-0000-0000-000000000012'::uuid)
) f(id,company,branch) join public.roles r on r.company_id=f.company and r.name='ADMIN'
on conflict(id) do update set company_id=excluded.company_id,branch_id=excluded.branch_id,role_id=excluded.role_id,role_name=excluded.role_name,status='ACTIVE';
insert into public.categories(id,name,company_id,branch_id) values
 ('a0320000-0000-0000-0000-000000000030','Inventory QA A','a0320000-0000-0000-0000-000000000001','a0320000-0000-0000-0000-000000000011'),
 ('a0320000-0000-0000-0000-000000000032','Inventory QA B','a0320000-0000-0000-0000-000000000002','a0320000-0000-0000-0000-000000000012');
insert into public.products(id,category_id,company_id,branch_id,product_name,cost_price,sell_price) values
 ('a0320000-0000-0000-0000-000000000031','a0320000-0000-0000-0000-000000000030','a0320000-0000-0000-0000-000000000001','a0320000-0000-0000-0000-000000000011','Inventory QA A',2,10),
 ('a0320000-0000-0000-0000-000000000033','a0320000-0000-0000-0000-000000000032','a0320000-0000-0000-0000-000000000002','a0320000-0000-0000-0000-000000000012','Inventory QA B',3,20);
insert into public.inventory_items(id,company_id,branch_id,product_id,stock_on_hand) values
 ('a0320000-0000-0000-0000-000000000041','a0320000-0000-0000-0000-000000000001','a0320000-0000-0000-0000-000000000011','a0320000-0000-0000-0000-000000000031',10),
 ('a0320000-0000-0000-0000-000000000042','a0320000-0000-0000-0000-000000000002','a0320000-0000-0000-0000-000000000012','a0320000-0000-0000-0000-000000000033',99);
insert into public.inventory_movements(company_id,inventory_item_id,movement_type,quantity_delta,balance_after,reason,idempotency_key) values
 ('a0320000-0000-0000-0000-000000000001','a0320000-0000-0000-0000-000000000041','OPENING',10,10,'QA opening','same-key'),
 ('a0320000-0000-0000-0000-000000000002','a0320000-0000-0000-0000-000000000042','OPENING',99,99,'QA opening','same-key');
select set_config('request.jwt.claims','{"sub":"a0320000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0320000-0000-0000-0000-000000000091"}',true);
select set_config('request.jwt.claim.sub','a0320000-0000-0000-0000-000000000021',true);
set local role authenticated;
do $$ declare a uuid:='a0320000-0000-0000-0000-000000000011'; b uuid:='a0320000-0000-0000-0000-000000000012'; dest uuid:='a0320000-0000-0000-0000-000000000013'; p uuid:='a0320000-0000-0000-0000-000000000031'; foreign_product uuid:='a0320000-0000-0000-0000-000000000033'; result jsonb; movement uuid; begin
 if (select count(*) from public.inventory_items)<>1 or (select count(*) from public.inventory_movements)<>1 then raise exception 'Direct tenant read leak'; end if;
 if exists(select 1 from public.inventory_items where id='a0320000-0000-0000-0000-000000000042') then raise exception 'Foreign ID visible'; end if;
 result:=public.list_inventory(a,'Inventory QA',false,25,0);
 if (result->>'total')::int<>1 or jsonb_array_length(result->'rows')<>1 then raise exception 'List/search scope'; end if;
 if (public.get_inventory_report(a)->>'costValue')::numeric<>20 then raise exception 'Aggregate mixes company'; end if;
 if jsonb_array_length(public.get_inventory_history('a0320000-0000-0000-0000-000000000041'))<>1 then raise exception 'Own history missing'; end if;
 if exists(select 1 from public.list_inventory_products(a) where id=p or id=foreign_product) then raise exception 'Opening picker included tracked or foreign product'; end if;
 if not exists(select 1 from public.list_inventory_products(dest) where id=p) then raise exception 'Company product unavailable to another own branch'; end if;
 begin perform public.list_inventory(b); raise exception 'Foreign list accepted'; exception when insufficient_privilege then null; end;
 begin perform public.get_inventory_report(b); raise exception 'Foreign report accepted'; exception when insufficient_privilege then null; end;
 begin perform public.get_inventory_history('a0320000-0000-0000-0000-000000000042'); raise exception 'Foreign history accepted'; exception when insufficient_privilege then null; end;
 begin perform public.adjust_inventory(b,foreign_product,1,'PURCHASE','Foreign branch','bad'); raise exception 'Foreign adjustment accepted'; exception when insufficient_privilege then null; end;
 begin perform public.adjust_inventory(a,foreign_product,1,'PURCHASE','Foreign product','bad'); raise exception 'Mixed product accepted'; exception when insufficient_privilege then null; end;
 begin perform public.transfer_inventory(a,b,p,1,'Foreign transfer','bad'); raise exception 'Foreign transfer accepted'; exception when insufficient_privilege then null; end;
 begin update public.inventory_items set stock_on_hand=200 where id='a0320000-0000-0000-0000-000000000042'; raise exception 'Direct stock write accepted'; exception when insufficient_privilege then null; end;
 result:=public.adjust_inventory(a,p,1,'PURCHASE','QA purchase','request-1',0); movement:=(result->'movement'->>'id')::uuid;
 if (public.adjust_inventory(a,p,1,'PURCHASE','QA purchase','request-1',0)->'movement'->>'id')::uuid<>movement then raise exception 'Duplicate movement on retry'; end if;
 begin perform public.adjust_inventory(a,p,2,'PURCHASE','QA purchase','request-1',0); raise exception 'Changed replay accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' then raise; end if; end;
 begin perform public.adjust_inventory(a,p,1,'PURCHASE','QA stale','request-2',0); raise exception 'Stale version accepted'; exception when raise_exception then if sqlerrm<>'INVENTORY_VERSION_CHANGED' then raise; end if; end;
 begin perform public.adjust_inventory(a,p,-100,'WASTE','QA waste','request-3'); raise exception 'Negative balance accepted'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_STOCK' then raise; end if; end;
 begin perform public.adjust_inventory(a,p,1,'TRANSFER_IN','Unpaired leg','request-4'); raise exception 'Manual transfer leg accepted'; exception when raise_exception then if sqlerrm<>'INVALID_INVENTORY_MOVEMENT_TYPE' then raise; end if; end;
 begin perform public.adjust_inventory(a,p,1,'OPENING','Repeated opening','request-opening'); raise exception 'Opening stock repeated'; exception when raise_exception then if sqlerrm<>'OPENING_STOCK_ALREADY_RECORDED' then raise; end if; end;
 begin perform public.adjust_inventory(a,p,1,'PURCHASE','Reserved key','sale:forged'); raise exception 'Reserved movement key accepted'; exception when raise_exception then if sqlerrm<>'RESERVED_INVENTORY_REQUEST_KEY' then raise; end if; end;
 result:=public.transfer_inventory(a,dest,p,2,'QA transfer','transfer-1');
 if (result->'source'->'item'->>'stock_on_hand')::numeric<>9 or (result->'destination'->'item'->>'stock_on_hand')::numeric<>2 then raise exception 'Transfer imbalance'; end if;
 if public.transfer_inventory(a,dest,p,2,'QA transfer','transfer-1')->>'id'<>result->>'id' then raise exception 'Transfer retry changed identity'; end if;
 begin perform public.transfer_inventory(a,dest,p,3,'QA transfer','transfer-1'); raise exception 'Transfer replay changed quantity'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' then raise; end if; end;
 begin perform public.transfer_inventory(a,dest,p,100,'QA transfer','transfer-2'); raise exception 'Transfer overdraft accepted'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_STOCK' then raise; end if; end;
 if not exists(select 1 from public.audit_logs where entity_id='a0320000-0000-0000-0000-000000000041' and old_value ? 'stock_on_hand' and new_value ? 'stock_on_hand') then raise exception 'Stock diff audit missing'; end if;
 raise notice 'VERIFIED PASS: inventory direct ID/list/search/history/report isolation, forged IDs, adjustments, replay/version/negative stock, atomic transfer and audit';
end $$;
reset role;
do $$ begin
 begin insert into public.inventory_items(company_id,branch_id,product_id) values('a0320000-0000-0000-0000-000000000001','a0320000-0000-0000-0000-000000000013','a0320000-0000-0000-0000-000000000033'); raise exception 'Mixed tenant FK accepted'; exception when foreign_key_violation then null; end;
 begin update public.inventory_movements set reason='Changed' where company_id='a0320000-0000-0000-0000-000000000001'; raise exception 'Movement editable'; exception when raise_exception then if sqlerrm<>'INVENTORY_MOVEMENT_IMMUTABLE' then raise; end if; end;
 if (select stock_on_hand from public.inventory_items where id='a0320000-0000-0000-0000-000000000042')<>99 then raise exception 'Foreign stock changed'; end if;
 raise notice 'VERIFIED PASS: composite ownership constraints, immutable movements and foreign balance preservation';
end $$;
rollback;
