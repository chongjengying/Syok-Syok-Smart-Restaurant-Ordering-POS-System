-- Availability is part of the authoritative product state.  Existing order
-- RPCs already lock and price products transactionally; include the explicit
-- availability flag in those same guards so sold-out items cannot be ordered
-- through a stale or forged client request.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.create_pos_order_unbound(jsonb,text,text,text,text)'::regprocedure)
    into definition;
  definition := replace(definition,
    'where id::text = order_item->>''productId'' and status = true',
    'where id::text = order_item->>''productId'' and status = true and is_available = true');
  execute definition;

  select pg_get_functiondef('public.append_pos_order_items(uuid,jsonb,text)'::regprocedure)
    into definition;
  definition := replace(definition,
    'where id::text = order_item->>''productId'' and status = true',
    'where id::text = order_item->>''productId'' and status = true and is_available = true');
  execute definition;

  select pg_get_functiondef('public.submit_pos_order(uuid,text)'::regprocedure)
    into definition;
  definition := replace(definition,
    'p.id = oi.product_id and p.status = true',
    'p.id = oi.product_id and p.status = true and p.is_available = true');
  execute definition;
end;
$migration$;
