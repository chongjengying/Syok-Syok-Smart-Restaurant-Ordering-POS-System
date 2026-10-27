begin;

create or replace function public.cashier_shift_summary(p_shift_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  sh public.cashier_shifts;
  opening numeric(14,2);
  sales numeric(14,2);
  cash_in numeric(14,2);
  cash_out numeric(14,2);
  refunds numeric(14,2);
  adjustments numeric(14,2);
  expected numeric(14,2);
  variance numeric(14,2);
  movements jsonb;
  payments jsonb;
begin
  select * into sh from public.cashier_shifts where id=p_shift_id;
  if not found or not public.can_access_branch(sh.branch_id) or not public.has_pos_permission('cash.shift.view') then
    raise exception 'SHIFT_NOT_FOUND';
  end if;

  select
    coalesce(sum(amount) filter (where movement_type='OPENING_FLOAT'),0),
    coalesce(sum(amount) filter (where movement_type='CASH_SALE'),0),
    coalesce(sum(amount) filter (where movement_type='CASH_IN'),0),
    coalesce(sum(amount) filter (where movement_type='CASH_OUT'),0),
    coalesce(sum(amount) filter (where movement_type='CASH_REFUND'),0),
    coalesce(sum(amount) filter (where movement_type='CASH_ADJUSTMENT'),0)
  into opening,sales,cash_in,cash_out,refunds,adjustments
  from public.cash_movements where shift_id=sh.id;
  expected:=round(opening+sales+cash_in+adjustments-cash_out-refunds,2);
  variance:=case when sh.actual_cash is null then null else round(sh.actual_cash-expected,2) end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'type',movement_type,'amount',amount,'reason',reason,'paymentId',payment_id,
    'orderId',order_id,'staffId',staff_id,'createdAt',created_at,
    'balanceImpact',case when movement_type in ('CASH_REFUND','CASH_OUT') then -amount
      when movement_type in ('OPENING_FLOAT','CASH_SALE','CASH_IN','CASH_ADJUSTMENT') then amount else 0 end
  ) order by created_at desc,id desc),'[]'::jsonb)
  into movements from public.cash_movements where shift_id=sh.id;
  select coalesce(jsonb_object_agg(payment_method,total),'{}'::jsonb) into payments
    from (select payment_method,sum(amount) total from public.payments
      where cashier_shift_id=sh.id and status='PAID' group by payment_method) x;

  return jsonb_build_object('shift',to_jsonb(sh),'openingFloat',round(opening,2),'cashSales',round(sales,2),
    'cashIn',round(cash_in,2),'cashOut',round(cash_out,2),'cashRefunds',round(refunds,2),
    'cashAdjustments',round(adjustments,2),'expectedCash',expected,'actualCash',sh.actual_cash,
    'variance',variance,'varianceStatus',case when variance is null then null when variance=0 then 'BALANCED'
      when variance>0 then 'OVER' else 'SHORT' end,'movements',movements,'paymentBreakdown',payments);
end;
$$;

create or replace function public.record_cash_movement(p_shift_id uuid,p_type text,p_amount numeric,p_reason text)
returns public.cash_movements language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; sh public.cashier_shifts; result public.cash_movements; kind text:=upper(trim(p_type)); amount numeric(14,2);
begin
  if not public.has_pos_permission('cash.movement') or kind not in ('CASH_IN','CASH_OUT','NO_SALE_DRAWER_OPEN','CASH_ADJUSTMENT') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  amount:=round(p_amount,2);
  if p_amount is null or amount<0 or amount>1000000 or (kind<>'NO_SALE_DRAWER_OPEN' and amount<=0) or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'INVALID_CASH_MOVEMENT'; end if;
  s:=public.require_terminal_staff_session(); select * into sh from public.cashier_shifts where id=p_shift_id and status='OPEN' for update;
  if sh.id is null or sh.terminal_id<>s.terminal_id or sh.branch_id<>s.branch_id then raise exception 'SHIFT_NOT_FOUND'; end if;
  insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,reason)
    values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,s.staff_id,kind,amount,trim(p_reason)) returning * into result;
  perform public.write_pos_audit_diff(case when kind='NO_SALE_DRAWER_OPEN' then 'NO_SALE_DRAWER_OPENED' else kind end,'CASH_MOVEMENT',result.id,trim(p_reason),null,to_jsonb(result)); return result;
end;
$$;

create or replace function public.record_cash_payment_movement() returns trigger language plpgsql security definer set search_path=public as $$
declare sh public.cashier_shifts;
begin
  if new.status='PAID' and new.payment_method='CASH' and new.cashier_shift_id is not null
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select * into sh from public.cashier_shifts where id=new.cashier_shift_id and status='OPEN';
    if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
    insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,staff_id,movement_type,amount,payment_id,order_id,reason)
      values(sh.company_id,sh.branch_id,sh.terminal_id,sh.id,new.user_id,'CASH_SALE',new.amount,new.id,new.order_id,'Cash payment')
      on conflict (payment_id) where payment_id is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.cashier_shift_summary(uuid),public.record_cash_movement(uuid,text,numeric,text) from public,anon;
grant execute on function public.cashier_shift_summary(uuid),public.record_cash_movement(uuid,text,numeric,text) to authenticated;
commit;
