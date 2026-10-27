begin;
do $patch$ declare d text; begin
 select pg_get_functiondef('public.complete_payment(uuid,text,numeric,text,text,text)'::regprocedure) into d;
 d:=replace(d, 'if not found then raise exception ''ORDER_NOT_FOUND''; end if;',
  'if not found or ord.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(ord.branch_id) then raise exception ''ORDER_NOT_FOUND''; end if;');
 execute d;
 select pg_get_functiondef('public.complete_pos_payment(uuid,text,numeric,text,text,text,numeric)'::regprocedure) into d;
 d:=replace(d,' select * into ord from public.orders where id=p_order_id for update;',
  ' if length(btrim(coalesce(p_idempotency_key,''''))) not between 1 and 128 then raise exception ''IDEMPOTENCY_KEY_REQUIRED''; end if;
 perform pg_advisory_xact_lock(hashtextextended(''payment:''||btrim(p_idempotency_key),0));
 select * into ord from public.orders where id=p_order_id for update;');
 d:=replace(d,' if ord.status in (''CANCELLED'',''COMPLETED'')',
  ' select * into payment from public.payments where idempotency_key=btrim(p_idempotency_key);
 if found and payment.status=''PAID'' then
   if payment.order_id<>ord.id or payment.provider_id is distinct from nullif(provider_key,'''')
      or payment.optional_reference_no is distinct from left(nullif(btrim(coalesce(p_payment_reference,'''')),''''),150)
   then raise exception ''IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST''; end if;
   return public.complete_payment(ord.id,method,p_requested_amount,p_idempotency_key,
     case when provider_key='''' then ''POS_TERMINAL'' else provider_key end,p_payment_reference,coalesce(p_received_amount,p_requested_amount));
 end if;
 if ord.status in (''CANCELLED'',''COMPLETED'')');
 execute d;
end $patch$;
commit;
