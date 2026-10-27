begin;

do $do$
declare definition text;
begin
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 if strpos(definition,'a.amount=amount and a.reason=reason')=0
 then raise exception 'DISCOUNT_REPLAY_VALUES_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,'a.amount=amount and a.reason=reason',
   'a.amount=approve_manual_order_discount.amount and a.reason=approve_manual_order_discount.reason');
 execute definition;
end $do$;

commit;
