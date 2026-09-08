begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.append_pos_order_items(uuid,jsonb,text)'::regprocedure) into definition;
  definition := replace(definition,
    'round(item_unit_price * (order_item->>''quantity'')::integer, 2),',
    'round(item_unit_price * (order_item->>''quantity'')::integer, 2), 0,');
  execute definition;
end $$;
commit;
