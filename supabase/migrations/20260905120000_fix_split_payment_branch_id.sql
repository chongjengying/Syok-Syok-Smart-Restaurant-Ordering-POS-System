create or replace function public.complete_pos_bill_payment(p_bill_id uuid,p_payments jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare caller_id uuid:=auth.uid(); role_name text; bill public.order_bills%rowtype; branch uuid; payment jsonb; method text; amount numeric(12,2); received numeric(12,2); paid numeric(12,2); remaining numeric(12,2); order_paid boolean;
begin
 select p.role_name into role_name from public.profiles p where p.id=caller_id and p.status='ACTIVE';
 if coalesce(role_name,'') not in ('ADMIN','MANAGER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'PAYMENTS_REQUIRED'; end if;
 select * into bill from public.order_bills where id=p_bill_id for update; if not found then raise exception 'BILL_NOT_FOUND'; end if;
 if bill.status='PAID' then raise exception 'BILL_ALREADY_PAID'; end if;
 select branch_id into branch from public.orders where id=bill.order_id; if branch is null then raise exception 'BRANCH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('bill-payment:'||coalesce(p_idempotency_key,''),0)); paid:=0;
 for payment in select * from jsonb_array_elements(p_payments) loop
  method:=upper(coalesce(payment->>'method','')); amount:=round((payment->>'amount')::numeric,2); received:=round(coalesce((payment->>'receivedAmount')::numeric,amount),2);
  if method not in ('CASH','CARD','QR','EWALLET') or amount<=0 then raise exception 'INVALID_PAYMENT'; end if;
  if method<>'CASH' and amount>bill.total-bill.paid_amount-paid then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  if method='CASH' and received<amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
  paid:=paid+amount;
  insert into public.payments(order_id,bill_id,user_id,branch_id,payment_method,amount,received_amount,change_amount,reference,status,paid_at,idempotency_key,request_fingerprint)
  values(bill.order_id,bill.id,caller_id,branch,method,amount,received,greatest(received-amount,0),'BILL-'||bill.id::text,'PAID',now(),left(p_idempotency_key||'-'||method||'-'||amount::text,128),md5(bill.id::text||'|'||method||'|'||amount::text));
 end loop;
 remaining:=round(bill.total-bill.paid_amount-paid,2); if remaining<>0 then raise exception 'BILL_BALANCE_REMAINING'; end if;
 update public.order_bills set paid_amount=total,status='PAID',paid_at=now() where id=bill.id;
 select not exists(select 1 from public.order_bills where order_id=bill.order_id and status<>'PAID') into order_paid;
 if order_paid then update public.orders set payment_status='PAID' where id=bill.order_id; end if;
 return jsonb_build_object('billId',bill.id,'paidAmount',bill.total,'remainingAmount',0,'orderPaid',order_paid);
end; $$;
