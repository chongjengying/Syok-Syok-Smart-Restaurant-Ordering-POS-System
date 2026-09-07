begin;

-- The final payment boundary never accepts browser totals as authoritative.
-- It reruns the shared pricing/discount evaluator, then the existing locked,
-- idempotent payment RPC verifies the caller's requested amount equals that
-- freshly calculated outstanding balance.
insert into public.permissions(code,module,description) values ('payment.create','finance','Accept an in-person POS payment') on conflict(code) do update set module=excluded.module,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='payment.create'
where upper(r.name) in ('ADMIN','OWNER','MANAGER','CASHIER') on conflict do nothing;
create or replace function public.complete_pos_payment(
 p_order_id uuid,p_payment_method text,p_requested_amount numeric,p_idempotency_key text,
 p_provider_id text default null,p_payment_reference text default null,p_received_amount numeric default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; voucher_code text; provider_key text:=upper(btrim(coalesce(p_provider_id,''))); method text:=upper(btrim(coalesce(p_payment_method,''))); result jsonb; payment public.payments%rowtype;
begin
 if auth.uid() is null or not public.has_pos_permission('payment.create') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if method='E_WALLET' then method:='EWALLET'; end if;
 if method not in ('CASH','CARD','QR','EWALLET') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 select * into ord from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if ord.company_id<>public.current_user_company_id() or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 if ord.status in ('CANCELLED','COMPLETED') and ord.payment_status<>'PARTIALLY_PAID' then raise exception 'ORDER_NOT_PAYABLE'; end if;
 select code into voucher_code from public.vouchers where id=ord.voucher_id;
 perform public.evaluate_order_discounts(ord.id,voucher_code);
 select * into ord from public.orders where id=ord.id for update;
 if method in ('QR','EWALLET') then
   if provider_key='' then raise exception 'PAYMENT_PROVIDER_REQUIRED'; end if;
   perform 1 from public.payment_providers where provider_id=provider_key and enabled=true;
   if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE'; end if;
 elsif provider_key<>'' then raise exception 'PAYMENT_PROVIDER_NOT_ALLOWED'; end if;
 result:=public.complete_payment(ord.id,method,p_requested_amount,p_idempotency_key,case when provider_key='' then 'POS_TERMINAL' else provider_key end,p_payment_reference,coalesce(p_received_amount,p_requested_amount));
 select * into payment from public.payments where id=(result->'payment'->>'id')::uuid for update;
 update public.payments set provider_id=nullif(provider_key,''),optional_reference_no=left(nullif(btrim(coalesce(p_payment_reference,'')),''),150),confirmation_mode=case when method in ('QR','EWALLET') then 'MANUAL' else confirmation_mode end,confirmed_by=auth.uid(),confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=payment.id returning * into payment;
 perform public.write_pos_audit('PAYMENT_ACCEPTED','PAYMENT',payment.id,null,jsonb_build_object('orderId',ord.id,'amount',payment.amount,'method',method,'providerId',nullif(provider_key,''),'confirmationMode',case when method in ('QR','EWALLET') then 'MANUAL' else 'CASHIER_CONFIRMED' end,'receivedAmount',payment.received_amount,'changeAmount',payment.change_amount));
 return jsonb_set(result,'{payment}',to_jsonb(payment),true);
end $$;
create or replace function public.complete_pos_takeaway_payment_and_submit(
 p_order_id uuid,p_payment_method text,p_requested_amount numeric,p_idempotency_key text,p_provider_id text default null,p_payment_reference text default null,p_received_amount numeric default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype;
begin
 select * into ord from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if ord.dining_mode<>'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
 if ord.status='DRAFT' then perform public.submit_pos_order(ord.id,left(p_idempotency_key,110)||':submit'); end if;
 return public.complete_pos_payment(p_order_id,p_payment_method,p_requested_amount,p_idempotency_key,p_provider_id,p_payment_reference,p_received_amount);
end $$;
revoke all on function public.complete_pos_payment(uuid,text,numeric,text,text,text,numeric) from public,anon;
revoke all on function public.complete_pos_takeaway_payment_and_submit(uuid,text,numeric,text,text,text,numeric) from public,anon;
grant execute on function public.complete_pos_payment(uuid,text,numeric,text,text,text,numeric),public.complete_pos_takeaway_payment_and_submit(uuid,text,numeric,text,text,text,numeric) to authenticated;
commit;
