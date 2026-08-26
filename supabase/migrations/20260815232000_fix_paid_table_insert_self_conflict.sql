-- sync_restaurant_table_status is an AFTER trigger, so its conflict lookup
-- must not count the order row that just fired the trigger.

do $$
declare
  definition text;
  old_predicate constant text := 'where existing.restaurant_table_id = new.restaurant_table_id
        and existing.payment_status';
  new_predicate constant text := 'where existing.restaurant_table_id = new.restaurant_table_id
        and existing.id <> new.id
        and existing.payment_status';
begin
  definition := pg_get_functiondef('public.sync_restaurant_table_status()'::regprocedure);
  if position(old_predicate in definition) = 0 then
    raise exception 'EXPECTED_TABLE_ORDER_CONFLICT_PREDICATE_NOT_FOUND';
  end if;
  execute replace(definition, old_predicate, new_predicate);
end;
$$;

revoke all on function public.sync_restaurant_table_status() from public, anon, authenticated;
