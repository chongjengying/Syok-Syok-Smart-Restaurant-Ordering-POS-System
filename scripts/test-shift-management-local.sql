\set ON_ERROR_STOP on
\set keep_transaction true
\ir test-terminal-staff-access-local.sql

-- Every fixture and financial write is rolled back, including the connected sale/refund flow.
do $$
declare
 t uuid:='a0400000-0000-0000-0000-000000000041'; a uuid:='a0400000-0000-0000-0000-000000000031';
 branch uuid:='a0400000-0000-0000-0000-000000000011'; company uuid:='a0400000-0000-0000-0000-000000000001';
 pin text:=lpad((floor(random()*1000000))::integer::text,6,'0'); sh public.cashier_shifts; result jsonb; summary jsonb;
 category uuid; product uuid; sale_id uuid; paid_id uuid; cash_order uuid; method text; price numeric; shift_id uuid;
 before_count integer; owner uuid; replay public.cash_movements;
begin
 insert into public.role_permissions(role_id,permission_id) select r.id,p.id from public.roles r cross join public.permissions p where r.name='MANAGER' and r.company_id=company and p.scope='COMPANY_ASSIGNABLE' and p.is_active on conflict do nothing;
 delete from public.role_permissions where role_id=(select id from public.roles where name='KITCHEN' and company_id=company) and permission_id in (select id from public.permissions where code in ('cash.movement','cash.shift.open','cash.shift.close'));
 update public.pos_terminals set branch_id=branch,company_id=company,status='ACTIVE',registration_status='REGISTERED',auth_user_id='a0400000-0000-0000-0000-000000000021',access_mode='ALL_BRANCH_STAFF',device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id=t;
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id='a0400000-0000-0000-0000-000000000041'))::text,true);
 update public.staff set role_id=(select id from public.roles where name='MANAGER' and company_id=company) where id=a;
 update public.staff_pin_credentials_v2 set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf')) where staff_id=a;
 update public.branches set configuration=configuration||'{"tax_enabled":false,"service_charge_enabled":false}'::jsonb where id=branch;
 result:=public.login_terminal_staff(a,pin);
 if result->>'ok'<>'true' then raise exception 'Fixture PIN login failed'; end if;
 sh:=public.open_cashier_shift(300); shift_id:=sh.id; owner:=sh.opened_by_staff_id;
 if sh.device_assignment_id is null or sh.opened_by_session_id is null then raise exception 'Shift device/session missing'; end if;
 begin perform public.open_cashier_shift(300); raise exception 'Duplicate open allowed'; exception when raise_exception then if sqlerrm<>'SHIFT_ALREADY_OPEN' then raise; end if; end;
 replay:=public.record_cash_movement(sh.id,'CASH_IN',100,'Additional float','qa-in');
 if (public.record_cash_movement(sh.id,'CASH_IN',100,'Additional float','qa-in')).id<>replay.id then raise exception 'Movement replay created duplicate'; end if;
 begin perform public.record_cash_movement(sh.id,'CASH_IN',101,'Additional float','qa-in'); raise exception 'Changed replay allowed'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST' then raise; end if; end;
 perform public.record_cash_movement(sh.id,'CASH_OUT',50,'Petty cash','qa-out');
 begin perform public.record_cash_movement(sh.id,'CASH_OUT',0,'Invalid','qa-zero'); raise exception 'Zero cash out allowed'; exception when raise_exception then if sqlerrm<>'INVALID_CASH_MOVEMENT' then raise; end if; end;
 begin perform public.record_cash_movement(sh.id,'CASH_IN',-1,'Invalid','qa-negative'); raise exception 'Negative cash in allowed'; exception when raise_exception then if sqlerrm<>'INVALID_CASH_MOVEMENT' then raise; end if; end;
 update public.staff set role_id=(select id from public.roles where name='KITCHEN' and company_id=company) where id=a;
 begin perform public.record_cash_movement(sh.id,'CASH_OUT',10,'Unauthorized','qa-denied'); raise exception 'Unauthorized movement allowed'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_PERMISSION' then raise; end if; end;
 begin perform public.close_cashier_shift(sh.id,300); raise exception 'Unauthorized close allowed'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_PERMISSION' then raise; end if; end;
 begin perform public.open_cashier_shift(0); raise exception 'Unauthorized open allowed'; exception when raise_exception then if sqlerrm<>'INSUFFICIENT_PERMISSION' then raise; end if; end;
 update public.staff set role_id=(select id from public.roles where name='MANAGER' and company_id=company) where id=a;
 insert into public.categories(name,company_id,branch_id) values('Shift QA',company,branch) returning id into category;
 insert into public.products(category_id,company_id,branch_id,product_name,sell_price,cost_price,status,is_available)
 values(category,company,branch,'Shift QA sale',700,1,true,true) returning id into product;
 foreach method in array array['CASH','QR','EWALLET'] loop
   price:=case method when 'CASH' then 700 when 'QR' then 300 else 200 end;
   update public.products set sell_price=price where id=product;
   result:=public.create_pos_order(jsonb_build_array(jsonb_build_object('productId',product,'quantity',1,'optionIds','[]'::jsonb)),method,'takeaway',null,'qa-shift-order-'||method);
   sale_id:=(result->>'id')::uuid;
   if (select cashier_shift_id from public.orders where id=sale_id)<>sh.id then raise exception 'Order shift connection missing'; end if;
   -- Fulfilment uses the existing kitchen batch/status workflow before collection.
   perform public.start_kitchen_batch(sale_id,id) from public.order_item_batches where order_id=sale_id;
   perform public.ready_kitchen_batch(sale_id,id) from public.order_item_batches where order_id=sale_id;
   perform public.serve_ready_order(sale_id);
   result:=public.complete_pos_payment(sale_id,method,(select total from public.orders where id=sale_id),'qa-shift-pay-'||method,case when method in ('QR','EWALLET') then (select provider_id from public.payment_providers where enabled order by provider_id limit 1) end,'QA reference',1000);
   paid_id:=(result->'payment'->>'id')::uuid;
   if (select cashier_shift_id from public.payments where id=paid_id)<>sh.id then raise exception 'Payment shift connection missing'; end if;
   if method='CASH' then cash_order:=sale_id; end if;
 end loop;
 result:=public.refund_pos_order(cash_order,'Test partial cash refund','qa-shift-refund',50,'[]');
 if (result->'refund'->>'cashier_shift_id')::uuid<>sh.id then raise exception 'Refund shift context missing'; end if;
 summary:=public.cashier_shift_summary(sh.id);
 if (summary->>'expectedCash')::numeric<>1000 or (summary->>'cashSales')::numeric<>700 or (summary->>'cashRefunds')::numeric<>50 then raise exception 'Cash reconciliation incorrect: %',summary; end if;
 if (summary->'paymentBreakdown'->>'QR')::numeric<>300 or (summary->'paymentBreakdown'->>'EWALLET')::numeric<>200 or (summary->>'salesCount')::integer<>3 or (summary->>'refundCount')::integer<>1 then raise exception 'Payment breakdown incorrect'; end if;
 if (public.current_terminal_cash_shift()).id<>sh.id then raise exception 'Current shift inconsistent'; end if;
 update public.staff_pin_credentials_v2 set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf')) where staff_id='a0400000-0000-0000-0000-000000000032';
 result:=public.login_terminal_staff('a0400000-0000-0000-0000-000000000032',pin);
 if result->>'ok'<>'true' or (public.current_terminal_cash_shift()).id<>sh.id or (select opened_by_staff_id from public.cashier_shifts where id=sh.id)<>owner then raise exception 'Switch Staff transferred shift ownership'; end if;
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000075"}',true);
 if public.get_admin_staff_detail('a0400000-0000-0000-0000-000000000032')->'currentShift'->>'id'<>sh.id::text then raise exception 'Staff detail lost the operating shift after handoff'; end if;
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000053"}',true);
 perform public.switch_terminal_staff_session();
 result:=public.login_terminal_staff(a,pin);
 if result->>'ok'<>'true' or (public.current_terminal_cash_shift()).id<>sh.id then raise exception 'Relogin lost current shift'; end if;
 if (select opened_by_staff_id from public.cashier_shifts where id=sh.id)<>owner then raise exception 'Relogin changed shift owner'; end if;
 perform public.close_cashier_shift(sh.id,980);
 perform public.close_cashier_shift(sh.id,980);
 summary:=public.cashier_shift_summary(sh.id);
 if summary->'shift'->>'status'<>'CLOSED' or (summary->>'variance')::numeric<>-20 then raise exception 'Close variance incorrect'; end if;
 if not exists(select 1 from public.audit_logs where entity_id=sh.id and action='SHIFT_VARIANCE') then raise exception 'Variance audit missing'; end if;
 begin perform public.record_cash_movement(sh.id,'CASH_IN',1,'Closed','qa-closed'); raise exception 'Closed shift accepted movement'; exception when raise_exception then if sqlerrm<>'SHIFT_ALREADY_CLOSED' then raise; end if; end;
 begin perform public.create_pos_order(jsonb_build_array(jsonb_build_object('productId',product,'quantity',1)),'CARD','takeaway',null,'qa-closed-order'); raise exception 'Order without shift allowed'; exception when raise_exception then if sqlerrm<>'ACTIVE_CASHIER_SHIFT_REQUIRED' then raise; end if; end;
 begin perform public.refund_pos_order(cash_order,'Closed drawer refund','qa-closed-refund',10,'[]'); raise exception 'Refund to closed shift allowed'; exception when raise_exception then if sqlerrm<>'ACTIVE_CASHIER_SHIFT_REQUIRED' then raise; end if; end;
 begin update public.cash_movements m set amount=1 where m.shift_id=sh.id and movement_type='CASH_IN'; raise exception 'Ledger editing allowed'; exception when raise_exception then if sqlerrm<>'CASH_LEDGER_IMMUTABLE' then raise; end if; end;
 begin update public.cashier_shifts set status='OPEN',closed_at=null,actual_cash=null where id=sh.id; raise exception 'Closed shift reopened'; exception when raise_exception then if sqlerrm<>'SHIFT_HISTORY_IMMUTABLE' then raise; end if; end;
 if jsonb_array_length(public.list_cashier_shift_history(jsonb_build_object('shiftId',sh.id)))<>1 then raise exception 'Shift history missing'; end if;
 begin update public.pos_terminals set status='INACTIVE' where id=t; perform public.open_cashier_shift(0); raise exception 'Disabled terminal opened shift'; exception when raise_exception then if sqlerrm<>'ACTIVE_STAFF_SESSION_REQUIRED' then raise; end if; end;
 begin update public.branches set status='INACTIVE' where id=branch; perform public.open_cashier_shift(0); raise exception 'Inactive branch opened shift'; exception when raise_exception then if sqlerrm<>'ACTIVE_STAFF_SESSION_REQUIRED' then raise; end if; end;
 begin update public.companies set status='INACTIVE' where id=company; perform public.open_cashier_shift(0); raise exception 'Inactive company opened shift'; exception when raise_exception then if sqlerrm<>'ACTIVE_STAFF_SESSION_REQUIRED' then raise; end if; end;
 begin update public.staff_branch_assignments set status='INACTIVE' where staff_id=owner and branch_id=branch; perform public.open_cashier_shift(0); raise exception 'Wrong branch staff opened shift'; exception when raise_exception then if sqlerrm<>'ACTIVE_STAFF_SESSION_REQUIRED' then raise; end if; end;
 update public.terminal_device_assignments set status='REVOKED',revoked_at=now() where terminal_id=t and status='ACTIVE';
 begin perform public.open_cashier_shift(0); raise exception 'Revoked device opened shift'; exception when raise_exception then if sqlerrm<>'ACTIVE_STAFF_SESSION_REQUIRED' then raise; end if; end;
 update public.staff set active=false where id=a;
 if not exists(select 1 from public.cashier_shifts where id=shift_id and status='CLOSED') then raise exception 'Deactivation removed history'; end if;
end $$;

do $$ declare pin text:=lpad((floor(random()*1000000))::integer::text,6,'0'); result jsonb; begin
 update public.staff set active=true where id='a0400000-0000-0000-0000-000000000031';
 update public.pos_terminals set device_identifier=gen_random_uuid()::text||gen_random_uuid()::text where id='a0400000-0000-0000-0000-000000000041';
 perform set_config('request.headers',jsonb_build_object('x-pos-device-credential',(select device_identifier from public.pos_terminals where id='a0400000-0000-0000-0000-000000000041'))::text,true);
 update public.staff_pin_credentials_v2 set pin_hash=extensions.crypt(pin,extensions.gen_salt('bf')) where staff_id='a0400000-0000-0000-0000-000000000031';
 result:=public.login_terminal_staff('a0400000-0000-0000-0000-000000000031',pin);
 if result->>'ok'<>'true' then raise exception 'Authenticated role fixture login failed'; end if;
end $$;
set local role authenticated;
do $$ declare sh public.cashier_shifts; begin
 sh:=public.open_cashier_shift(0);
 perform public.record_cash_movement(sh.id,'CASH_IN',10,'Authenticated cash in','qa-authenticated');
 if (public.cashier_shift_summary(sh.id)->>'expectedCash')::numeric<>10 then raise exception 'Authenticated RPC connection failed'; end if;
 if jsonb_array_length(public.list_cashier_shift_history('{"branchId":"a0400000-0000-0000-0000-000000000012"}'))<>0 then raise exception 'Cross-company history exposed'; end if;
 begin perform public.cashier_shift_summary('a0400000-0000-0000-0000-000000000099'); raise exception 'Unknown shift exposed'; exception when raise_exception then if sqlerrm<>'SHIFT_NOT_FOUND' then raise; end if; end;
 begin insert into public.cash_movements(shift_id,movement_type,amount) values(sh.id,'CASH_IN',10); raise exception 'Direct ledger insert permitted'; exception when insufficient_privilege then null; end;
 perform public.close_cashier_shift(sh.id,10);
 if (public.cashier_shift_summary(sh.id)->>'variance')::numeric<>0 then raise exception 'Balanced close failed'; end if;
end $$;
reset role;
do $$ declare sh public.cashier_shifts; begin
 sh:=public.open_cashier_shift(25);
 perform public.switch_terminal_staff_session();
 perform set_config('request.jwt.claims','{"sub":"a0400000-0000-0000-0000-000000000021","role":"authenticated","session_id":"a0400000-0000-0000-0000-000000000076"}',true);
 update public.profiles set branch_id='a0400000-0000-0000-0000-000000000013' where id='a0400000-0000-0000-0000-000000000021';
 perform public.force_close_cashier_shift(sh.id,25,'Test administrative reconciliation');
 if not exists(select 1 from public.audit_logs where cashier_shift_id=sh.id and action='SHIFT_FORCE_CLOSED' and terminal_id=sh.terminal_id and branch_id=sh.branch_id and company_id=sh.company_id) then raise exception 'Admin force-close audit location incorrect'; end if;
 update public.pos_terminals set status='INACTIVE' where id=sh.terminal_id;
 update public.branches set status='INACTIVE' where id=sh.branch_id;
 if public.cashier_shift_summary(sh.id)->'shift'->>'status'<>'FORCE_CLOSED' then raise exception 'Deactivation lost shift summary'; end if;
end $$;
rollback;
