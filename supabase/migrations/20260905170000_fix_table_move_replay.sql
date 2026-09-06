-- A retry must replay a completed move before comparing the caller's original
-- source-table snapshot, which is necessarily stale after the first commit.
create or replace function public.move_pos_order(
  p_order_id uuid,
  p_destination_table_id uuid,
  p_operation_key text,
  p_expected_source_table_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  current_order public.orders%rowtype;
  previous_move public.table_activity_logs%rowtype;
  current_user_id uuid := auth.uid();
  normalized_key text := nullif(left(btrim(coalesce(p_operation_key,'')),128),'');
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_expected_source_table_id is null then raise exception 'EXPECTED_SOURCE_TABLE_REQUIRED'; end if;
  if normalized_key is null then raise exception 'OPERATION_KEY_REQUIRED'; end if;
  select * into previous_move from public.table_activity_logs
  where performed_by=current_user_id and action='ORDER_MOVED_IN' and operation_key=normalized_key
  limit 1;
  if found then
    if previous_move.order_id is distinct from p_order_id or previous_move.restaurant_table_id is distinct from p_destination_table_id then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    select * into current_order from public.orders where id=p_order_id;
    if not found then raise exception 'ORDER_NOT_FOUND'; end if;
    return jsonb_build_object('order',row_to_json(current_order),'sourceTable',(select row_to_json(t) from public.restaurant_tables t where t.id=nullif(previous_move.metadata->>'source_table_id','')::uuid),'destinationTable',(select row_to_json(t) from public.restaurant_tables t where t.id=p_destination_table_id));
  end if;
  select * into current_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.restaurant_table_id is distinct from p_expected_source_table_id then raise exception 'ORDER_TABLE_CHANGED'; end if;
  return public.move_pos_order(p_order_id,p_destination_table_id,normalized_key);
end;
$$;
revoke all on function public.move_pos_order(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.move_pos_order(uuid,uuid,text,uuid) to authenticated;
