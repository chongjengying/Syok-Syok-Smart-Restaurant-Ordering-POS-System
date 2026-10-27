begin;

do $do$
declare definition text;
begin
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 if strpos(definition, $$values(o.id,'MANUAL','Manager-approved manual discount',amount,reason,p_requested_by,p_requested_by,p_manager_id$$)=0
 then raise exception 'DISCOUNT_ACTOR_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,
   $$values(o.id,'MANUAL','Manager-approved manual discount',amount,reason,p_requested_by,p_requested_by,p_manager_id$$,
   $$values(o.id,'MANUAL','Manager-approved manual discount',amount,reason,auth.uid(),p_requested_by,p_manager_id$$);
 execute definition;
end $do$;

commit;
