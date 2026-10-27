begin;

do $do$
declare definition text; target text;
begin
 select pg_get_functiondef('public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text)'::regprocedure) into definition;
 target:=' delete from public.order_adjustments a_delete where a_delete.order_id=o.id and a_delete.kind=''MANUAL'' and a_delete.status=''APPLIED'';';
 if strpos(definition,target)=0 then raise exception 'MANUAL_APPROVAL_REPLAY_REWRITE_NOT_FOUND'; end if;
 definition:=replace(definition,target,
 $patch$
 if exists(select 1 from public.order_adjustments a
   where a.order_id=o.id and a.kind='MANUAL' and a.status='APPLIED'
     and a.discount_type=kind and a.discount_value=p_value
     and a.amount=amount and a.reason=reason
     and a.requested_by_staff_id=p_requested_by
     and a.approved_by_staff_id=p_manager_id)
 then
   return (select jsonb_build_object('ok',true,'orderId',id,'discount',discount,
      'total',total,'requestedBy',p_requested_by,'approvedBy',p_manager_id,'replayed',true)
     from public.orders where id=o.id);
 end if;
 delete from public.order_adjustments a_delete where a_delete.order_id=o.id and a_delete.kind='MANUAL' and a_delete.status='APPLIED';$patch$);
 execute definition;
end $do$;

commit;
