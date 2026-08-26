begin;

create or replace function public.move_pos_order(
  p_order_id uuid,
  p_destination_table_id uuid,
  p_operation_key text,
  p_expected_source_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_expected_source_table_id is null then raise exception 'EXPECTED_SOURCE_TABLE_REQUIRED'; end if;

  -- Serialize competing moves before comparing the caller's observed source.
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.restaurant_table_id is distinct from p_expected_source_table_id then
    raise exception 'ORDER_TABLE_CHANGED';
  end if;

  return public.move_pos_order(p_order_id, p_destination_table_id, p_operation_key);
end;
$$;

revoke all on function public.move_pos_order(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.move_pos_order(uuid,uuid,text,uuid) from public, anon;
grant execute on function public.move_pos_order(uuid,uuid,text,uuid) to authenticated;

commit;
