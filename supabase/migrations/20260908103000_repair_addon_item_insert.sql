begin;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.append_pos_order_items(uuid,jsonb,text)'::regprocedure) into definition;
  definition := replace(definition,
    'order_id, product_id, quantity, unit_price, subtotal,',
    'order_id, product_id, quantity, unit_price, subtotal, discount_amount,');
  definition := replace(definition,
    'item_unit_price, round(item_unit_price * (order_item->>''quantity'')::integer, 2),\n      product_record.product_name',
    'item_unit_price, round(item_unit_price * (order_item->>''quantity'')::integer, 2), 0,\n      product_record.product_name');
  execute definition;
end $$;
commit;
