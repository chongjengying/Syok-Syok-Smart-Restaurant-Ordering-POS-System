\set ON_ERROR_STOP on
\set keep_transaction true
\ir test-terminal-staff-access-local.sql
\unset keep_transaction

-- Use an isolated company, outlet, and cashier rather than the current user's
-- terminal. Device and financial fixtures are rolled back with the test.
do $$
declare
  device_id uuid := gen_random_uuid();
  auth_session uuid := gen_random_uuid();
  pin text := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  proof text := gen_random_uuid()::text || gen_random_uuid()::text;
  category_id uuid;
  result jsonb;
begin
  insert into auth.users(id, is_anonymous) values(device_id, true);
  if exists(select 1 from public.profiles where id = device_id) then
    raise exception 'Device fixture unexpectedly has a staff profile';
  end if;
  update public.profiles set role_name = 'CASHIER',
    role_id = (select id from public.roles where company_id = 'a0400000-0000-0000-0000-000000000001' and name = 'CASHIER'),
    branch_id = 'a0400000-0000-0000-0000-000000000011', status = 'ACTIVE'
    where id = 'a0400000-0000-0000-0000-000000000021';
  update public.staff set role_id = (select id from public.roles
    where company_id = 'a0400000-0000-0000-0000-000000000001' and name = 'CASHIER'), active = true
    where id = 'a0400000-0000-0000-0000-000000000031';
  update public.pos_terminals set branch_id = 'a0400000-0000-0000-0000-000000000011',
    company_id = 'a0400000-0000-0000-0000-000000000001', status = 'ACTIVE',
    registration_status = 'REGISTERED', auth_user_id = device_id,
    access_mode = 'ALL_BRANCH_STAFF', device_identifier = proof
    where id = 'a0400000-0000-0000-0000-000000000041';
  update public.staff_pin_credentials_v2 set pin_hash = extensions.crypt(pin, extensions.gen_salt('bf'))
    where staff_id = 'a0400000-0000-0000-0000-000000000031';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', device_id,
    'role', 'authenticated', 'session_id', auth_session)::text, true);
  perform set_config('request.jwt.claim.sub', device_id::text, true);
  perform set_config('request.headers', jsonb_build_object('x-pos-device-credential', proof)::text, true);
  result := public.login_terminal_staff('a0400000-0000-0000-0000-000000000031', pin);
  if result->>'ok' <> 'true' then raise exception 'Cashier fixture login failed'; end if;
  insert into public.categories(name, company_id, branch_id)
    values('Takeaway QA', 'a0400000-0000-0000-0000-000000000001', 'a0400000-0000-0000-0000-000000000011')
    returning id into category_id;
  insert into public.products(category_id, company_id, branch_id, product_name, sell_price, cost_price, status, is_available)
    values(category_id, 'a0400000-0000-0000-0000-000000000001', 'a0400000-0000-0000-0000-000000000011', 'QA meal', 12, 3, true, true);
end $$;

-- Run against a local database with an active cashier and one sellable branch
-- product. Open a shift inside this transaction if needed; all writes roll back.
do $$
declare
  s public.terminal_staff_sessions;
  t public.pos_terminals;
  p public.products;
  option_ids jsonb;
  proof text := gen_random_uuid()::text || gen_random_uuid()::text;
begin
  select session.* into strict s
  from public.terminal_staff_sessions session
  join public.staff staff on staff.id = session.staff_record_id
  join public.roles role on role.id = staff.role_id and role.name = 'CASHIER'
  where session.status = 'ACTIVE' and session.terminal_id = 'a0400000-0000-0000-0000-000000000041'
  limit 1;
  select * into strict t from public.pos_terminals where id = s.terminal_id;
  select product.* into strict p from public.products product
  join public.branch_products branch_product on branch_product.product_id = product.id
    and branch_product.branch_id = s.branch_id
  where product.company_id = s.company_id and product.status and product.is_available
    and branch_product.selling_enabled and branch_product.available and not branch_product.sold_out
    and public.branch_modifier_configuration_valid(product.id, s.branch_id)
  limit 1;
  select coalesce(jsonb_agg(option.id::text), '[]'::jsonb) into option_ids
  from public.product_option_groups option_group
  cross join lateral (
    select product_option.id from public.product_options product_option
    left join public.branch_product_options branch_option
      on branch_option.product_option_id = product_option.id and branch_option.branch_id = s.branch_id
    where product_option.option_group_id = option_group.id and product_option.is_available
      and coalesce(branch_option.available, true) and not coalesce(branch_option.sold_out, false)
    order by product_option.sort_order, product_option.id
    limit option_group.min_selection
  ) option
  where option_group.product_id = p.id and option_group.min_selection > 0;
  update public.terminal_device_assignments
  set credential_hash = encode(extensions.digest(proof, 'sha256'), 'hex')
  where assignment_id = s.device_assignment_id and status = 'ACTIVE';
  if not found then raise exception 'Active device assignment required'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', t.auth_user_id, 'role', 'authenticated', 'session_id', s.auth_session_id)::text, true);
  perform set_config('request.jwt.claim.sub', t.auth_user_id::text, true);
  perform set_config('request.headers', jsonb_build_object('x-pos-device-credential', proof)::text, true);
  if not exists(select 1 from public.cashier_shifts shift
    where shift.terminal_id = s.terminal_id and shift.status = 'OPEN') then
    perform public.open_cashier_shift(0);
  end if;
  perform set_config('app.test_product_id', p.id::text, true);
  perform set_config('app.test_option_ids', option_ids::text, true);
  perform set_config('app.test_staff_id', s.staff_id::text, true);
end $$;

set local role authenticated;
do $$
declare
  menu jsonb;
  draft jsonb;
  payment jsonb;
  replay jsonb;
  summary jsonb;
  ord public.orders;
  payment_key text := gen_random_uuid()::text;
begin
  menu := public.get_current_branch_menu(null, null, 100, 0, null);
  if not exists(select 1 from jsonb_array_elements(menu->'products') item
    where item->>'id' = current_setting('app.test_product_id')) then
    raise exception 'Branch product missing from POS menu';
  end if;
  draft := public.create_pos_draft('takeaway', null, gen_random_uuid()::text);
  perform public.replace_pos_draft_items((draft->>'id')::uuid, jsonb_build_array(
    jsonb_build_object('productId', current_setting('app.test_product_id'), 'quantity', 1,
      'optionIds', current_setting('app.test_option_ids')::jsonb,
      'serviceMode', 'TAKEAWAY', 'specialRequest', '')), 0);
  perform public.set_takeaway_packaging((draft->>'id')::uuid, array['PAPER_BAG', 'NAPKIN']);
  select * into strict ord from public.orders where id = (draft->>'id')::uuid;
  summary := public.get_pos_payment_summary(ord.id);
  if summary->>'paymentStatus' <> 'UNPAID'
    or (summary->>'remainingAmount')::numeric <> ord.total then
    raise exception 'Unpaid takeaway summary incorrect';
  end if;
  perform public.begin_pos_payment_attempt(ord.id, 'CASH', ord.total, ord.total, payment_key, null);
  payment := public.complete_pos_takeaway_payment_and_submit(
    ord.id, 'CASH', ord.total, payment_key, null, null, ord.total);
  perform public.resolve_pos_payment_attempt(payment_key, 'COMPLETED', null, null);
  replay := public.complete_pos_takeaway_payment_and_submit(
    ord.id, 'CASH', ord.total, payment_key, null, null, ord.total);
  if payment->'payment'->>'id' is distinct from replay->'payment'->>'id' then
    raise exception 'Payment retry created another payment';
  end if;
  summary := public.get_pos_payment_summary(ord.id);
  select * into strict ord from public.orders where id = ord.id;
  if ord.status <> 'COMPLETED' or ord.payment_status <> 'PAID'
    or summary->>'paymentStatus' <> 'PAID' or (summary->>'remainingAmount')::numeric <> 0 then
    raise exception 'Takeaway did not finish paid';
  end if;
  perform set_config('app.test_order_id', ord.id::text, true);
  raise notice 'VERIFIED PASS: cashier menu, takeaway draft, packaging, atomic payment and retry';
end $$;

reset role;
do $$
declare
  v_order_id uuid := current_setting('app.test_order_id')::uuid;
  v_staff_id uuid := current_setting('app.test_staff_id')::uuid;
begin
  if (select count(*) from public.payments where payments.order_id = v_order_id and status = 'PAID') <> 1
    or not exists(select 1 from public.payments
      where payments.order_id = v_order_id and status = 'PAID'
        and user_id = v_staff_id and confirmed_by = v_staff_id) then
    raise exception 'Cashier payment attribution or idempotency failed';
  end if;
  if not exists(select 1 from public.order_items
    where order_items.order_id = v_order_id and item_status = 'SUBMITTED' and service_mode = 'TAKEAWAY')
    or not exists(select 1 from public.order_item_batches where order_item_batches.order_id = v_order_id)
    or not exists(select 1 from public.receipts where receipts.order_id = v_order_id)
    or not exists(select 1 from public.payment_attempts where payment_attempts.order_id = v_order_id and status = 'COMPLETED') then
    raise exception 'Kitchen, receipt, or payment attempt connection missing';
  end if;
  if not exists(select 1 from public.order_status_history
    where order_status_history.order_id = v_order_id and new_status = 'COMPLETED' and changed_by = v_staff_id)
    or not exists(select 1 from public.audit_logs audit
      join public.payments payment on payment.id = audit.entity_id
      where payment.order_id = v_order_id and audit.action = 'PAYMENT_ACCEPTED') then
    raise exception 'Takeaway status or payment audit missing';
  end if;
  raise notice 'VERIFIED PASS: one payment, cashier attribution, kitchen batch, receipt and audit';
end $$;

\if :{?keep_takeaway_transaction}
\else
rollback;
\endif
