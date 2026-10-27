begin;

do $$
declare definition text; revised text;
begin
 select pg_get_functiondef('public.refund_pos_order(uuid,text,text,numeric,jsonb)'::regprocedure) into definition;
 revised:=replace(definition,'caller_id uuid:=auth.uid()',
   'caller_id uuid:=coalesce((public.current_terminal_staff_session()).staff_id,auth.uid())');
 revised:=replace(revised,
   'if found then
    if existing_refund.order_id<>p_order_id',
   'if found and not exists(select 1 from public.orders replay_order where replay_order.id=existing_refund.order_id and replay_order.company_id=public.current_user_company_id() and public.can_access_branch(replay_order.branch_id)) then raise exception ''ORDER_NOT_FOUND''; end if;
  if found then
    if existing_refund.order_id<>p_order_id');
 revised:=replace(revised,
   'if not found or not public.can_access_branch(ord.branch_id) then raise exception ''ORDER_NOT_FOUND''; end if;',
   'if not found or ord.company_id is distinct from public.current_user_company_id() or not public.can_access_branch(ord.branch_id) then raise exception ''ORDER_NOT_FOUND''; end if;');
 if revised=definition or revised not like '%replay_order.company_id=public.current_user_company_id()%' or revised not like '%ord.company_id is distinct from public.current_user_company_id()%' then
   raise exception 'REFUND_SCOPE_REWRITE_NOT_FOUND';
 end if;
 execute revised;
end $$;

commit;
