-- Local-development cleanup only. Removes generated smoke fixtures and leaves
-- one actionable dine-in payment plus one completed takeaway payment.
begin;

truncate table
  public.kitchen_order_items,
  public.kitchen_orders,
  public.order_item_options,
  public.order_items,
  public.order_item_batches,
  public.order_submissions,
  public.order_status_history,
  public.payments,
  public.table_activity_logs,
  public.orders,
  public.product_options,
  public.product_option_groups,
  public.products,
  public.categories
restart identity;

delete from public.restaurant_tables
where table_number not in ('A01', 'A02', 'A03', 'B01', 'B02', 'B03', 'C01', 'C02');

update public.restaurant_tables
set status = 'AVAILABLE', is_active = true;

-- Test signups consistently use example.com. Preserve genuine local accounts.
delete from auth.users where email like '%@example.com';
delete from public.profiles where email like '%@example.com';

do $$
declare
  actor_id uuid;
  table_a01_id uuid;
  main_category_id uuid;
  sides_category_id uuid;
  drinks_category_id uuid;
  chicken_chop_id uuid;
  chicken_burger_id uuid;
  fries_id uuid;
  lemon_tea_id uuid;
  dine_order_id uuid := gen_random_uuid();
  takeaway_order_id uuid := gen_random_uuid();
  dine_batch_id uuid;
  takeaway_batch_id uuid;
  paid_key text := 'demo-payment-takeaway-001';
begin
  select p.id into actor_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email = 'jason@gmail.com' and p.status = 'ACTIVE'
  limit 1;
  if actor_id is null then raise exception 'DEMO_ACTOR_NOT_FOUND'; end if;

  select id into table_a01_id from public.restaurant_tables where table_number = 'A01';
  if table_a01_id is null then raise exception 'TABLE_A01_NOT_FOUND'; end if;

  insert into public.categories(name, description)
  values ('Main Courses', 'Restaurant main dishes') returning id into main_category_id;
  insert into public.categories(name, description)
  values ('Sides', 'Side dishes') returning id into sides_category_id;
  insert into public.categories(name, description)
  values ('Beverages', 'Cold and hot drinks') returning id into drinks_category_id;

  insert into public.products(category_id, product_name, description, unit, cost_price, sell_price, status)
  values (main_category_id, 'Chicken Chop', 'Grilled chicken chop with house sauce', 'plate', 9.00, 18.00, true)
  returning id into chicken_chop_id;
  insert into public.products(category_id, product_name, description, unit, cost_price, sell_price, status)
  values (main_category_id, 'Chicken Burger', 'Chicken burger with fresh vegetables', 'item', 8.00, 16.00, true)
  returning id into chicken_burger_id;
  insert into public.products(category_id, product_name, description, unit, cost_price, sell_price, status)
  values (sides_category_id, 'French Fries', 'Crispy golden fries', 'portion', 2.00, 6.00, true)
  returning id into fries_id;
  insert into public.products(category_id, product_name, description, unit, cost_price, sell_price, status)
  values (drinks_category_id, 'Lemon Tea', 'Fresh lemon tea', 'glass', 1.50, 5.00, true)
  returning id into lemon_tea_id;

  -- Scenario 1: served dine-in bill awaiting cashier payment.
  insert into public.orders(
    id, order_number, user_id, subtotal, discount, tax, service_charge, total,
    status, payment_status, dining_mode, table_id, restaurant_table_id,
    kitchen_started_at, created_at, updated_at
  ) values (
    dine_order_id, 'DEMO-DINEIN-001', actor_id, 47.00, 0, 2.82, 4.70, 54.52,
    'SERVED', 'UNPAID', 'dine-in', table_a01_id::text, table_a01_id,
    now() - interval '8 minutes', now() - interval '12 minutes', now() - interval '2 minutes'
  );

  insert into public.order_items(
    order_id, product_id, quantity, unit_price, subtotal, product_name_snapshot,
    special_request, service_mode, item_status, sent_at
  ) values
    (dine_order_id, chicken_chop_id, 2, 18.00, 36.00, 'Chicken Chop', 'No spicy', 'DINE_IN', 'SERVED', now() - interval '11 minutes'),
    (dine_order_id, fries_id, 1, 6.00, 6.00, 'French Fries', null, 'DINE_IN', 'SERVED', now() - interval '11 minutes'),
    (dine_order_id, lemon_tea_id, 1, 5.00, 5.00, 'Lemon Tea', 'Less ice', 'DINE_IN', 'SERVED', now() - interval '11 minutes');

  insert into public.order_item_batches(
    order_id, user_id, idempotency_key, request_items, status,
    created_at, started_at, ready_at, served_at
  )
  select dine_order_id, actor_id, 'demo-dinein-batch-001',
    jsonb_agg(jsonb_build_object('orderItemId', id) order by created_at), 'SERVED',
    now() - interval '11 minutes', now() - interval '8 minutes', now() - interval '4 minutes', now() - interval '2 minutes'
  from public.order_items where order_id = dine_order_id
  returning id into dine_batch_id;
  update public.order_items set batch_id = dine_batch_id where order_id = dine_order_id;

  insert into public.payments(
    order_id, user_id, payment_method, amount, reference, status, paid_at
  ) values (
    dine_order_id, actor_id, 'CASH', 54.52, 'DEMO-DINEIN-001', 'PENDING', null
  );

  -- Scenario 2: completed takeaway retained for payment history/reporting.
  insert into public.orders(
    id, order_number, user_id, subtotal, discount, tax, service_charge, total,
    status, payment_status, dining_mode, table_id, restaurant_table_id,
    kitchen_started_at, created_at, updated_at
  ) values (
    takeaway_order_id, 'DEMO-TAKEAWAY-001', actor_id, 27.00, 0, 1.62, 0, 28.62,
    'COMPLETED', 'PAID', 'takeaway', null, null,
    now() - interval '32 minutes', now() - interval '40 minutes', now() - interval '20 minutes'
  );

  insert into public.order_items(
    order_id, product_id, quantity, unit_price, subtotal, product_name_snapshot,
    special_request, service_mode, item_status, sent_at
  ) values
    (takeaway_order_id, chicken_burger_id, 1, 16.00, 16.00, 'Chicken Burger', 'Sauce separately', 'TAKEAWAY', 'SERVED', now() - interval '39 minutes'),
    (takeaway_order_id, fries_id, 1, 6.00, 6.00, 'French Fries', null, 'TAKEAWAY', 'SERVED', now() - interval '39 minutes'),
    (takeaway_order_id, lemon_tea_id, 1, 5.00, 5.00, 'Lemon Tea', null, 'TAKEAWAY', 'SERVED', now() - interval '39 minutes');

  insert into public.order_item_batches(
    order_id, user_id, idempotency_key, request_items, status,
    created_at, started_at, ready_at, served_at
  )
  select takeaway_order_id, actor_id, 'demo-takeaway-batch-001',
    jsonb_agg(jsonb_build_object('orderItemId', id) order by created_at), 'SERVED',
    now() - interval '39 minutes', now() - interval '32 minutes', now() - interval '24 minutes', now() - interval '20 minutes'
  from public.order_items where order_id = takeaway_order_id
  returning id into takeaway_batch_id;
  update public.order_items set batch_id = takeaway_batch_id where order_id = takeaway_order_id;

  insert into public.payments(
    order_id, user_id, payment_method, amount, reference, status, paid_at,
    transaction_reference, provider, idempotency_key, request_fingerprint
  ) values (
    takeaway_order_id, actor_id, 'QR', 28.62, 'DEMO-TAKEAWAY-001', 'PAID', now() - interval '20 minutes',
    'QR-DEMO-TAKEAWAY-001', 'POS_QR_TERMINAL', paid_key,
    md5(takeaway_order_id::text || '|QR|28.62')
  );
end;
$$;

do $$
begin
  if (select count(*) from public.orders) <> 2 then raise exception 'EXPECTED_TWO_ORDERS'; end if;
  if (select count(*) from public.payments) <> 2 then raise exception 'EXPECTED_TWO_PAYMENTS'; end if;
  if (select count(*) from public.payments where status = 'PAID') <> 1 then raise exception 'EXPECTED_ONE_PAID_PAYMENT'; end if;
  if (select count(*) from public.order_item_batches) <> 2 then raise exception 'EXPECTED_TWO_KITCHEN_BATCHES'; end if;
  if (select count(*) from public.categories) <> 3 then raise exception 'EXPECTED_THREE_CATEGORIES'; end if;
  if (select count(*) from public.products) <> 4 then raise exception 'EXPECTED_FOUR_PRODUCTS'; end if;
  if exists (select 1 from auth.users where email like '%@example.com') then raise exception 'TEST_USERS_REMAIN'; end if;
  if exists (select 1 from public.profiles where email like '%@example.com') then raise exception 'TEST_PROFILES_REMAIN'; end if;
  if exists (
    select 1 from public.restaurant_tables
    where table_number not in ('A01', 'A02', 'A03', 'B01', 'B02', 'B03', 'C01', 'C02')
  ) then raise exception 'TEST_TABLES_REMAIN'; end if;
end;
$$;

commit;
