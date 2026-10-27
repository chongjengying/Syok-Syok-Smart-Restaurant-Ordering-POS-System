\set ON_ERROR_STOP on
\set keep_takeaway_transaction true
\ir test-takeaway-order-local.sql

-- Prepare kitchen state inside the rollback fixture. The cashier retains
-- only its actual permissions when invoking the serving RPC below.
do $$
begin
  update public.order_items set item_status = 'READY'
    where order_id = current_setting('app.test_order_id')::uuid;
end $$;
set local role authenticated;
do $$
declare ord public.orders; replay public.orders; draft jsonb;
begin
  ord := public.serve_ready_order(current_setting('app.test_order_id')::uuid);
  if ord.status <> 'COMPLETED' or ord.payment_status <> 'PAID'
    or exists(select 1 from public.order_items where order_id = ord.id and item_status <> 'SERVED') then
    raise exception 'Paid order fulfillment regressed';
  end if;
  replay := public.serve_ready_order(ord.id);
  if replay.id <> ord.id then raise exception 'Serving replay changed order'; end if;

  draft := public.create_pos_draft('takeaway', null, gen_random_uuid()::text);
  perform public.replace_pos_draft_items((draft->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('productId', current_setting('app.test_product_id'), 'quantity', 1,
      'optionIds', current_setting('app.test_option_ids')::jsonb, 'specialRequest', 'Ready round'),
    jsonb_build_object('productId', current_setting('app.test_product_id'), 'quantity', 1,
      'optionIds', current_setting('app.test_option_ids')::jsonb, 'specialRequest', 'Preparing round')
  ), 0);
  perform public.submit_pos_order((draft->>'id')::uuid, gen_random_uuid()::text);
  perform set_config('app.test_mixed_order_id', draft->>'id', true);
  raise notice 'VERIFIED PASS: paid takeaway collection and repeat action';
end $$;
reset role;
do $$
declare v_order uuid := current_setting('app.test_mixed_order_id')::uuid;
begin
  if (select count(*) from public.order_items where order_id = v_order) <> 2 then
    raise exception 'Two kitchen fixture lines required';
  end if;
  update public.order_items set item_status = case
    when special_request = 'Ready round' then 'READY' else 'PREPARING' end
    where order_id = v_order;
  update public.orders set status = 'PREPARING' where id = v_order;
end $$;
set local role authenticated;
do $$
declare ord public.orders; v_order uuid := current_setting('app.test_mixed_order_id')::uuid;
begin
  ord := public.serve_ready_order(v_order);
  if ord.status <> 'PREPARING' or ord.payment_status <> 'UNPAID'
    or (select count(*) from public.order_items where order_id = v_order and item_status = 'SERVED') <> 1
    or (select count(*) from public.order_items where order_id = v_order and item_status = 'PREPARING') <> 1 then
    raise exception 'Serving ready round changed unfinished kitchen items';
  end if;
  begin
    perform public.serve_ready_order(v_order);
    raise exception 'Serving without ready food was allowed';
  exception when raise_exception then
    if sqlerrm <> 'ORDER_NOT_READY' then raise; end if;
  end;
  perform public.process_pos_split_payment(v_order, 'AMOUNT', 'CASH', round(ord.total / 2, 2),
    round(ord.total / 2, 2), '[]'::jsonb, null, gen_random_uuid()::text,
    'CASH_REGISTER', null, null);
  raise notice 'VERIFIED PASS: ready round served while another round prepares';
end $$;
reset role;
do $$
begin
  update public.order_items set item_status = 'READY'
    where order_id = current_setting('app.test_mixed_order_id')::uuid and item_status = 'PREPARING';
  update public.orders set status = 'READY' where id = current_setting('app.test_mixed_order_id')::uuid;
end $$;
set local role authenticated;
do $$
declare ord public.orders;
begin
  ord := public.serve_ready_order(current_setting('app.test_mixed_order_id')::uuid);
  if ord.status <> 'SERVED' or ord.payment_status <> 'PARTIALLY_PAID' then
    raise exception 'Serving changed the outstanding bill';
  end if;
  perform public.serve_ready_order(ord.id);
  begin
    perform public.serve_ready_order(gen_random_uuid());
    raise exception 'Unknown order exposed';
  exception when raise_exception then
    if sqlerrm <> 'ORDER_NOT_FOUND' then raise; end if;
  end;
  raise notice 'VERIFIED PASS: partially paid serving, repeat action, unknown order denied';
end $$;
reset role;
do $$
declare v_table uuid; s public.terminal_staff_sessions;
begin
  s := public.current_terminal_staff_session();
  insert into public.restaurant_tables(branch_id, table_number, capacity, status, is_active)
    values(s.branch_id, 'QA-' || left(gen_random_uuid()::text, 8), 2, 'AVAILABLE', true)
    returning id into v_table;
  perform set_config('app.test_serving_table_id', v_table::text, true);
end $$;
set local role authenticated;
do $$
declare draft jsonb; ord public.orders;
begin
  draft := public.create_pos_draft('dine-in', current_setting('app.test_serving_table_id')::uuid, gen_random_uuid()::text);
  perform public.replace_pos_draft_items((draft->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('productId', current_setting('app.test_product_id'), 'quantity', 1,
      'optionIds', current_setting('app.test_option_ids')::jsonb)), 0);
  perform public.submit_pos_order((draft->>'id')::uuid, gen_random_uuid()::text);
  select * into ord from public.orders where id = (draft->>'id')::uuid;
  perform public.complete_pos_payment(ord.id, 'CASH', ord.total, gen_random_uuid()::text, null, null, ord.total);
  perform set_config('app.test_dinein_serving_order_id', ord.id::text, true);
end $$;
reset role;
do $$
begin
  update public.order_items set item_status = 'READY'
    where order_id = current_setting('app.test_dinein_serving_order_id')::uuid;
end $$;
set local role authenticated;
do $$
declare ord public.orders;
begin
  ord := public.serve_ready_order(current_setting('app.test_dinein_serving_order_id')::uuid);
  if ord.status <> 'COMPLETED' or ord.payment_status <> 'PAID' then
    raise exception 'Paid dine-in serving regressed payment';
  end if;
  perform public.serve_ready_order(ord.id);
end $$;
reset role;
do $$
declare s public.terminal_staff_sessions;
begin
  s := public.current_terminal_staff_session();
  if not exists(select 1 from public.audit_logs where action = 'ORDER_READY_ITEMS_SERVED'
    and entity_id = current_setting('app.test_order_id')::uuid)
    or exists(select 1 from public.order_item_batches
      where order_id = current_setting('app.test_order_id')::uuid and status <> 'SERVED') then
    raise exception 'Serving audit or kitchen batch connection missing';
  end if;
  if not exists(select 1 from public.order_completion_events
      where order_id = current_setting('app.test_dinein_serving_order_id')::uuid
        and staff_id = s.staff_id and terminal_id = s.terminal_id and staff_session_id = s.id)
    or not exists(select 1 from public.restaurant_tables
      where id = current_setting('app.test_serving_table_id')::uuid
        and status = 'DIRTY' and dirty_by = s.staff_id)
    or (select count(*) from public.audit_logs where action = 'ORDER_READY_ITEMS_SERVED'
      and entity_id = current_setting('app.test_dinein_serving_order_id')::uuid) <> 1 then
    raise exception 'Completion person/session, table attribution, or replay audit incorrect';
  end if;
  raise notice 'VERIFIED PASS: paid dine-in serving, table cleanup state, staff/session audit and idempotency';
  delete from public.role_permissions rp using public.permissions p, public.staff staff
    where staff.id = s.staff_record_id and rp.role_id = staff.role_id
      and rp.permission_id = p.id and p.code = 'order.serve';
end $$;
set local role authenticated;
do $$
begin
  begin
    perform public.serve_ready_order(current_setting('app.test_order_id')::uuid);
    raise exception 'Serving without permission allowed';
  exception when raise_exception then
    if sqlerrm <> 'INSUFFICIENT_PERMISSION' then raise; end if;
  end;
  raise notice 'VERIFIED PASS: serving permission remains backend enforced';
end $$;
reset role;
rollback;
