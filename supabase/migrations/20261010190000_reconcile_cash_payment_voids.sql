begin;

do $do$
declare definition text;
begin
 select pg_get_functiondef('public.void_pos_payment(uuid,text,text,jsonb)'::regprocedure) into definition;
 if strpos(definition,'remaining numeric(12,2);')=0
   or strpos(definition,$$ perform public.write_pos_audit('PAYMENT_VOIDED'$$)=0
 then raise exception 'CASH_VOID_RECONCILIATION_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,'remaining numeric(12,2);',
   'remaining numeric(12,2); s public.terminal_staff_sessions; sh public.cashier_shifts;');
 definition:=replace(definition,
   $$ perform public.write_pos_audit('PAYMENT_VOIDED'$$,
   $patch$ if pay.payment_method='CASH' then
   s:=public.require_shift_operational_context();
   select * into sh from public.cashier_shifts
     where company_id=o.company_id and branch_id=o.branch_id
       and terminal_id=s.terminal_id and status='OPEN'
     for update;
   if sh.id is null then raise exception 'ACTIVE_CASHIER_SHIFT_REQUIRED'; end if;
   insert into public.cash_movements(company_id,branch_id,terminal_id,shift_id,
     staff_id,staff_session_id,movement_type,amount,order_id,reason,idempotency_key)
   values(o.company_id,o.branch_id,s.terminal_id,sh.id,s.staff_id,s.id,
     'CASH_OUT',pay.amount,o.id,'Cash payment void '||v.void_number,
     'payment-void:'||v.id::text);
 end if;
 perform public.write_pos_audit('PAYMENT_VOIDED'$patch$);
 execute definition;
end $do$;

commit;
