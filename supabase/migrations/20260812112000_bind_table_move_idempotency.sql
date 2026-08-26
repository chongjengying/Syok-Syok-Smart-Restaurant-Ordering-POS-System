-- Bind table-move idempotency keys to one actor, order and destination.
-- This prevents a retried or accidentally reused key from moving an order twice.

alter function public.move_pos_order(uuid, uuid, text)
  rename to move_pos_order_unbound;

revoke all on function public.move_pos_order_unbound(uuid, uuid, text)
  from public, authenticated;

create function public.move_pos_order(
  p_order_id uuid,
  p_destination_table_id uuid,
  p_operation_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_operation_key text;
  previous_move public.table_activity_logs%rowtype;
  current_order public.orders%rowtype;
begin
  if current_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  normalized_operation_key := nullif(left(btrim(coalesce(p_operation_key, '')), 128), '');
  if normalized_operation_key is null then
    raise exception 'OPERATION_KEY_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(current_user_id::text || ':MOVE_ORDER:' || normalized_operation_key, 0)
  );

  select * into previous_move
  from public.table_activity_logs
  where performed_by = current_user_id
    and action = 'ORDER_MOVED_IN'
    and operation_key = normalized_operation_key
  limit 1;

  if found then
    if previous_move.order_id is distinct from p_order_id
      or previous_move.restaurant_table_id is distinct from p_destination_table_id
    then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;

    select * into current_order from public.orders where id = p_order_id;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    return jsonb_build_object(
      'order', row_to_json(current_order),
      'sourceTable', (
        select row_to_json(t) from public.restaurant_tables t
        where t.id = nullif(previous_move.metadata->>'source_table_id', '')::uuid
      ),
      'destinationTable', (
        select row_to_json(t) from public.restaurant_tables t
        where t.id = p_destination_table_id
      )
    );
  end if;

  return public.move_pos_order_unbound(
    p_order_id,
    p_destination_table_id,
    normalized_operation_key
  );
end;
$$;

revoke all on function public.move_pos_order(uuid, uuid, text) from public;
grant execute on function public.move_pos_order(uuid, uuid, text) to authenticated;
