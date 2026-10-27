begin;

do $do$
declare definition text;
begin
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 if strpos(definition,'a.discount_type=kind')=0 then raise exception 'DISCOUNT_KIND_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,'a.discount_type=kind',
   $$a.discount_type=upper(btrim(coalesce(p_discount_type,'')))$$);
 execute definition;
end $do$;

commit;
