begin;
do $$ declare definition text; target text:='update public.orders set status = ''CANCELLED'' where id = p_order_id returning * into result;'; begin
 select pg_get_functiondef('public.approve_order_void(uuid,uuid,uuid,text)'::regprocedure) into definition;
 if strpos(definition,target)=0 then raise exception 'VOID_METADATA_PATCH_TARGET_MISSING'; end if;
 definition:=replace(definition,target,'update public.orders set status = ''CANCELLED'', cancelled_by=p_manager_id, cancelled_at=clock_timestamp(), cancellation_reason=left(btrim(p_reason),500), status_before_cancel=current_order.status where id = p_order_id returning * into result;');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
