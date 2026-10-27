\set ON_ERROR_STOP on
\set keep_transaction true
\ir test-terminal-staff-access-local.sql
do $$ declare t uuid:='a0400000-0000-0000-0000-000000000041'; st uuid:='a0400000-0000-0000-0000-000000000031'; company uuid:='a0400000-0000-0000-0000-000000000001'; branch uuid:='a0400000-0000-0000-0000-000000000011'; pin text:=lpad((floor(random()*1000000))::integer::text,6,'0'); category uuid; product uuid; sale uuid; item uuid; refund_item uuid; result jsonb; shift public.cashier_shifts; begin
 insert into auth.users(id,is_anonymous) values('a0400000-0000-0000-0000-000000000025',true);
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000025","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000095"}',true);
 perform set_config('request.jwt.claim.sub','a0400000-0000-0000-0000-000000000025',true);
 update public.pos_terminals set branch_id=branch,company_id=company,status='ACTIVE',registration_status='REGISTERED',auth_user_id='a0400000-0000-0000-0000-000000000025',access_mode='ALL_BRANCH_STAFF',device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id=t;
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id=t))::text,true);
 insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.company_id=company and r.name='MANAGER' and p.scope='COMPANY_ASSIGNABLE' and p.is_active on conflict do nothing;
 update public.staff set role_id=(select id from public.roles where company_id=company and name='MANAGER') where id=st;
 update public.staff_pin_credentials_v2 set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf')) where staff_id=st;
 result:=public.login_terminal_staff(st,pin); if result->>'ok'<>'true' then raise exception 'Inventory POS fixture login failed'; end if;
 shift:=public.open_cashier_shift(0);
 update public.branches set configuration=configuration||'{"tax_enabled":false,"service_charge_enabled":false}'::jsonb where id=branch;
 insert into public.categories(name,company_id,branch_id) values('Tracked stock QA',company,branch) returning id into category;
 insert into public.products(category_id,company_id,branch_id,product_name,cost_price,sell_price,status,is_available) values(category,company,branch,'Tracked QA',2,10,true,true) returning id into product;
 result:=public.adjust_inventory(branch,product,3,'OPENING','QA opening stock','qa-opening',0);
 if not exists(select 1 from public.inventory_items where product_id=product and updated_by='a0400000-0000-0000-0000-000000000021') then raise exception 'Device movement lost staff actor'; end if;
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>3 then raise exception 'POS stock lookup incorrect'; end if;
 begin perform public.list_inventory('a0400000-0000-0000-0000-000000000013'); raise exception 'POS read another branch'; exception when insufficient_privilege then null; end;
 begin perform public.get_pos_product_stock(gen_random_uuid()); raise exception 'POS foreign product accepted'; exception when insufficient_privilege then null; end;
 -- Order creation still requires the existing Auth-backed profile architecture.
 update public.pos_terminals set auth_user_id='a0400000-0000-0000-0000-000000000021' where id=t;
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000096"}',true);
 perform set_config('request.jwt.claim.sub','a0400000-0000-0000-0000-000000000021',true);
 result:=public.login_terminal_staff(st,pin);
 if result->>'ok'<>'true' then raise exception 'Auth-backed POS relogin failed'; end if;
 result:=public.create_pos_order(jsonb_build_array(jsonb_build_object('productId',product,'quantity',2,'optionIds','[]'::jsonb)),'CASH','takeaway',null,'qa-inventory-sale'); sale:=(result->>'id')::uuid;
 perform public.start_kitchen_batch(sale,id) from public.order_item_batches where order_id=sale;
 perform public.ready_kitchen_batch(sale,id) from public.order_item_batches where order_id=sale;
 perform public.serve_ready_order(sale);
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>3 then raise exception 'Unpaid order deducted stock'; end if;
 result:=public.complete_pos_payment(sale,'CASH',20,'qa-inventory-payment',null,null,20);
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>1 then raise exception 'Settled sale did not deduct stock'; end if;
 result:=public.complete_pos_payment(sale,'CASH',20,'qa-inventory-payment',null,null,20);
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>1 then raise exception 'Payment retry double deducted stock'; end if;
 select id into item from public.order_items where order_id=sale limit 1;
 result:=public.refund_pos_order(sale,'QA physically returned item','qa-inventory-refund',null,jsonb_build_array(jsonb_build_object('orderItemId',item,'quantity',1)));
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>1 then raise exception 'Refund automatically restocked without disposition'; end if;
 select ri.id into refund_item from public.refund_items ri where ri.refund_id=(result->'refund'->>'id')::uuid;
 result:=public.return_refund_stock(refund_item,1,'QA goods inspected and returned','qa-return');
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>2 then raise exception 'Explicit return restocked wrong quantity'; end if;
 result:=public.return_refund_stock(refund_item,1,'QA goods inspected and returned','qa-return');
 if (public.get_pos_product_stock(product)->>'quantity')::numeric<>2 then raise exception 'Return replay duplicated stock'; end if;
 begin perform public.return_refund_stock(refund_item,1,'QA excess return','qa-return-2'); raise exception 'Excess returned quantity allowed'; exception when raise_exception then if sqlerrm<>'REFUND_RETURN_EXCEEDS_QUANTITY' then raise; end if; end;
 result:=public.create_pos_order(jsonb_build_array(jsonb_build_object('productId',product,'quantity',3,'optionIds','[]'::jsonb)),'CASH','takeaway',null,'qa-inventory-shortage'); sale:=(result->>'id')::uuid;
 perform public.start_kitchen_batch(sale,id) from public.order_item_batches where order_id=sale;
 perform public.ready_kitchen_batch(sale,id) from public.order_item_batches where order_id=sale;
 perform public.serve_ready_order(sale);
 begin perform public.complete_pos_payment(sale,'CASH',30,'qa-inventory-short-payment',null,null,30); raise exception 'Insufficient stock settled'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_STOCK' then raise; end if; end;
 if exists(select 1 from public.payments where order_id=sale and status='PAID') or (public.get_pos_product_stock(product)->>'quantity')::numeric<>2 then raise exception 'Failed settlement left partial finance/stock changes'; end if;
 raise notice 'VERIFIED PASS: authenticated POS branch/product scope, real sale settlement/replay, item refund + explicit return, return limit/replay and atomic insufficient-stock payment rollback';
end $$;
rollback;
