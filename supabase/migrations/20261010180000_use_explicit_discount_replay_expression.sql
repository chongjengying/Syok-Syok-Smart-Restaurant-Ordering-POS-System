begin;

do $do$
declare definition text;
begin
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 if strpos(definition,'a.amount=approve_manual_order_discount.amount and a.reason=approve_manual_order_discount.reason')=0
 then raise exception 'DISCOUNT_REPLAY_EXPRESSION_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,
  'a.amount=approve_manual_order_discount.amount and a.reason=approve_manual_order_discount.reason',
  $$a.amount=(case when upper(btrim(coalesce(p_discount_type,'')))='PERCENTAGE'
    then round(o.subtotal*p_value/100,2) else least(o.subtotal,p_value) end)
    and a.reason=nullif(left(btrim(coalesce(p_reason,'')),500),'')$$);
 execute definition;
end $do$;

commit;
