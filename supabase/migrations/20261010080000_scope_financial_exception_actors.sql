begin;

do $$
declare definition text; revised text; signature text;
begin
 foreach signature in array array[
   'public.cancel_pos_order(uuid,text,jsonb)',
   'public.reopen_pos_order(uuid,text,jsonb)'
 ] loop
   select pg_get_functiondef(signature::regprocedure) into definition;
   revised:=replace(definition,'actor uuid:=auth.uid()',
     'actor uuid:=coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
   if revised=definition then raise exception 'LIFECYCLE_ACTOR_MAPPING_NOT_FOUND: %',signature; end if;
   execute revised;
 end loop;

 signature:='public.void_pos_payment(uuid,text,text,jsonb)';
 select pg_get_functiondef(signature::regprocedure) into definition;
 revised:=replace(definition,'auth.uid()',
   'coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
 revised:=replace(revised,
   'if found then if v.payment_id<>p_payment_id',
   'if found and not exists(select 1 from public.orders replay_order where replay_order.id=v.order_id and replay_order.company_id=public.current_user_company_id() and public.can_access_branch(replay_order.branch_id)) then raise exception ''PAYMENT_NOT_FOUND'';end if; if found then if v.payment_id<>p_payment_id');
 revised:=replace(revised,
   'select * into o from public.orders where id=pay.order_id for update;',
   'select * into o from public.orders where id=pay.order_id for update; if not found or o.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(o.branch_id) or pay.branch_id is distinct from o.branch_id then raise exception ''PAYMENT_NOT_FOUND'';end if;');
 if revised=definition or revised not like '%replay_order.company_id=public.current_user_company_id()%' or revised not like '%pay.branch_id is distinct from o.branch_id%' then
   raise exception 'VOID_PAYMENT_SCOPE_REWRITE_NOT_FOUND';
 end if;
 execute revised;

 signature:='public.reprint_pos_receipt(uuid,text,jsonb)';
 select pg_get_functiondef(signature::regprocedure) into definition;
 revised:=replace(definition,'auth.uid()',
   'coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
 revised:=replace(revised,
   'if not found then raise exception ''RECEIPT_NOT_FOUND'';end if;',
   'if not found or r.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(r.branch_id) then raise exception ''RECEIPT_NOT_FOUND'';end if;');
 if revised=definition or revised not like '%r.company_id is distinct from public.current_user_company_id()%' then
   raise exception 'REPRINT_RECEIPT_SCOPE_REWRITE_NOT_FOUND';
 end if;
 execute revised;
end $$;

commit;
