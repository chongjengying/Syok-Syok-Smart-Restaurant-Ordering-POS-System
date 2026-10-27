begin;

do $$
declare definition text; revised text;
begin
  select pg_get_functiondef('public.create_pos_order_unbound(jsonb,text,text,text,text)'::regprocedure) into definition;
  revised := replace(definition,
    'current_user_id uuid := auth.uid();',
    'current_user_id uuid := coalesce((public.current_terminal_staff_session()).staff_id, auth.uid());');
  if revised = definition then raise exception 'CREATE_ORDER_STAFF_CONTEXT_NOT_FOUND'; end if;
  execute revised;

  select pg_get_functiondef('public.place_order(jsonb,text,text,text,text)'::regprocedure) into definition;
  revised := replace(definition,
    'current_user_id uuid := auth.uid();',
    'current_user_id uuid := coalesce((public.current_terminal_staff_session()).staff_id, auth.uid());');
  if revised = definition then raise exception 'PLACE_ORDER_STAFF_CONTEXT_NOT_FOUND'; end if;
  definition := revised;
  revised := replace(definition,
    '  result := public.create_pos_order_unbound(',
    $block$  if exists (
    select 1 from jsonb_array_elements(p_items) requested
    left join public.products product on product.id::text=requested->>'productId'
      and product.company_id=public.current_user_company_id()
      and product.branch_id=(public.current_terminal_staff_session()).branch_id
      and product.status and product.is_available
    where product.id is null
  ) then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

  result := public.create_pos_order_unbound($block$);
  if revised = definition then raise exception 'PLACE_ORDER_PRODUCT_GUARD_NOT_FOUND'; end if;
  execute revised;
end $$;

commit;
