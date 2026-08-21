


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."append_pos_order_items"("p_order_id" "uuid", "p_items" "jsonb", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  current_user_id uuid := auth.uid();
  current_order public.orders%rowtype;
  current_payment public.payments%rowtype;
  existing_batch public.order_item_batches%rowtype;
  new_batch public.order_item_batches%rowtype;
  new_order_item public.order_items%rowtype;
  order_item jsonb;
  product_record public.products%rowtype;
  group_record record;
  selected_option_ids jsonb;
  selected_count integer;
  distinct_selected_count integer;
  group_selected_count integer;
  item_option_total numeric(12, 2);
  item_unit_price numeric(12, 2);
  added_subtotal numeric(12, 2) := 0;
  updated_subtotal numeric(12, 2);
  updated_tax numeric(12, 2);
  updated_service_charge numeric(12, 2);
  updated_total numeric(12, 2);
  normalized_idempotency_key text;
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0));

  select * into existing_batch from public.order_item_batches
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key;
  if found then
    if existing_batch.order_id <> p_order_id or existing_batch.request_items <> p_items then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    select * into current_order from public.orders where id = p_order_id;
    select * into current_payment from public.payments
      where order_id = p_order_id order by created_at desc limit 1;
    return jsonb_build_object(
      'id', current_order.id, 'order_number', current_order.order_number,
      'subtotal', current_order.subtotal, 'tax', current_order.tax,
      'service_charge', current_order.service_charge, 'discount', current_order.discount,
      'total', current_order.total, 'status', current_order.status,
      'payment_status', current_order.payment_status,
      'dining_mode', current_order.dining_mode,
      'table_id', current_order.restaurant_table_id,
      'payment_id', current_payment.id, 'created_at', current_order.created_at,
      'batch_id', existing_batch.id
    );
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.status not in ('DRAFT', 'CONFIRMED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if current_order.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;

  select * into current_payment from public.payments
  where order_id = p_order_id and status = 'PENDING'
  order by created_at desc limit 1 for update;
  if not found then raise exception 'PENDING_PAYMENT_NOT_FOUND'; end if;

  for order_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(order_item) <> 'object'
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
      or (order_item->>'quantity')::numeric not between 1 and 99
    then raise exception 'INVALID_ITEM_QUANTITY'; end if;

    select * into product_record from public.products
    where id::text = order_item->>'productId' and status = true and is_available = true;
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;

    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(selected_option_ids) <> 'array' then raise exception 'INVALID_OPTION_IDS'; end if;
    select count(*), count(distinct selected.id), coalesce(sum(po.price_adjustment), 0)
    into selected_count, distinct_selected_count, item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id and po.is_available = true
    join public.product_option_groups pog on pog.id = po.option_group_id
      and pog.product_id = product_record.id;
    if selected_count <> jsonb_array_length(selected_option_ids)
      or distinct_selected_count <> selected_count
    then raise exception 'INVALID_OR_DUPLICATE_OPTIONS'; end if;

    for group_record in select * from public.product_option_groups
      where product_id = product_record.id
    loop
      select count(*) into group_selected_count
      from jsonb_array_elements_text(selected_option_ids) selected(id)
      join public.product_options po on po.id::text = selected.id
      where po.option_group_id = group_record.id;
      if group_selected_count < group_record.min_selection
        or group_selected_count > group_record.max_selection
        or (group_record.is_required and group_selected_count = 0)
      then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    added_subtotal := added_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  insert into public.order_item_batches (order_id, user_id, idempotency_key, request_items)
  values (p_order_id, current_user_id, normalized_idempotency_key, p_items)
  returning * into new_batch;

  for order_item in select value from jsonb_array_elements(p_items) loop
    select * into product_record from public.products where id::text = order_item->>'productId';
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    select coalesce(sum(po.price_adjustment), 0) into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    insert into public.order_items (
      order_id, product_id, quantity, unit_price, subtotal,
      product_name_snapshot, special_request, batch_id, sent_at
    ) values (
      p_order_id, product_record.id, (order_item->>'quantity')::integer,
      item_unit_price, round(item_unit_price * (order_item->>'quantity')::integer, 2),
      product_record.product_name, nullif(left(order_item->>'specialRequest', 1000), ''),
      new_batch.id, now()
    ) returning * into new_order_item;
    insert into public.order_item_options (
      order_item_id, option_group_name, option_name, price_adjustment
    ) select new_order_item.id, pog.name, po.name, po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  updated_subtotal := round(current_order.subtotal + added_subtotal, 2);
  updated_tax := round(updated_subtotal * 0.06, 2);
  updated_service_charge := round(updated_subtotal * 0.10, 2);
  updated_total := round(updated_subtotal - current_order.discount + updated_tax + updated_service_charge, 2);

  perform set_config('app.status_change_notes', 'Add-on items sent to kitchen', true);
  update public.orders set
    subtotal = updated_subtotal,
    tax = updated_tax,
    service_charge = updated_service_charge,
    total = updated_total,
    status = 'CONFIRMED'
  where id = p_order_id
  returning * into current_order;

  update public.payments set amount = updated_total
  where id = current_payment.id and status = 'PENDING'
  returning * into current_payment;

  return jsonb_build_object(
    'id', current_order.id, 'order_number', current_order.order_number,
    'subtotal', current_order.subtotal, 'tax', current_order.tax,
    'service_charge', current_order.service_charge, 'discount', current_order.discount,
    'total', current_order.total, 'status', current_order.status,
    'payment_status', current_order.payment_status,
    'dining_mode', current_order.dining_mode,
    'table_id', current_order.restaurant_table_id,
    'payment_id', current_payment.id, 'created_at', current_order.created_at,
    'batch_id', new_batch.id
  );
end;
$_$;


ALTER FUNCTION "public"."append_pos_order_items"("p_order_id" "uuid", "p_items" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_pos_kitchen_batch_no"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.batch_no is null then
    perform 1 from public.orders where id = new.order_id for update;
    select coalesce(max(batch_no), 0) + 1 into new.batch_no
    from public.order_item_batches
    where order_id = new.order_id;
  end if;
  new.status := coalesce(new.status, 'PENDING');
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_pos_kitchen_batch_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_pos_master_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  next_value bigint;
begin
  if tg_table_name = 'categories' then
    next_value := nextval('public.pos_category_code_seq');
    if next_value > 9999 then raise exception 'CATEGORY_CODE_EXHAUSTED'; end if;
    new.category_code := 'CAT-' || lpad(next_value::text, 4, '0');
  elsif tg_table_name = 'products' then
    next_value := nextval('public.pos_product_code_seq');
    if next_value > 999999 then raise exception 'PRODUCT_CODE_EXHAUSTED'; end if;
    new.product_code := 'PRD-' || lpad(next_value::text, 6, '0');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_pos_master_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_pos_transaction_number"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'orders' then
    -- Existing RPCs pass a legacy placeholder; the database is authoritative.
    new.order_number := public.next_pos_business_number('ORD');
  elsif tg_table_name = 'order_item_batches' then
    new.batch_number := public.next_pos_business_number('KB');
  elsif tg_table_name = 'payments' then
    new.payment_number := public.next_pos_business_number('PAY');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."assign_pos_transaction_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_read_pos_order"("p_order_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select case public.current_pos_role()
    when 'ADMIN' then true
    when 'MANAGER' then true
    when 'WAITER' then true
    when 'CASHIER' then true
    when 'KITCHEN' then exists (
      select 1
      from public.orders pos_order
      where pos_order.id = p_order_id
        and (
          pos_order.status in ('CONFIRMED', 'PREPARING', 'READY')
          or exists (
            select 1 from public.order_items item
            where item.order_id = pos_order.id
              and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
          )
        )
    )
    else false
  end
$$;


ALTER FUNCTION "public"."can_read_pos_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text" DEFAULT NULL::"text", "p_transaction_reference" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_id uuid := auth.uid();
  staff_role text;
  ord public.orders%rowtype;
  pay public.payments%rowtype;
  existing_payment public.payments%rowtype;
  normalized_method text := upper(btrim(coalesce(p_payment_method, '')));
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  normalized_amount numeric(12, 2);
  fingerprint text;
begin
  if caller_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select role_name into staff_role from public.profiles where id = caller_id and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;

  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_final_amount is null or p_final_amount < 0 then raise exception 'INVALID_FINAL_AMOUNT'; end if;
  normalized_amount := round(p_final_amount, 2);
  fingerprint := md5(p_order_id::text || '|' || normalized_method || '|' || normalized_amount::text);

  perform pg_advisory_xact_lock(hashtextextended('payment:' || normalized_key, 0));
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into existing_payment from public.payments where idempotency_key = normalized_key for update;
  if found then
    if existing_payment.order_id <> p_order_id or existing_payment.request_fingerprint is distinct from fingerprint
    then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    if existing_payment.status = 'PAID' then
      return jsonb_build_object('payment', row_to_json(existing_payment), 'order', row_to_json(ord), 'replayed', true);
    end if;
  end if;

  if ord.payment_status = 'PAID' or exists (
    select 1 from public.payments where order_id = ord.id and status = 'PAID'
  ) then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_PAYABLE'; end if;
  if exists (select 1 from public.order_items where order_id = ord.id and item_status = 'DRAFT')
  then raise exception 'ORDER_HAS_UNSENT_ITEMS'; end if;
  if normalized_amount <> round(coalesce(ord.total, 0), 2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  if ord.dining_mode = 'dine-in' then
    perform 1 from public.restaurant_tables where id = ord.restaurant_table_id and is_active for update;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  end if;

  update public.payments set status = 'CANCELLED', updated_at = now()
  where order_id = ord.id and status in ('PENDING', 'PROCESSING', 'FAILED');

  insert into public.payments (
    order_id, user_id, payment_method, amount, reference,
    transaction_reference, provider, status, paid_at,
    idempotency_key, request_fingerprint
  ) values (
    ord.id, caller_id, normalized_method, normalized_amount, ord.order_number,
    left(nullif(btrim(p_transaction_reference), ''), 150),
    left(coalesce(nullif(btrim(p_provider), ''), 'POS_TERMINAL'), 50),
    'PAID', now(), normalized_key, fingerprint
  ) returning * into pay;

  perform set_config('app.status_change_notes', 'Payment completed; kitchen rounds continue independently', true);
  update public.orders set payment_status = 'PAID', status = 'COMPLETED'
  where id = ord.id returning * into ord;

  return jsonb_build_object('payment', row_to_json(pay), 'order', row_to_json(ord), 'replayed', false);
end;
$$;


ALTER FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_method text := upper(btrim(coalesce(p_payment_method, '')));
  normalized_received numeric(12, 2);
  calculated_change numeric(12, 2);
  result jsonb;
  paid_payment public.payments%rowtype;
begin
  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method = 'CASH' then
    if p_received_amount is null or p_received_amount < p_final_amount then
      raise exception 'INSUFFICIENT_CASH_RECEIVED';
    end if;
    normalized_received := round(p_received_amount, 2);
    calculated_change := round(normalized_received - round(p_final_amount, 2), 2);
  else
    normalized_received := round(p_final_amount, 2);
    calculated_change := 0;
  end if;

  result := public.complete_payment(
    p_order_id,
    normalized_method,
    p_final_amount,
    p_idempotency_key,
    p_provider,
    p_transaction_reference
  );

  select * into paid_payment
  from public.payments
  where id = (result->'payment'->>'id')::uuid
  for update;

  if paid_payment.received_amount is not null
    and (paid_payment.received_amount <> normalized_received
      or paid_payment.change_amount <> calculated_change)
  then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_TENDER';
  end if;

  update public.payments
  set received_amount = normalized_received,
      change_amount = calculated_change
  where id = paid_payment.id
  returning * into paid_payment;

  return jsonb_set(result, '{payment}', to_jsonb(paid_payment), true);
end;
$$;


ALTER FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_pos_bill_payment"("p_bill_id" "uuid", "p_payments" "jsonb", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_id uuid := auth.uid();
  role_name text;
  bill public.order_bills%rowtype;
  payment jsonb;
  method text;
  amount numeric(12,2);
  received numeric(12,2);
  paid numeric(12,2) := 0;
  remaining numeric(12,2);
  order_paid boolean;
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 96), '');
  fingerprint text;
  payment_index integer := 0;
  replay_fingerprint text;
begin
  select p.role_name into role_name from public.profiles p
  where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'PAYMENTS_REQUIRED';
  end if;

  fingerprint := md5(p_bill_id::text || '|' || p_payments::text);
  perform pg_advisory_xact_lock(hashtextextended('bill-payment:' || normalized_key, 0));
  select * into bill from public.order_bills where id = p_bill_id for update;
  if not found then raise exception 'BILL_NOT_FOUND'; end if;

  select request_fingerprint into replay_fingerprint
  from public.payments
  where bill_id = bill.id and idempotency_key like normalized_key || ':%'
  order by created_at limit 1;
  if replay_fingerprint is not null then
    if replay_fingerprint <> fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return jsonb_build_object(
      'billId', bill.id, 'paidAmount', bill.paid_amount,
      'remainingAmount', round(bill.total - bill.paid_amount, 2),
      'orderPaid', bill.status = 'PAID' and not exists (
        select 1 from public.order_bills where order_id = bill.order_id and status <> 'PAID'
      ), 'replayed', true
    );
  end if;
  if bill.status = 'PAID' then raise exception 'BILL_ALREADY_PAID'; end if;

  for payment in select * from jsonb_array_elements(p_payments) loop
    payment_index := payment_index + 1;
    method := upper(coalesce(payment->>'method',''));
    begin
      amount := round((payment->>'amount')::numeric, 2);
      received := round(coalesce((payment->>'receivedAmount')::numeric, amount), 2);
    exception when others then raise exception 'INVALID_PAYMENT';
    end;
    if method <> 'CASH' or amount <= 0 then raise exception 'INVALID_PAYMENT'; end if;
    if received < amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
    if paid + amount > round(bill.total - bill.paid_amount, 2) then
      raise exception 'PAYMENT_EXCEEDS_BALANCE';
    end if;
    paid := paid + amount;
    insert into public.payments(
      order_id, bill_id, user_id, payment_method, amount, received_amount,
      change_amount, reference, status, paid_at, idempotency_key, request_fingerprint
    ) values (
      bill.order_id, bill.id, caller_id, method, amount, received,
      received - amount, 'BILL-' || bill.id::text, 'PAID', now(),
      normalized_key || ':' || payment_index::text, fingerprint
    );
  end loop;

  remaining := round(bill.total - bill.paid_amount - paid, 2);
  update public.order_bills
  set paid_amount = paid_amount + paid,
      status = case when remaining = 0 then 'PAID' else 'OPEN' end,
      paid_at = case when remaining = 0 then now() else null end
  where id = bill.id
  returning * into bill;

  select not exists(
    select 1 from public.order_bills where order_id = bill.order_id and status <> 'PAID'
  ) into order_paid;
  return jsonb_build_object(
    'billId', bill.id, 'paidAmount', bill.paid_amount,
    'remainingAmount', remaining, 'orderPaid', order_paid, 'replayed', false
  );
end;
$$;


ALTER FUNCTION "public"."complete_pos_bill_payment"("p_bill_id" "uuid", "p_payments" "jsonb", "p_idempotency_key" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."restaurant_tables" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_number" character varying(20) NOT NULL,
    "table_name" character varying(100),
    "capacity" integer NOT NULL,
    "status" character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    "area" character varying(100) DEFAULT 'Indoor'::character varying NOT NULL,
    "qr_code" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "restaurant_tables_capacity_check" CHECK ((("capacity" > 0) AND ("capacity" <= 100))),
    CONSTRAINT "restaurant_tables_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['AVAILABLE'::character varying, 'OCCUPIED'::character varying, 'RESERVED'::character varying, 'CLEANING'::character varying, 'DISABLED'::character varying])::"text"[])))
);

ALTER TABLE ONLY "public"."restaurant_tables" REPLICA IDENTITY FULL;


ALTER TABLE "public"."restaurant_tables" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text" DEFAULT NULL::"text") RETURNS "public"."restaurant_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'AVAILABLE' then return current_table; end if;
  if current_table.status <> 'CLEANING' then raise exception 'INVALID_TABLE_TRANSITION'; end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_table_id
      and payment_status in ('UNPAID', 'PARTIALLY_PAID')
      and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  if exists (
    select 1 from public.orders ord join public.order_items item on item.order_id = ord.id
    where ord.restaurant_table_id = p_table_id and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
  ) then raise exception 'KITCHEN_ITEMS_NOT_FULFILLED'; end if;
  update public.restaurant_tables set status = 'AVAILABLE', is_active = true where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(p_table_id, null, 'CLEANING_COMPLETED', 'CLEANING', 'AVAILABLE', p_operation_key, '{}'::jsonb);
  return updated_table;
end;
$$;


ALTER FUNCTION "public"."complete_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_takeaway_payment_and_submit"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 110), '');
begin
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if exists (
    select 1 from public.payments where idempotency_key = normalized_key and order_id = p_order_id and status = 'PAID'
  ) then
    return public.complete_payment(
      p_order_id, p_payment_method, p_final_amount, normalized_key,
      p_provider, p_transaction_reference, p_received_amount
    );
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.dining_mode <> 'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
  if ord.status <> 'DRAFT' or ord.payment_status <> 'UNPAID' then raise exception 'ORDER_NOT_PAYABLE'; end if;

  perform public.submit_pos_order(p_order_id, normalized_key || ':submit');
  select * into ord from public.orders where id = p_order_id;
  if round(coalesce(ord.total, 0), 2) <> round(coalesce(p_final_amount, -1), 2)
  then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  return public.complete_payment(
    p_order_id, p_payment_method, p_final_amount, normalized_key,
    p_provider, p_transaction_reference, p_received_amount
  );
end;
$$;


ALTER FUNCTION "public"."complete_takeaway_payment_and_submit"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_pos_payment"("p_payment_id" "uuid", "p_provider" "text", "p_transaction_reference" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare pay public.payments%rowtype; ord public.orders%rowtype; role text;
begin
  select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE';
  if coalesce(role,'') not in ('ADMIN','MANAGER','WAITER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into pay from public.payments where id=p_payment_id for update; if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into ord from public.orders where id=pay.order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if pay.status='PAID' then return jsonb_build_object('payment',row_to_json(pay),'order',row_to_json(ord)); end if;
  if pay.status not in ('PENDING','PROCESSING','FAILED') or ord.status in ('DRAFT','CANCELLED','REFUNDED') then raise exception 'PAYMENT_NOT_ALLOWED'; end if;
  if ord.status not in ('SERVED','SERVED') then raise exception 'ORDER_NOT_FULFILLED'; end if;
  if round(pay.amount,2)<>round(ord.total,2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if exists(select 1 from public.payments where order_id=ord.id and id<>pay.id and status='PAID') then raise exception 'PAYMENT_ALREADY_CONFIRMED'; end if;
  update public.payments set status='PAID',provider=left(nullif(btrim(p_provider),''),50),transaction_reference=left(nullif(btrim(p_transaction_reference),''),150),paid_at=now() where id=pay.id returning * into pay;
  update public.orders set payment_status='PAID',status=case when status in ('SERVED','SERVED') then 'COMPLETED' else status end where id=ord.id returning * into ord;
  return jsonb_build_object('payment',row_to_json(pay),'order',row_to_json(ord));
end;
$$;


ALTER FUNCTION "public"."confirm_pos_payment"("p_payment_id" "uuid", "p_provider" "text", "p_transaction_reference" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pos_bill_split"("p_order_id" "uuid", "p_mode" "text", "p_bill_count" integer DEFAULT NULL::integer, "p_assignments" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_id uuid := auth.uid();
  role_name text;
  ord public.orders%rowtype;
  item record;
  bill_id uuid;
  item_total numeric(12,2);
  bill_total numeric(12,2);
  total_cents bigint;
  remaining_cents bigint;
  count_bills integer := coalesce(p_bill_count, 0);
  normalized_mode text := upper(trim(coalesce(p_mode, '')));
  assignment jsonb;
  assigned_ids uuid[] := '{}'::uuid[];
begin
  select p.role_name into role_name from public.profiles p where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_mode not in ('EQUAL', 'ITEM') then raise exception 'INVALID_SPLIT_MODE'; end if;
  if normalized_mode = 'EQUAL' and (count_bills < 2 or count_bills > 10) then raise exception 'BILL_COUNT_MUST_BE_2_TO_10'; end if;
  if normalized_mode = 'ITEM' and (jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) < 2 or jsonb_array_length(p_assignments) > 10) then raise exception 'INVALID_BILL_ASSIGNMENTS'; end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status in ('PAID', 'PARTIALLY_PAID') or exists (select 1 from public.order_bills where order_id = ord.id) then raise exception 'ORDER_ALREADY_SPLIT_OR_PAID'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_PAYABLE'; end if;

  total_cents := round(ord.total * 100);
  if normalized_mode = 'EQUAL' then
    remaining_cents := total_cents;
    for i in 1..count_bills loop
      bill_total := case when i = count_bills then remaining_cents / 100.0 else floor(total_cents / count_bills) / 100.0 end;
      remaining_cents := remaining_cents - round(bill_total * 100);
      insert into public.order_bills(order_id, bill_number, total, created_by) values (ord.id, i, bill_total, caller_id) returning id into bill_id;
    end loop;
  else
    for i in 0..jsonb_array_length(p_assignments)-1 loop
      assignment := p_assignments->i;
      if jsonb_typeof(assignment->'itemIds') <> 'array' or jsonb_array_length(assignment->'itemIds') = 0 then raise exception 'BILL_MUST_HAVE_ITEMS'; end if;
      item_total := 0;
      for item in select oi.id, oi.subtotal from public.order_items oi where oi.order_id = ord.id and oi.id = any(array(select jsonb_array_elements_text(assignment->'itemIds')::uuid)) loop
        if item.id = any(assigned_ids) then raise exception 'ORDER_ITEM_ASSIGNED_TWICE'; end if;
        assigned_ids := array_append(assigned_ids, item.id);
        item_total := item_total + item.subtotal;
      end loop;
      if item_total = 0 then raise exception 'BILL_ITEMS_NOT_FOUND'; end if;
      insert into public.order_bills(order_id, bill_number, total, created_by) values (ord.id, i + 1, case when i = jsonb_array_length(p_assignments)-1 then ord.total - coalesce((select sum(total) from public.order_bills where order_id=ord.id),0) else item_total end, caller_id) returning id into bill_id;
      insert into public.order_bill_items(bill_id, order_item_id) select bill_id, value::uuid from jsonb_array_elements_text(assignment->'itemIds');
    end loop;
    if cardinality(assigned_ids) <> (select count(*) from public.order_items where order_id = ord.id and item_status <> 'VOIDED') then raise exception 'EVERY_ITEM_MUST_BE_ASSIGNED'; end if;
  end if;

  update public.orders set payment_status = 'PARTIALLY_PAID' where id = ord.id;
  return jsonb_build_object('orderId', ord.id, 'bills', (select jsonb_agg(jsonb_build_object('id', b.id, 'billNumber', b.bill_number, 'total', b.total, 'paidAmount', b.paid_amount, 'status', b.status) order by b.bill_number) from public.order_bills b where b.order_id = ord.id));
end;
$$;


ALTER FUNCTION "public"."create_pos_bill_split"("p_order_id" "uuid", "p_mode" "text", "p_bill_count" integer, "p_assignments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pos_draft"("p_dining_mode" "text", "p_table_id" "uuid" DEFAULT NULL::"uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid := auth.uid(); key text; existing public.orders%rowtype;
  new_order public.orders%rowtype; new_payment public.payments%rowtype; number_value text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id=uid and status='ACTIVE' and role_name in ('ADMIN','MANAGER','WAITER','CASHIER'))
    then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_dining_mode not in ('dine-in','takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if (p_dining_mode='dine-in' and p_table_id is null) or (p_dining_mode='takeaway' and p_table_id is not null)
    then raise exception 'INVALID_TABLE_ID'; end if;
  key := nullif(left(btrim(coalesce(p_idempotency_key,'')),128),'');
  if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || key, 0));
  select * into existing from public.orders where user_id=uid and idempotency_key=key;
  if found then
    if existing.dining_mode <> p_dining_mode or existing.restaurant_table_id is distinct from p_table_id
      then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    return jsonb_build_object('id',existing.id,'payment_id',(select id from public.payments where order_id=existing.id order by created_at desc limit 1));
  end if;
  if p_table_id is not null then
    perform 1 from public.restaurant_tables where id=p_table_id and is_active and status in ('AVAILABLE','RESERVED','OCCUPIED') for update;
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.orders where restaurant_table_id=p_table_id and payment_status in ('UNPAID','PARTIALLY_PAID') and status in ('DRAFT','CONFIRMED','PREPARING','READY','SERVED'))
      then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  end if;
  number_value := 'POS-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || upper(substr(md5(random()::text),1,8));
  perform set_config('app.order_idempotency_fingerprint', md5(p_dining_mode || '|' || coalesce(p_table_id::text,'')), true);
  insert into public.orders(order_number,user_id,subtotal,discount,tax,service_charge,total,status,payment_status,dining_mode,table_id,restaurant_table_id,idempotency_key)
  values(number_value,uid,0,0,0,0,0,'DRAFT','PENDING',p_dining_mode,p_table_id::text,p_table_id,key) returning * into new_order;
  insert into public.payments(order_id,user_id,payment_method,amount,reference,status,paid_at)
  values(new_order.id,uid,'CASH',0,number_value,'PENDING',null) returning * into new_payment;
  return jsonb_build_object('id',new_order.id,'payment_id',new_payment.id);
end;
$$;


ALTER FUNCTION "public"."create_pos_draft"("p_dining_mode" "text", "p_table_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pos_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO 'public'
    AS $$
  select public.place_order(
    p_items,
    p_payment_method,
    p_dining_mode,
    p_table_id,
    p_idempotency_key
  );
$$;


ALTER FUNCTION "public"."create_pos_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_pos_order_unbound"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  current_user_id uuid := auth.uid();
  existing_order public.orders%rowtype;
  existing_payment public.payments%rowtype;
  new_order public.orders%rowtype;
  new_order_item public.order_items%rowtype;
  new_payment public.payments%rowtype;
  order_item jsonb;
  product_record public.products%rowtype;
  group_record record;
  selected_option_ids jsonb;
  selected_count integer;
  distinct_selected_count integer;
  group_selected_count integer;
  item_option_total numeric(12, 2);
  item_unit_price numeric(12, 2);
  order_subtotal numeric(12, 2) := 0;
  order_tax numeric(12, 2);
  order_service_charge numeric(12, 2);
  order_discount numeric(12, 2) := 0;
  order_total numeric(12, 2);
  selected_table_id uuid;
  order_number_value text;
  normalized_idempotency_key text;
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;
  p_payment_method := upper(p_payment_method);
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'UNSUPPORTED_PAYMENT_METHOD';
  end if;
  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'INVALID_DINING_MODE'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0));

  select * into existing_order from public.orders
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key limit 1;
  if found then
    select * into existing_payment from public.payments
    where order_id = existing_order.id order by created_at desc limit 1;
    return jsonb_build_object(
      'id', existing_order.id, 'order_number', existing_order.order_number,
      'subtotal', existing_order.subtotal, 'tax', existing_order.tax,
      'service_charge', existing_order.service_charge, 'discount', existing_order.discount,
      'total', existing_order.total, 'status', existing_order.status,
      'payment_status', existing_order.payment_status,
      'dining_mode', existing_order.dining_mode,
      'table_id', existing_order.restaurant_table_id,
      'payment_id', existing_payment.id, 'created_at', existing_order.created_at
    );
  end if;

  if p_dining_mode = 'dine-in' then
    begin selected_table_id := p_table_id::uuid;
    exception when invalid_text_representation then raise exception 'INVALID_TABLE_ID'; end;
    perform 1 from public.restaurant_tables
    where id = selected_table_id and is_active = true
      and status in ('AVAILABLE', 'RESERVED', 'OCCUPIED') for update;
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists (
      select 1 from public.orders where restaurant_table_id = selected_table_id
        and payment_status in ('UNPAID', 'PARTIALLY_PAID') and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
    ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  end if;

  for order_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(order_item) <> 'object'
      or coalesce(order_item->>'quantity', '') !~ '^[0-9]+$'
      or (order_item->>'quantity')::numeric not between 1 and 99
    then raise exception 'INVALID_ITEM_QUANTITY'; end if;
    select * into product_record from public.products
    where id::text = order_item->>'productId' and status = true and is_available = true;
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    if jsonb_typeof(selected_option_ids) <> 'array' then raise exception 'INVALID_OPTION_IDS'; end if;

    select count(*), count(distinct selected.id), coalesce(sum(po.price_adjustment), 0)
    into selected_count, distinct_selected_count, item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id and po.is_available = true
    join public.product_option_groups pog on pog.id = po.option_group_id
      and pog.product_id = product_record.id;
    if selected_count <> jsonb_array_length(selected_option_ids)
      or distinct_selected_count <> selected_count
    then raise exception 'INVALID_OR_DUPLICATE_OPTIONS'; end if;

    for group_record in select * from public.product_option_groups
      where product_id = product_record.id
    loop
      select count(*) into group_selected_count
      from jsonb_array_elements_text(selected_option_ids) selected(id)
      join public.product_options po on po.id::text = selected.id
      where po.option_group_id = group_record.id;
      if group_selected_count < group_record.min_selection
        or group_selected_count > group_record.max_selection
        or (group_record.is_required and group_selected_count = 0)
      then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    order_subtotal := order_subtotal + item_unit_price * (order_item->>'quantity')::integer;
  end loop;

  order_subtotal := round(order_subtotal, 2);
  order_tax := round(order_subtotal * 0.06, 2);
  order_service_charge := round(order_subtotal * 0.10, 2);
  order_total := round(order_subtotal - order_discount + order_tax + order_service_charge, 2);
  order_number_value := 'POS-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS')
    || '-' || upper(substr(md5(random()::text), 1, 8));

  insert into public.orders (
    order_number, user_id, subtotal, discount, tax, service_charge, total,
    status, payment_status, dining_mode, table_id, restaurant_table_id, idempotency_key
  ) values (
    order_number_value, current_user_id, order_subtotal, order_discount,
    order_tax, order_service_charge, order_total, 'CONFIRMED', 'PENDING', p_dining_mode,
    case when selected_table_id is null then null else selected_table_id::text end,
    selected_table_id, normalized_idempotency_key
  ) returning * into new_order;

  for order_item in select value from jsonb_array_elements(p_items) loop
    select * into product_record from public.products where id::text = order_item->>'productId';
    selected_option_ids := coalesce(order_item->'optionIds', '[]'::jsonb);
    select coalesce(sum(po.price_adjustment), 0) into item_option_total
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id;
    item_unit_price := round(product_record.sell_price + item_option_total, 2);
    insert into public.order_items (
      order_id, product_id, quantity, unit_price, subtotal,
      product_name_snapshot, special_request
    ) values (
      new_order.id, product_record.id, (order_item->>'quantity')::integer,
      item_unit_price, round(item_unit_price * (order_item->>'quantity')::integer, 2),
      product_record.product_name, nullif(left(order_item->>'specialRequest', 1000), '')
    ) returning * into new_order_item;
    insert into public.order_item_options (
      order_item_id, option_group_name, option_name, price_adjustment
    ) select new_order_item.id, pog.name, po.name, po.price_adjustment
    from jsonb_array_elements_text(selected_option_ids) selected(id)
    join public.product_options po on po.id::text = selected.id
    join public.product_option_groups pog on pog.id = po.option_group_id;
  end loop;

  insert into public.payments (
    order_id, user_id, payment_method, amount, reference,
    transaction_reference, provider, status, paid_at
  ) values (
    new_order.id, current_user_id, p_payment_method, new_order.total,
    order_number_value, null, null, 'PENDING', null
  ) returning * into new_payment;

  return jsonb_build_object(
    'id', new_order.id, 'order_number', new_order.order_number,
    'subtotal', new_order.subtotal, 'tax', new_order.tax,
    'service_charge', new_order.service_charge, 'discount', new_order.discount,
    'total', new_order.total, 'status', new_order.status,
    'payment_status', new_order.payment_status,
    'dining_mode', new_order.dining_mode,
    'table_id', new_order.restaurant_table_id,
    'payment_id', new_payment.id, 'created_at', new_order.created_at
  );
end;
$_$;


ALTER FUNCTION "public"."create_pos_order_unbound"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_pos_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.role_name
  from public.profiles p
  where p.id = auth.uid()
    and p.status = 'ACTIVE'
  limit 1
$$;


ALTER FUNCTION "public"."current_pos_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_paid_payment_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null
    and new.status = 'PAID'
    and public.current_pos_role() not in ('ADMIN', 'MANAGER', 'CASHIER')
  then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_paid_payment_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_takeaway_order_item_service_mode"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and dining_mode = 'takeaway'
  ) then
    new.service_mode := 'TAKEAWAY';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_takeaway_order_item_service_mode"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "request_items" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "batch_no" integer NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ready_at" timestamp with time zone,
    "served_at" timestamp with time zone,
    "batch_number" character varying(32) NOT NULL,
    CONSTRAINT "order_item_batches_batch_no_check" CHECK (("batch_no" > 0)),
    CONSTRAINT "order_item_batches_batch_number_format_check" CHECK ((("batch_number")::"text" ~ '^KB-[0-9]{8}-[0-9]{6}$'::"text")),
    CONSTRAINT "order_item_batches_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PREPARING'::"text", 'READY'::"text", 'SERVED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."order_item_batches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."order_item_batches"."batch_number" IS 'Staff-facing kitchen batch identifier.';



CREATE OR REPLACE FUNCTION "public"."ensure_initial_pos_kitchen_batch"("p_order_id" "uuid", "p_user_id" "uuid") RETURNS "public"."order_item_batches"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  result public.order_item_batches%rowtype;
begin
  perform 1 from public.orders where id = p_order_id for update;
  select * into result from public.order_item_batches
  where order_id = p_order_id order by batch_no limit 1;
  if found then return result; end if;

  if not exists (
    select 1 from public.order_items
    where order_id = p_order_id and batch_id is null and item_status not in ('DRAFT', 'VOIDED')
  ) then raise exception 'NO_SUBMITTED_ITEMS'; end if;

  insert into public.order_item_batches (
    order_id, user_id, idempotency_key, request_items, status
  )
  select p_order_id, p_user_id, 'initial-' || p_order_id::text,
    jsonb_agg(jsonb_build_object('orderItemId', id) order by created_at), 'PENDING'
  from public.order_items
  where order_id = p_order_id and batch_id is null and item_status not in ('DRAFT', 'VOIDED')
  returning * into result;

  update public.order_items
  set batch_id = result.id,
      sent_at = coalesce(sent_at, result.created_at),
      item_status = case when item_status = 'DRAFT' then 'SUBMITTED' else item_status end
  where order_id = p_order_id and batch_id is null and item_status <> 'VOIDED';
  return result;
end;
$$;


ALTER FUNCTION "public"."ensure_initial_pos_kitchen_batch"("p_order_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_number" character varying(50) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "discount" numeric(10,2) DEFAULT 0 NOT NULL,
    "tax" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" character varying(20) DEFAULT 'DRAFT'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "dining_mode" "text" DEFAULT 'takeaway'::"text" NOT NULL,
    "table_id" "text",
    "restaurant_table_id" "uuid",
    "payment_status" character varying(20) DEFAULT 'UNPAID'::character varying NOT NULL,
    "idempotency_key" "text",
    "service_charge" numeric(10,2) DEFAULT 0 NOT NULL,
    "idempotency_fingerprint" "text",
    "kitchen_started_at" timestamp with time zone,
    "takeaway_packaging" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "orders_dine_in_table_check" CHECK ((("dining_mode" <> 'dine-in'::"text") OR ("restaurant_table_id" IS NOT NULL))),
    CONSTRAINT "orders_dining_mode_check" CHECK (("dining_mode" = ANY (ARRAY['dine-in'::"text", 'takeaway'::"text"]))),
    CONSTRAINT "orders_discount_check" CHECK (("discount" >= (0)::numeric)),
    CONSTRAINT "orders_idempotency_fingerprint_length_check" CHECK ((("idempotency_fingerprint" IS NULL) OR ("char_length"("idempotency_fingerprint") = 32))),
    CONSTRAINT "orders_idempotency_key_length_check" CHECK ((("idempotency_key" IS NULL) OR (("char_length"("btrim"("idempotency_key")) >= 1) AND ("char_length"("btrim"("idempotency_key")) <= 128)))),
    CONSTRAINT "orders_payment_status_check" CHECK ((("payment_status")::"text" = ANY ((ARRAY['UNPAID'::character varying, 'PARTIALLY_PAID'::character varying, 'PAID'::character varying, 'REFUNDED'::character varying])::"text"[]))),
    CONSTRAINT "orders_service_charge_check" CHECK (("service_charge" >= (0)::numeric)),
    CONSTRAINT "orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['DRAFT'::character varying, 'CONFIRMED'::character varying, 'PREPARING'::character varying, 'READY'::character varying, 'SERVED'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::"text"[]))),
    CONSTRAINT "orders_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "orders_takeaway_packaging_allowed" CHECK (("takeaway_packaging" <@ ARRAY['CUP_LID'::"text", 'PAPER_BAG'::"text", 'TAKEAWAY_BOX'::"text", 'CUTLERY'::"text", 'STRAW'::"text", 'SAUCE'::"text", 'NAPKIN'::"text"])),
    CONSTRAINT "orders_takeaway_without_table_check" CHECK ((("dining_mode" <> 'takeaway'::"text") OR ("restaurant_table_id" IS NULL))),
    CONSTRAINT "orders_tax_check" CHECK (("tax" >= (0)::numeric)),
    CONSTRAINT "orders_total_check" CHECK (("total" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."orders" REPLICA IDENTITY FULL;


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."order_number" IS 'Staff-facing order identifier. UUID id remains the internal key.';



CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payment_method" character varying(30) NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "reference" character varying(100),
    "status" character varying(20) DEFAULT 'PENDING'::character varying,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "transaction_reference" character varying(150),
    "provider" character varying(50),
    "idempotency_key" "text",
    "request_fingerprint" "text",
    "received_amount" numeric(12,2),
    "change_amount" numeric(12,2),
    "payment_number" character varying(32) NOT NULL,
    "bill_id" "uuid",
    CONSTRAINT "payments_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payments_change_amount_check" CHECK ((("change_amount" IS NULL) OR ("change_amount" >= (0)::numeric))),
    CONSTRAINT "payments_idempotency_key_length_check" CHECK ((("idempotency_key" IS NULL) OR (("char_length"("btrim"("idempotency_key")) >= 1) AND ("char_length"("btrim"("idempotency_key")) <= 128)))),
    CONSTRAINT "payments_method_check" CHECK ((("payment_method")::"text" = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'QR'::character varying, 'EWALLET'::character varying])::"text"[]))),
    CONSTRAINT "payments_payment_number_format_check" CHECK ((("payment_number")::"text" ~ '^PAY-[0-9]{8}-[0-9]{6}$'::"text")),
    CONSTRAINT "payments_received_amount_check" CHECK ((("received_amount" IS NULL) OR ("received_amount" >= "amount"))),
    CONSTRAINT "payments_request_fingerprint_check" CHECK ((("request_fingerprint" IS NULL) OR ("char_length"("request_fingerprint") = 32))),
    CONSTRAINT "payments_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'PROCESSING'::character varying, 'PAID'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying, 'REFUNDED'::character varying])::"text"[])))
);

ALTER TABLE ONLY "public"."payments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payments"."payment_number" IS 'Staff-facing payment identifier.';



CREATE OR REPLACE VIEW "public"."daily_sales_report" WITH ("security_invoker"='true') AS
 SELECT (COALESCE("p"."paid_at", "p"."created_at"))::"date" AS "report_date",
    "p"."order_id",
    "o"."order_number",
    "o"."user_id",
    "o"."status" AS "order_status",
    "o"."dining_mode",
    "o"."restaurant_table_id",
    "p"."id" AS "payment_id",
    "p"."payment_method",
    COALESCE("p"."provider", 'UNSPECIFIED'::character varying) AS "provider",
    "p"."transaction_reference",
    "round"("o"."subtotal", 2) AS "subtotal",
    "round"("o"."tax", 2) AS "tax",
    "round"("o"."discount", 2) AS "discount",
    "round"("p"."amount", 2) AS "amount_paid",
    "round"("o"."total", 2) AS "order_total",
    COALESCE("p"."paid_at", "p"."created_at") AS "paid_at",
    "round"("o"."service_charge", 2) AS "service_charge",
    "p"."payment_number"
   FROM ("public"."payments" "p"
     JOIN "public"."orders" "o" ON (("o"."id" = "p"."order_id")))
  WHERE ((("p"."status")::"text" = 'PAID'::"text") AND ("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text"])));


ALTER VIEW "public"."daily_sales_report" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_daily_sales_report"("p_date_from" "date" DEFAULT NULL::"date", "p_date_to" "date" DEFAULT NULL::"date") RETURNS SETOF "public"."daily_sales_report"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if public.current_pos_role() not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if p_date_from is not null and p_date_to is not null and p_date_from > p_date_to then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  return query
  select report.* from public.daily_sales_report report
  where (p_date_from is null or report.report_date >= p_date_from)
    and (p_date_to is null or report.report_date <= p_date_to)
  order by report.paid_at desc;
end;
$$;


ALTER FUNCTION "public"."get_daily_sales_report"("p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_active_pos_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and not public.is_active_pos_user() then
    raise exception 'An active staff profile is required';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_active_pos_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_order_idempotency_fingerprint"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.idempotency_key is not null then
    new.idempotency_fingerprint := nullif(current_setting('app.order_idempotency_fingerprint', true), '');
    if new.idempotency_fingerprint is null then
      raise exception 'IDEMPOTENCY_FINGERPRINT_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_order_idempotency_fingerprint"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_pos_order_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.payment_status = 'PARTIALLY_PAID'
     and exists (select 1 from public.order_bills where order_id = new.id)
     and not exists (
       select 1 from public.order_bills where order_id = new.id and paid_amount > 0
     ) then
    new.payment_status := 'UNPAID';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."guard_pos_order_payment_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_profile_privilege_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is not null and auth.uid() = old.id and (
    new.id is distinct from old.id
    or new.role_id is distinct from old.role_id
    or new.role_name is distinct from old.role_name
    or new.email is distinct from old.email
    or new.password_hash is distinct from old.password_hash
    or new.status is distinct from old.status
    or new.login_attempt is distinct from old.login_attempt
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Protected staff profile fields can only be changed by an administrator';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."guard_profile_privilege_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  default_role_id uuid;
  base_username text;
  final_username text;
  suffix integer := 1;
begin
  select id into default_role_id
  from public.roles
  where name = 'CASHIER'
  limit 1;

  if default_role_id is null then
    raise exception 'The CASHIER role must exist before creating users';
  end if;

  base_username := regexp_replace(
    lower(split_part(coalesce(new.email, 'user'), '@', 1)),
    '[^a-z0-9._-]',
    '',
    'g'
  );
  if base_username = '' then
    base_username := 'user';
  end if;

  final_username := base_username;
  while exists (
    select 1 from public.profiles
    where username = final_username and id <> new.id
  ) loop
    final_username := base_username || suffix::text;
    suffix := suffix + 1;
  end loop;

  insert into public.profiles (
    id,
    role_id,
    role_name,
    name,
    username,
    email,
    password_hash,
    status,
    login_attempt
  )
  values (
    new.id,
    default_role_id,
    'CASHIER',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, 'User'), '@', 1)
    ),
    final_username,
    new.email,
    'supabase_managed',
    'ACTIVE',
    0
  )
  on conflict (id) do update
  set name = excluded.name,
      email = excluded.email,
      updated_at = now();

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_pos_user"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ACTIVE'
  );
$$;


ALTER FUNCTION "public"."is_active_pos_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_paid_order_receipt"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  payment_actor uuid;
  successful_total numeric(12,2);
begin
  if new.payment_status <> 'PAID'
     or old.payment_status is not distinct from new.payment_status then
    return new;
  end if;

  select p.user_id, round(sum(p.amount), 2)
  into payment_actor, successful_total
  from public.payments p
  where p.order_id = new.id and p.status = 'PAID'
  group by p.user_id
  order by max(p.paid_at) desc
  limit 1;

  if payment_actor is null or coalesce(successful_total, 0) < round(new.total, 2) then
    raise exception 'PAID_ORDER_REQUIRES_SUCCESSFUL_PAYMENT';
  end if;

  insert into public.receipts (
    receipt_number, order_id, issued_by, subtotal, discount, tax,
    service_charge, total, paid_amount
  ) values (
    public.next_pos_business_number('RCP'), new.id, payment_actor,
    new.subtotal, new.discount, new.tax, new.service_charge, new.total,
    successful_total
  ) on conflict (order_id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."issue_paid_order_receipt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_table_activity"("p_table_id" "uuid", "p_order_id" "uuid", "p_action" "text", "p_from_status" "text", "p_to_status" "text", "p_operation_key" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.table_activity_logs (
    restaurant_table_id, order_id, action, from_status, to_status,
    performed_by, operation_key, metadata
  ) values (
    p_table_id, p_order_id, p_action, p_from_status, p_to_status,
    auth.uid(), nullif(left(btrim(coalesce(p_operation_key, '')), 128), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (performed_by, action, operation_key)
    where operation_key is not null
  do nothing;
end;
$$;


ALTER FUNCTION "public"."log_table_activity"("p_table_id" "uuid", "p_order_id" "uuid", "p_action" "text", "p_from_status" "text", "p_to_status" "text", "p_operation_key" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_pos_order"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."move_pos_order"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_pos_order_unbound"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  current_order public.orders%rowtype;
  source_table public.restaurant_tables%rowtype;
  destination_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.dining_mode <> 'dine-in' or current_order.restaurant_table_id is null then
    raise exception 'ORDER_HAS_NO_TABLE';
  end if;
  if current_order.status not in ('DRAFT', 'CONFIRMED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED') then
    raise exception 'ORDER_NOT_ACTIVE';
  end if;
  if current_order.restaurant_table_id = p_destination_table_id then
    return jsonb_build_object('order', row_to_json(current_order));
  end if;

  perform 1 from public.restaurant_tables
  where id in (current_order.restaurant_table_id, p_destination_table_id)
  order by id for update;

  select * into source_table from public.restaurant_tables
  where id = current_order.restaurant_table_id;
  select * into destination_table from public.restaurant_tables
  where id = p_destination_table_id;
  if destination_table.id is null then raise exception 'TABLE_NOT_FOUND'; end if;
  if not destination_table.is_active or destination_table.status not in ('AVAILABLE', 'RESERVED') then
    raise exception 'DESTINATION_TABLE_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_destination_table_id
      and status in ('DRAFT', 'CONFIRMED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  update public.orders
  set restaurant_table_id = p_destination_table_id,
      table_id = p_destination_table_id::text
  where id = p_order_id returning * into current_order;
  update public.restaurant_tables set status = 'CLEANING', is_active = true
  where id = source_table.id;
  update public.restaurant_tables set status = 'OCCUPIED', is_active = true
  where id = destination_table.id;

  perform public.log_table_activity(
    source_table.id, p_order_id, 'ORDER_MOVED_OUT', source_table.status, 'CLEANING',
    p_operation_key, jsonb_build_object('destination_table_id', destination_table.id)
  );
  perform public.log_table_activity(
    destination_table.id, p_order_id, 'ORDER_MOVED_IN', destination_table.status, 'OCCUPIED',
    p_operation_key, jsonb_build_object('source_table_id', source_table.id)
  );
  return jsonb_build_object(
    'order', row_to_json(current_order),
    'sourceTable', (select row_to_json(t) from public.restaurant_tables t where t.id = source_table.id),
    'destinationTable', (select row_to_json(t) from public.restaurant_tables t where t.id = destination_table.id)
  );
end;
$$;


ALTER FUNCTION "public"."move_pos_order_unbound"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_pos_business_number"("p_prefix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  normalized_prefix text := upper(btrim(coalesce(p_prefix, '')));
  malaysia_business_date date := (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
  next_value bigint;
begin
  if normalized_prefix not in ('ORD', 'KB', 'PAY', 'RCP', 'REF') then
    raise exception 'INVALID_BUSINESS_NUMBER_PREFIX';
  end if;

  insert into public.pos_business_number_counters(prefix, business_date, last_value)
  values (normalized_prefix, malaysia_business_date, 1)
  on conflict (prefix, business_date) do update
  set last_value = public.pos_business_number_counters.last_value + 1
  returning last_value into next_value;

  if next_value > 999999 then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  return normalized_prefix || '-' || to_char(malaysia_business_date, 'YYYYMMDD')
    || '-' || lpad(next_value::text, 6, '0');
end;
$$;


ALTER FUNCTION "public"."next_pos_business_number"("p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_pos_status_values"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_table_name = 'orders' then
    new.status := case new.status
      when 'PLACED' then 'CONFIRMED'
      when 'COLLECTED' then 'SERVED'
      when 'REFUNDED' then 'COMPLETED'
      else new.status
    end;
    new.payment_status := case new.payment_status
      when 'PENDING' then 'UNPAID'
      when 'PROCESSING' then 'UNPAID'
      when 'FAILED' then 'UNPAID'
      when 'CANCELLED' then 'UNPAID'
      else new.payment_status
    end;
  elsif tg_table_name = 'order_items' then
    if new.item_status = 'COLLECTED' then new.item_status := 'SERVED'; end if;
  elsif tg_table_name = 'restaurant_tables' then
    if new.status = 'OUT_OF_SERVICE' then new.status := 'DISABLED'; end if;
    if new.status = 'DISABLED' then new.is_active := false; end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."normalize_pos_status_values"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_pos_table_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
declare
  normalized text := upper(btrim(new.table_number));
begin
  if normalized ~ '^[0-9]+$' then
    normalized := 'T' || lpad(normalized, greatest(2, char_length(normalized)), '0');
  elsif normalized ~ '^T[0-9]+$' then
    normalized := 'T' || lpad(
      substring(normalized from 2),
      greatest(2, char_length(substring(normalized from 2))),
      '0'
    );
  end if;
  new.table_number := normalized;
  return new;
end;
$_$;


ALTER FUNCTION "public"."normalize_pos_table_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."place_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  current_user_id uuid := auth.uid();
  normalized_idempotency_key text;
  normalized_table_id text := nullif(btrim(coalesce(p_table_id, '')), '');
  request_fingerprint text;
  existing_order public.orders%rowtype;
  result jsonb;
  initial_batch public.order_item_batches%rowtype;
begin
  if current_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles
    where id = current_user_id and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_dining_mode not in ('dine-in', 'takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if (p_dining_mode = 'dine-in' and normalized_table_id is null)
    or (p_dining_mode = 'takeaway' and normalized_table_id is not null)
  then raise exception 'INVALID_TABLE_ID'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then raise exception 'INVALID_ORDER_ITEMS'; end if;

  normalized_idempotency_key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if normalized_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  request_fingerprint := md5(
    p_items::text || '|' || upper(coalesce(p_payment_method, '')) || '|' ||
    p_dining_mode || '|' || coalesce(normalized_table_id, '')
  );
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || normalized_idempotency_key, 0));
  select * into existing_order from public.orders
  where user_id = current_user_id and idempotency_key = normalized_idempotency_key limit 1;
  if found and existing_order.idempotency_fingerprint is distinct from request_fingerprint then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
  end if;
  perform set_config('app.order_idempotency_fingerprint', request_fingerprint, true);

  perform 1 from public.products product
  join (select distinct item->>'productId' as id from jsonb_array_elements(p_items) item) requested
    on requested.id = product.id::text
  order by product.id for share of product;
  perform 1 from public.product_option_groups option_group
  where option_group.product_id in (
    select product.id from public.products product
    join (select distinct item->>'productId' as id from jsonb_array_elements(p_items) item) requested
      on requested.id = product.id::text
  ) order by option_group.id for share of option_group;
  perform 1 from public.product_options product_option
  join (
    select distinct option_id
    from jsonb_array_elements(p_items) item
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(item->'optionIds') = 'array' then item->'optionIds' else '[]'::jsonb end
    ) as selected(option_id)
  ) requested on requested.option_id = product_option.id::text
  order by product_option.id for share of product_option;

  result := public.create_pos_order_unbound(
    p_items, upper(p_payment_method), p_dining_mode,
    normalized_table_id, normalized_idempotency_key
  );
  initial_batch := public.ensure_initial_pos_kitchen_batch((result->>'id')::uuid, current_user_id);
  return result || jsonb_build_object('batch_id', initial_batch.id, 'batch_no', initial_batch.batch_no);
end;
$$;


ALTER FUNCTION "public"."place_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."place_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") IS 'Atomically validates and places a POS order using authoritative database prices.';



CREATE OR REPLACE FUNCTION "public"."ready_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  batch public.order_item_batches%rowtype;
  staff_role text;
  next_status text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into batch from public.order_item_batches where id = p_batch_id and order_id = p_order_id for update;
  if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
  if ord.payment_status not in ('UNPAID', 'PAID') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if batch.status = 'READY' then return to_jsonb(batch); end if;
  if batch.status <> 'PREPARING' then raise exception 'KITCHEN_BATCH_NOT_PREPARING'; end if;
  update public.order_items set item_status = 'READY' where batch_id = batch.id and item_status = 'PREPARING';
  update public.order_item_batches set status = 'READY', ready_at = coalesce(ready_at, clock_timestamp())
  where id = batch.id returning * into batch;
  if ord.payment_status <> 'PAID' then
    next_status := case
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'PREPARING') then 'PREPARING'
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'SUBMITTED') then 'CONFIRMED'
      when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'READY') then 'READY'
      else ord.status end;
    perform set_config('app.status_change_notes', 'Kitchen completed round ' || batch.batch_no, true);
    update public.orders set status = next_status where id = ord.id;
  end if;
  return to_jsonb(batch);
end;
$$;


ALTER FUNCTION "public"."ready_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_pos_order"("p_order_id" "uuid") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare result public.orders%rowtype; new_subtotal numeric(12,2);
begin
  select coalesce(sum(subtotal), 0) into new_subtotal from public.order_items
  where order_id = p_order_id and item_status <> 'VOIDED';
  update public.orders set
    subtotal = round(new_subtotal, 2), tax = round(new_subtotal * 0.06, 2),
    service_charge = round(new_subtotal * 0.10, 2),
    total = round(new_subtotal - discount + new_subtotal * 0.06 + new_subtotal * 0.10, 2)
  where id = p_order_id returning * into result;
  update public.payments set amount = result.total
  where order_id = p_order_id and status in ('PENDING', 'FAILED');
  return result;
end;
$$;


ALTER FUNCTION "public"."recalculate_pos_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (
      order_id, previous_status, new_status, changed_by, notes
    ) values (
      new.id, null, new.status, auth.uid(),
      nullif(current_setting('app.status_change_notes', true), '')
    );
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (
      order_id, previous_status, new_status, changed_by, notes
    ) values (
      new.id, old.status, new.status, auth.uid(),
      nullif(current_setting('app.status_change_notes', true), '')
    );
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."record_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refund_pos_order"("p_order_id" "uuid", "p_reason" "text", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  caller_id uuid := auth.uid();
  staff_role text;
  ord public.orders%rowtype;
  paid_payment public.payments%rowtype;
  existing_refund public.refunds%rowtype;
  created_refund public.refunds%rowtype;
  normalized_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  fingerprint text;
begin
  select p.role_name into staff_role from public.profiles p
  where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_reason is null or char_length(normalized_reason) < 3 then
    raise exception 'REFUND_REASON_REQUIRED';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  fingerprint := md5(p_order_id::text || '|' || normalized_reason);

  perform pg_advisory_xact_lock(hashtextextended('refund:' || normalized_key, 0));
  select * into existing_refund from public.refunds
  where idempotency_key = normalized_key for update;
  if found then
    if existing_refund.order_id <> p_order_id
       or existing_refund.request_fingerprint <> fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return jsonb_build_object('refund', row_to_json(existing_refund), 'replayed', true);
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status = 'REFUNDED' then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
  if ord.payment_status <> 'PAID' or ord.status <> 'COMPLETED' then
    raise exception 'ORDER_NOT_REFUNDABLE';
  end if;
  select * into paid_payment from public.payments
  where order_id = ord.id and status = 'PAID'
  order by paid_at desc for update limit 1;
  if not found then raise exception 'SUCCESSFUL_PAYMENT_NOT_FOUND'; end if;
  if (select round(sum(amount), 2) from public.payments where order_id = ord.id and status = 'PAID')
     <> round(ord.total, 2) then
    raise exception 'PARTIAL_REFUND_NOT_SUPPORTED';
  end if;

  insert into public.refunds(
    refund_number, order_id, payment_id, requested_by, amount, reason,
    idempotency_key, request_fingerprint
  ) values (
    public.next_pos_business_number('REF'), ord.id, paid_payment.id, caller_id,
    ord.total, normalized_reason, normalized_key, fingerprint
  ) returning * into created_refund;

  update public.payments set status = 'REFUNDED', updated_at = now()
  where order_id = ord.id and status = 'PAID';
  update public.orders set payment_status = 'REFUNDED' where id = ord.id;
  perform public.write_pos_audit(
    'ORDER_REFUNDED', 'ORDER', ord.id, normalized_reason,
    jsonb_build_object(
      'refund_id', created_refund.id,
      'refund_number', created_refund.refund_number,
      'amount', created_refund.amount,
      'receipt_id', (select id from public.receipts where order_id = ord.id)
    )
  );
  return jsonb_build_object('refund', row_to_json(created_refund), 'replayed', false);
end;
$$;


ALTER FUNCTION "public"."refund_pos_order"("p_order_id" "uuid", "p_reason" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_pos_draft_items"("p_order_id" "uuid", "p_items" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  uid uuid:=auth.uid(); ord public.orders%rowtype; item jsonb; product public.products%rowtype;
  new_item public.order_items%rowtype; ids jsonb; option_total numeric(12,2); unit numeric(12,2);
  selected_count int; distinct_count int; group_count int; grp record; mode text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status not in ('DRAFT','CONFIRMED','CONFIRMED','PREPARING','READY','SERVED','SERVED') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if not exists(select 1 from public.profiles where id=uid and status='ACTIVE' and role_name in ('ADMIN','MANAGER','WAITER','CASHIER'))
    then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  delete from public.order_items where order_id=p_order_id and item_status='DRAFT';
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'quantity','') !~ '^[0-9]+$' or (item->>'quantity')::int not between 1 and 99
      then raise exception 'INVALID_ITEM_QUANTITY'; end if;
    select * into product from public.products where id::text=item->>'productId' and status=true;
    if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
    ids:=coalesce(item->'optionIds','[]'::jsonb);
    if jsonb_typeof(ids)<>'array' then raise exception 'INVALID_OPTION_IDS'; end if;
    select count(*),count(distinct x.id),coalesce(sum(po.price_adjustment),0)
      into selected_count,distinct_count,option_total
      from jsonb_array_elements_text(ids) x(id)
      join public.product_options po on po.id::text=x.id and po.is_available
      join public.product_option_groups pog on pog.id=po.option_group_id and pog.product_id=product.id;
    if selected_count<>jsonb_array_length(ids) or distinct_count<>selected_count then raise exception 'INVALID_OR_DUPLICATE_OPTIONS'; end if;
    for grp in select * from public.product_option_groups where product_id=product.id loop
      select count(*) into group_count from jsonb_array_elements_text(ids) x(id)
      join public.product_options po on po.id::text=x.id where po.option_group_id=grp.id;
      if group_count<grp.min_selection or group_count>grp.max_selection or (grp.is_required and group_count=0)
        then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    mode:=upper(coalesce(item->>'serviceMode',case when ord.dining_mode='takeaway' then 'TAKEAWAY' else 'DINE_IN' end));
    if mode not in ('DINE_IN','TAKEAWAY') or (ord.dining_mode='takeaway' and mode<>'TAKEAWAY') then raise exception 'INVALID_SERVICE_MODE'; end if;
    unit:=round(product.sell_price+option_total,2);
    insert into public.order_items(order_id,product_id,quantity,unit_price,subtotal,product_name_snapshot,special_request,sent_at,service_mode,item_status)
    values(ord.id,product.id,(item->>'quantity')::int,unit,round(unit*(item->>'quantity')::int,2),product.product_name,nullif(left(item->>'specialRequest',1000),''),null,mode,'DRAFT') returning * into new_item;
    insert into public.order_item_options(order_item_id,product_option_id,option_group_name,option_name,price_adjustment)
    select new_item.id,po.id,pog.name,po.name,po.price_adjustment from jsonb_array_elements_text(ids) x(id)
    join public.product_options po on po.id::text=x.id join public.product_option_groups pog on pog.id=po.option_group_id;
  end loop;
  ord:=public.recalculate_pos_order(p_order_id);
  return jsonb_build_object('id',ord.id,'total',ord.total,'status',ord.status);
end;
$_$;


ALTER FUNCTION "public"."replace_pos_draft_items"("p_order_id" "uuid", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_pos_table"("p_table_id" "uuid", "p_operation_key" "text" DEFAULT NULL::"text") RETURNS "public"."restaurant_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into current_table from public.restaurant_tables
  where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'AVAILABLE' then return current_table; end if;
  if current_table.status <> 'DISABLED' then raise exception 'INVALID_TABLE_TRANSITION'; end if;

  update public.restaurant_tables set status = 'AVAILABLE', is_active = true
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null, 'TABLE_RESTORED', 'DISABLED', 'AVAILABLE',
    p_operation_key, '{}'::jsonb
  );
  return updated_table;
end;
$$;


ALTER FUNCTION "public"."restore_pos_table"("p_table_id" "uuid", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."serve_ready_order"("p_order_id" "uuid") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  staff_role text;
  next_status text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'READY') then
    if ord.status in ('SERVED', 'COMPLETED') and not exists (
      select 1 from public.order_items where order_id = p_order_id and item_status in ('SUBMITTED', 'PREPARING', 'READY')
    ) then return ord; end if;
    raise exception 'ORDER_NOT_READY';
  end if;
  update public.order_items set item_status = 'SERVED' where order_id = p_order_id and item_status = 'READY';
  update public.order_item_batches batch set status = 'SERVED', served_at = coalesce(served_at, clock_timestamp())
  where batch.order_id = p_order_id and batch.status = 'READY'
    and not exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status <> 'SERVED');
  next_status := case
    when ord.payment_status = 'PAID' then 'COMPLETED'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'SUBMITTED') then 'CONFIRMED'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'READY') then 'READY'
    else 'SERVED' end;
  perform set_config('app.status_change_notes', 'Ready kitchen items served', true);
  update public.orders set status = next_status where id = p_order_id returning * into ord;
  return ord;
end;
$$;


ALTER FUNCTION "public"."serve_ready_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_pos_payment_method"("p_payment_id" "uuid", "p_payment_method" "text") RETURNS "public"."payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare updated_payment public.payments%rowtype;
begin
  if p_payment_method not in ('CASH', 'CARD', 'QR', 'EWALLET') then
    raise exception 'Unsupported payment method';
  end if;
  update public.payments
  set payment_method = p_payment_method
  where id = p_payment_id and user_id = auth.uid() and status in ('PENDING', 'FAILED')
  returning * into updated_payment;
  if not found then raise exception 'Payment does not exist or cannot be changed'; end if;
  return updated_payment;
end;
$$;


ALTER FUNCTION "public"."set_pos_payment_method"("p_payment_id" "uuid", "p_payment_method" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_table_out_of_service"("p_table_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_operation_key" "text" DEFAULT NULL::"text") RETURNS "public"."restaurant_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  select * into current_table from public.restaurant_tables
  where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'DISABLED' then return current_table; end if;
  if current_table.status not in ('AVAILABLE', 'CLEANING') then
    raise exception 'INVALID_TABLE_TRANSITION';
  end if;
  if exists (
    select 1 from public.orders where restaurant_table_id = p_table_id
      and status in ('DRAFT', 'CONFIRMED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;

  update public.restaurant_tables set status = 'DISABLED', is_active = false
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null, 'TABLE_OUT_OF_SERVICE', current_table.status, 'DISABLED',
    p_operation_key, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500))
  );
  return updated_table;
end;
$$;


ALTER FUNCTION "public"."set_table_out_of_service"("p_table_id" "uuid", "p_reason" "text", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_takeaway_packaging"("p_order_id" "uuid", "p_packaging" "text"[]) RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  normalized text[];
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select coalesce(array_agg(distinct upper(value) order by upper(value)), '{}'::text[])
  into normalized from unnest(coalesce(p_packaging, '{}'::text[])) value;
  if not normalized <@ array[
    'CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN'
  ]::text[] then raise exception 'INVALID_TAKEAWAY_PACKAGING'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.dining_mode <> 'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
  if ord.status <> 'DRAFT' or ord.payment_status <> 'UNPAID' then raise exception 'ORDER_NOT_EDITABLE'; end if;
  update public.orders set takeaway_packaging = normalized where id = p_order_id returning * into ord;
  return ord;
end;
$$;


ALTER FUNCTION "public"."set_takeaway_packaging"("p_order_id" "uuid", "p_packaging" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."split_pos_order_charges"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  -- create_pos_order historically supplied the combined 16% charge in tax.
  -- Split that value at the insert boundary without trusting browser totals.
  if coalesce(new.service_charge, 0) = 0
    and abs(coalesce(new.tax, 0) - round(coalesce(new.subtotal, 0) * 0.16, 2)) <= 0.01
  then
    new.tax := round(new.subtotal * 0.06, 2);
    new.service_charge := round(new.subtotal * 0.10, 2);
    new.total := round(new.subtotal - new.discount + new.tax + new.service_charge, 2);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."split_pos_order_charges"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  batch public.order_item_batches%rowtype;
  staff_role text;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into batch from public.order_item_batches where id = p_batch_id and order_id = p_order_id for update;
  if not found then raise exception 'KITCHEN_BATCH_NOT_FOUND'; end if;
  if ord.payment_status not in ('UNPAID', 'PAID') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if batch.status in ('PREPARING', 'READY') then return to_jsonb(batch); end if;
  if batch.status <> 'PENDING' then raise exception 'KITCHEN_BATCH_NOT_PENDING'; end if;
  update public.order_items set item_status = 'PREPARING' where batch_id = batch.id and item_status = 'SUBMITTED';
  update public.order_item_batches set status = 'PREPARING', started_at = coalesce(started_at, clock_timestamp())
  where id = batch.id returning * into batch;
  if ord.payment_status <> 'PAID' then
    perform set_config('app.status_change_notes', 'Kitchen started round ' || batch.batch_no, true);
    update public.orders set status = 'PREPARING', kitchen_started_at = coalesce(kitchen_started_at, clock_timestamp()) where id = ord.id;
  else
    update public.orders set kitchen_started_at = coalesce(kitchen_started_at, clock_timestamp()) where id = ord.id;
  end if;
  return to_jsonb(batch);
end;
$$;


ALTER FUNCTION "public"."start_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_kitchen_order"("p_order_id" "uuid") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  staff_role text;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'KITCHEN') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status = 'PREPARING' then return ord; end if;
  if ord.status <> 'CONFIRMED' then raise exception 'ORDER_NOT_READY_TO_START'; end if;

  update public.order_items set item_status = 'PREPARING'
  where order_id = p_order_id and item_status = 'SUBMITTED';
  perform set_config('app.status_change_notes', 'Kitchen started preparation', true);
  update public.orders
  set status = 'PREPARING', kitchen_started_at = clock_timestamp()
  where id = p_order_id returning * into ord;
  return ord;
end;
$$;


ALTER FUNCTION "public"."start_kitchen_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") RETURNS "public"."restaurant_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  normalized_key text := nullif(left(btrim(coalesce(p_operation_key, '')), 128), '');
  current_table public.restaurant_tables%rowtype;
  result public.restaurant_tables%rowtype;
  prior_log public.table_activity_logs%rowtype;
begin
  select role_name into staff_role from public.profiles where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('start-cleaning:' || normalized_key, 0));

  select * into prior_log from public.table_activity_logs log where log.operation_key = normalized_key limit 1;
  if found then
    if prior_log.restaurant_table_id <> p_table_id or prior_log.action <> 'CLEANING_STARTED' then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    select * into result from public.restaurant_tables where id = p_table_id;
    return result;
  end if;

  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = 'CLEANING' then return current_table; end if;
  if current_table.status <> 'OCCUPIED' then raise exception 'TABLE_NOT_AWAITING_CLEANING'; end if;
  if exists (
    select 1 from public.orders
    where restaurant_table_id = p_table_id
      and payment_status in ('UNPAID', 'PARTIALLY_PAID')
      and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) then raise exception 'TABLE_HAS_ACTIVE_ORDER'; end if;
  if exists (
    select 1 from public.orders ord join public.order_items item on item.order_id = ord.id
    where ord.restaurant_table_id = p_table_id
      and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
  ) then raise exception 'KITCHEN_ITEMS_NOT_FULFILLED'; end if;

  update public.restaurant_tables set status = 'CLEANING', is_active = true
  where id = p_table_id returning * into result;
  perform public.log_table_activity(
    p_table_id, null, 'CLEANING_STARTED', 'OCCUPIED', 'CLEANING', normalized_key,
    jsonb_build_object('manual', true)
  );
  return result;
end;
$$;


ALTER FUNCTION "public"."start_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_pos_order"("p_order_id" "uuid", "p_idempotency_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  key text;
  ord public.orders%rowtype;
  prior public.order_submissions%rowtype;
  submitted uuid[];
  draft_item record;
  grp record;
  group_count integer;
  option_total numeric(12,2);
  new_batch public.order_item_batches%rowtype;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  key := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || key, 0));

  select * into prior from public.order_submissions
  where user_id = uid and idempotency_key = key;
  if found then
    if prior.order_id <> p_order_id then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    select * into ord from public.orders where id = p_order_id;
    select * into new_batch from public.order_item_batches
    where user_id = uid and idempotency_key = key;
    return jsonb_build_object(
      'id', ord.id, 'status', ord.status,
      'submittedItemIds', prior.submitted_item_ids,
      'batchId', new_batch.id, 'batchNo', new_batch.batch_no
    );
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if ord.status not in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if not exists (
    select 1 from public.profiles
    where id = uid and status = 'ACTIVE' and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;

  if exists (
    select 1 from public.order_items oi
    left join public.products p on p.id = oi.product_id and p.status = true and p.is_available = true
    where oi.order_id = p_order_id and oi.item_status = 'DRAFT' and p.id is null
  ) then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if exists (
    select 1 from public.order_items oi
    join public.order_item_options oio on oio.order_item_id = oi.id
    left join public.product_options po on po.id = oio.product_option_id and po.is_available
    where oi.order_id = p_order_id and oi.item_status = 'DRAFT' and po.id is null
  ) then raise exception 'OPTION_NOT_AVAILABLE'; end if;

  for draft_item in
    select oi.*, p.sell_price, p.product_name
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = p_order_id and oi.item_status = 'DRAFT'
    for update of oi
  loop
    for grp in select * from public.product_option_groups where product_id = draft_item.product_id loop
      select count(*) into group_count
      from public.order_item_options oio
      join public.product_options po on po.id = oio.product_option_id
      where oio.order_item_id = draft_item.id and po.option_group_id = grp.id;
      if group_count < grp.min_selection or group_count > grp.max_selection
        or (grp.is_required and group_count = 0)
      then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    select coalesce(sum(po.price_adjustment), 0) into option_total
    from public.order_item_options oio
    join public.product_options po on po.id = oio.product_option_id
    where oio.order_item_id = draft_item.id;
    update public.order_items
    set unit_price = round(draft_item.sell_price + option_total, 2),
        subtotal = round((draft_item.sell_price + option_total) * draft_item.quantity, 2),
        product_name_snapshot = draft_item.product_name
    where id = draft_item.id;
    update public.order_item_options oio
    set option_group_name = pog.name,
        option_name = po.name,
        price_adjustment = po.price_adjustment
    from public.product_options po
    join public.product_option_groups pog on pog.id = po.option_group_id
    where oio.order_item_id = draft_item.id and po.id = oio.product_option_id;
  end loop;

  ord := public.recalculate_pos_order(p_order_id);
  select array_agg(id order by created_at) into submitted
  from public.order_items
  where order_id = p_order_id and item_status = 'DRAFT';
  if submitted is null then raise exception 'NO_DRAFT_ITEMS'; end if;

  insert into public.order_item_batches (
    order_id, user_id, idempotency_key, request_items, status
  )
  select p_order_id, uid, key,
    jsonb_agg(jsonb_build_object('orderItemId', id) order by created_at), 'PENDING'
  from public.order_items where id = any(submitted)
  returning * into new_batch;

  update public.order_items
  set item_status = 'SUBMITTED', sent_at = clock_timestamp(), batch_id = new_batch.id
  where id = any(submitted);
  perform set_config('app.status_change_notes', 'Kitchen batch ' || new_batch.batch_no || ' submitted', true);
  update public.orders
  set status = case when status = 'DRAFT' then 'CONFIRMED' else status end
  where id = p_order_id returning * into ord;
  insert into public.order_submissions(order_id, user_id, idempotency_key, submitted_item_ids)
  values (p_order_id, uid, key, submitted);
  return jsonb_build_object(
    'id', ord.id, 'status', ord.status, 'submittedItemIds', submitted,
    'batchId', new_batch.id, 'batchNo', new_batch.batch_no
  );
end;
$$;


ALTER FUNCTION "public"."submit_pos_order"("p_order_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pos_bill_payment_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_order_id uuid := coalesce(new.order_id, old.order_id);
  derived_status text;
begin
  select case
    when bool_and(status = 'PAID') then 'PAID'
    when bool_or(paid_amount > 0) then 'PARTIALLY_PAID'
    else 'UNPAID'
  end into derived_status
  from public.order_bills where order_id = target_order_id;

  if derived_status is not null then
    update public.orders set payment_status = derived_status
    where id = target_order_id and payment_status <> 'REFUNDED';
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."sync_pos_bill_payment_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_pos_kitchen_batch_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_batch_id uuid := coalesce(new.batch_id, old.batch_id);
  derived_status text;
begin
  if target_batch_id is null then return coalesce(new, old); end if;

  derived_status := case
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'SUBMITTED') then 'PENDING'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'READY') then 'READY'
    when exists (select 1 from public.order_items where batch_id = target_batch_id and item_status = 'SERVED') then 'SERVED'
    else 'CANCELLED'
  end;

  update public.order_item_batches
  set status = derived_status,
      started_at = case
        when derived_status in ('PREPARING', 'READY', 'SERVED') then coalesce(started_at, clock_timestamp())
        else started_at
      end,
      ready_at = case
        when derived_status in ('READY', 'SERVED') then coalesce(ready_at, clock_timestamp())
        else ready_at
      end,
      served_at = case
        when derived_status = 'SERVED' then coalesce(served_at, clock_timestamp())
        else served_at
      end
  where id = target_batch_id
    and status is distinct from derived_status;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."sync_pos_kitchen_batch_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_role_name_and_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  selected_role public.roles%rowtype;
begin
  if tg_op = 'UPDATE' and new.role_name is distinct from old.role_name then
    select * into selected_role
    from public.roles
    where lower(name) = lower(trim(new.role_name))
    limit 1;

    if not found then
      raise exception 'Role "%" does not exist', new.role_name;
    end if;

    new.role_id := selected_role.id;
    new.role_name := selected_role.name;
  elsif new.role_id is not null then
    select * into selected_role
    from public.roles
    where id = new.role_id;

    if not found then
      raise exception 'Role ID "%" does not exist', new.role_id;
    end if;

    new.role_name := selected_role.name;
  elsif new.role_name is not null then
    select * into selected_role
    from public.roles
    where lower(name) = lower(trim(new.role_name))
    limit 1;

    if not found then
      raise exception 'Role "%" does not exist', new.role_name;
    end if;

    new.role_id := selected_role.id;
    new.role_name := selected_role.name;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profile_role_name_and_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_restaurant_table_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  prior text;
  has_other_operational_order boolean;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id and is_active for update;
    if prior is null or prior not in ('AVAILABLE', 'RESERVED', 'OCCUPIED') then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists (
      select 1 from public.orders existing
      where existing.restaurant_table_id = new.restaurant_table_id
        and existing.id <> new.id
        and existing.payment_status in ('UNPAID', 'PARTIALLY_PAID')
        and existing.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
    ) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
    update public.restaurant_tables set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id;
    perform public.log_table_activity(
      new.restaurant_table_id, new.id,
      case when prior = 'OCCUPIED' then 'NEW_BILL_AFTER_PAYMENT' else 'TABLE_OCCUPIED' end,
      prior, 'OCCUPIED', new.idempotency_key,
      jsonb_build_object('order_number', new.order_number)
    );
    return new;
  end if;

  select exists (
    select 1 from public.orders other_order
    where other_order.restaurant_table_id = new.restaurant_table_id
      and other_order.id <> new.id
      and other_order.status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED')
  ) into has_other_operational_order;

  if new.status = 'COMPLETED' and new.payment_status = 'PAID'
    and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id for update;
    update public.restaurant_tables set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id;
    if not has_other_operational_order then
      perform public.log_table_activity(
        new.restaurant_table_id, new.id, 'PAYMENT_COMPLETED', prior, 'OCCUPIED', null,
        jsonb_build_object('order_number', new.order_number, 'new_bill_allowed', true)
      );
    end if;
  elsif new.status = 'CANCELLED' then
    if has_other_operational_order then
      update public.restaurant_tables set status = 'OCCUPIED', is_active = true
      where id = new.restaurant_table_id;
    elsif old.status in ('DRAFT', 'CONFIRMED') then
      update public.restaurant_tables set status = 'AVAILABLE', is_active = true
      where id = new.restaurant_table_id;
    else
      update public.restaurant_tables set status = 'CLEANING', is_active = true
      where id = new.restaurant_table_id;
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_restaurant_table_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_pos_order"("p_order_id" "uuid", "p_new_status" "text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."orders"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  ord public.orders%rowtype;
  staff_role text;
  target text := upper(trim(coalesce(p_new_status, '')));
  result public.orders%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if staff_role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  if target not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED') then
    raise exception 'INVALID_ORDER_STATUS';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  if target = 'CANCELLED' then
    if ord.payment_status in ('PAID', 'PARTIALLY_PAID') then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if staff_role not in ('ADMIN', 'MANAGER')
      and (ord.user_id <> auth.uid() or ord.status not in ('DRAFT', 'CONFIRMED'))
    then raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'; end if;
    update public.order_items
    set item_status = 'VOIDED',
        void_reason = coalesce(nullif(left(p_notes, 1000), ''), 'Order cancelled'),
        voided_by = auth.uid(), voided_at = now()
    where order_id = p_order_id and item_status not in ('SERVED', 'VOIDED');
    update public.payments set status = 'CANCELLED'
    where order_id = p_order_id and status in ('PENDING', 'PROCESSING', 'FAILED');
    update public.orders set status = 'CANCELLED', payment_status = 'UNPAID'
    where id = p_order_id returning * into result;
    return result;
  end if;

  if not (
    (ord.status = 'DRAFT' and target = 'CONFIRMED') or
    (ord.status = 'CONFIRMED' and target = 'PREPARING') or
    (ord.status = 'PREPARING' and target = 'READY') or
    (ord.status = 'READY' and target = 'SERVED') or
    (ord.status = 'SERVED' and target = 'COMPLETED')
  ) then raise exception 'INVALID_ORDER_TRANSITION'; end if;

  if staff_role not in ('ADMIN', 'MANAGER') then
    if staff_role = 'KITCHEN' and target not in ('PREPARING', 'READY') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if staff_role in ('WAITER', 'CASHIER') and target <> 'SERVED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if target = 'COMPLETED' and ord.payment_status <> 'PAID' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;

  if target = 'PREPARING' then
    update public.order_items set item_status = 'PREPARING'
    where order_id = p_order_id and item_status = 'SUBMITTED';
  elsif target = 'READY' then
    update public.order_items set item_status = 'READY'
    where order_id = p_order_id and item_status in ('SUBMITTED', 'PREPARING');
  elsif target = 'SERVED' then
    update public.order_items set item_status = 'SERVED'
    where order_id = p_order_id and item_status = 'READY';
  end if;

  perform set_config('app.status_change_notes', coalesce(left(p_notes, 1000), ''), true);
  update public.orders
  set status = case when target = 'SERVED' and payment_status = 'PAID' then 'COMPLETED' else target end,
      kitchen_started_at = case
        when target = 'PREPARING' then coalesce(kitchen_started_at, clock_timestamp())
        else kitchen_started_at
      end
  where id = p_order_id returning * into result;
  return result;
end;
$$;


ALTER FUNCTION "public"."transition_pos_order"("p_order_id" "uuid", "p_new_status" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_restaurant_table"("p_table_id" "uuid", "p_new_status" "text") RETURNS "public"."restaurant_tables"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  staff_role text;
  target_status text := upper(trim(coalesce(p_new_status, '')));
  current_table public.restaurant_tables%rowtype;
  updated_table public.restaurant_tables%rowtype;
begin
  select role_name into staff_role from public.profiles
  where id = auth.uid() and status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER', 'WAITER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if target_status = 'CLEANING' or target_status = 'OCCUPIED' then
    raise exception 'USE_CONTROLLED_BUSINESS_OPERATION';
  end if;
  if target_status = 'DISABLED' then
    if staff_role not in ('ADMIN', 'MANAGER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    return public.set_table_out_of_service(p_table_id, null, null);
  end if;
  if target_status = 'AVAILABLE' then
    select * into current_table from public.restaurant_tables where id = p_table_id;
    if not found then raise exception 'TABLE_NOT_FOUND'; end if;
    if current_table.status = 'CLEANING' then return public.complete_table_cleaning(p_table_id, null); end if;
    if current_table.status = 'DISABLED' then return public.restore_pos_table(p_table_id, null); end if;
  end if;

  select * into current_table from public.restaurant_tables where id = p_table_id for update;
  if not found then raise exception 'TABLE_NOT_FOUND'; end if;
  if current_table.status = target_status then return current_table; end if;
  if not (
    (current_table.status = 'AVAILABLE' and target_status = 'RESERVED') or
    (current_table.status = 'RESERVED' and target_status = 'AVAILABLE')
  ) then raise exception 'INVALID_TABLE_TRANSITION'; end if;

  update public.restaurant_tables set status = target_status, is_active = true
  where id = p_table_id returning * into updated_table;
  perform public.log_table_activity(
    p_table_id, null,
    case when target_status = 'RESERVED' then 'TABLE_RESERVED' else 'RESERVATION_RELEASED' end,
    current_table.status, target_status, null, '{}'::jsonb
  );
  return updated_table;
end;
$$;


ALTER FUNCTION "public"."transition_restaurant_table"("p_table_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."transition_restaurant_table"("p_table_id" "uuid", "p_new_status" "text") IS 'Serializes and validates explicit restaurant-table state transitions for operational staff.';



CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_pos_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare audit_id uuid;
begin
  if btrim(coalesce(p_action, '')) = '' or btrim(coalesce(p_entity_type, '')) = '' then
    raise exception 'INVALID_AUDIT_EVENT';
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, metadata)
  values (
    auth.uid(), upper(left(btrim(p_action), 80)), upper(left(btrim(p_entity_type), 50)),
    p_entity_id, nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into audit_id;
  return audit_id;
end;
$$;


ALTER FUNCTION "public"."write_pos_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "action" character varying(80) NOT NULL,
    "entity_type" character varying(50) NOT NULL,
    "entity_id" "uuid",
    "reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_logs_metadata_check" CHECK (("jsonb_typeof"("metadata") = 'object'::"text"))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" boolean DEFAULT true NOT NULL,
    "category_code" character varying(20) NOT NULL,
    CONSTRAINT "categories_category_code_format_check" CHECK ((("category_code")::"text" ~ '^CAT-[0-9]{4}$'::"text"))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


COMMENT ON COLUMN "public"."categories"."category_code" IS 'Staff-facing category identifier, e.g. CAT-0001.';



CREATE TABLE IF NOT EXISTS "public"."kitchen_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kitchen_order_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "status" character varying(20) DEFAULT 'PENDING'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kitchen_order_items_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."kitchen_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "status" character varying(20) DEFAULT 'PENDING'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "kitchen_orders_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['PENDING'::character varying, 'PREPARING'::character varying, 'READY'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::"text"[])))
);


ALTER TABLE "public"."kitchen_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kitchen_stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "status" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."kitchen_stations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_bill_items" (
    "bill_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL
);


ALTER TABLE "public"."order_bill_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_bills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "bill_number" integer NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" character varying(10) DEFAULT 'OPEN'::character varying NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "order_bills_bill_number_check" CHECK ((("bill_number" >= 1) AND ("bill_number" <= 10))),
    CONSTRAINT "order_bills_check" CHECK ((("paid_amount" >= (0)::numeric) AND ("paid_amount" <= "total"))),
    CONSTRAINT "order_bills_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['OPEN'::character varying, 'PAID'::character varying])::"text"[]))),
    CONSTRAINT "order_bills_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."order_bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_item_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "option_group_name" character varying(100) NOT NULL,
    "option_name" character varying(100) NOT NULL,
    "price_adjustment" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "product_option_id" "uuid"
);


ALTER TABLE "public"."order_item_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" numeric(10,2) NOT NULL,
    "subtotal" numeric(10,2) NOT NULL,
    "status" boolean DEFAULT true,
    "product_name_snapshot" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "special_request" "text",
    "batch_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "service_mode" "text" DEFAULT 'DINE_IN'::"text" NOT NULL,
    "item_status" "text" DEFAULT 'SUBMITTED'::"text" NOT NULL,
    "void_reason" "text",
    "voided_by" "uuid",
    "voided_at" timestamp with time zone,
    CONSTRAINT "order_items_item_status_check" CHECK (("item_status" = ANY (ARRAY['DRAFT'::"text", 'SUBMITTED'::"text", 'PREPARING'::"text", 'READY'::"text", 'SERVED'::"text", 'VOIDED'::"text"]))),
    CONSTRAINT "order_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "order_items_service_mode_check" CHECK (("service_mode" = ANY (ARRAY['DINE_IN'::"text", 'TAKEAWAY'::"text"]))),
    CONSTRAINT "order_items_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "order_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);

ALTER TABLE ONLY "public"."order_items" REPLICA IDENTITY FULL;


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "previous_status" character varying(20),
    "new_status" character varying(20) NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "submitted_item_ids" "uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_business_number_counters" (
    "prefix" character varying(8) NOT NULL,
    "business_date" "date" NOT NULL,
    "last_value" bigint NOT NULL,
    CONSTRAINT "pos_business_number_counters_last_value_check" CHECK (("last_value" > 0)),
    CONSTRAINT "pos_business_number_counters_prefix_check" CHECK ((("prefix")::"text" = ANY ((ARRAY['ORD'::character varying, 'KB'::character varying, 'PAY'::character varying, 'RCP'::character varying, 'REF'::character varying])::"text"[])))
);


ALTER TABLE "public"."pos_business_number_counters" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pos_category_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pos_category_code_seq" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pos_product_code_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pos_product_code_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_option_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "selection_type" character varying(20) NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "min_selection" integer DEFAULT 0 NOT NULL,
    "max_selection" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_option_groups_check" CHECK (("min_selection" <= "max_selection")),
    CONSTRAINT "product_option_groups_max_selection_check" CHECK (("max_selection" >= 1)),
    CONSTRAINT "product_option_groups_min_selection_check" CHECK (("min_selection" >= 0)),
    CONSTRAINT "product_option_groups_selection_type_check" CHECK ((("selection_type")::"text" = ANY ((ARRAY['SINGLE'::character varying, 'MULTIPLE'::character varying])::"text"[])))
);


ALTER TABLE "public"."product_option_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "option_group_id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "price_adjustment" numeric(10,2) DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_options_price_adjustment_check" CHECK (("price_adjustment" >= (0)::numeric))
);


ALTER TABLE "public"."product_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "description" "text",
    "unit" character varying(20),
    "cost_price" numeric(10,2) NOT NULL,
    "sell_price" numeric(10,2) NOT NULL,
    "status" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_available" boolean DEFAULT true NOT NULL,
    "image_url" "text",
    "product_code" character varying(20) NOT NULL,
    CONSTRAINT "products_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "products_product_code_format_check" CHECK ((("product_code")::"text" ~ '^PRD-[0-9]{6}$'::"text")),
    CONSTRAINT "products_sell_price_check" CHECK (("sell_price" >= (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


COMMENT ON COLUMN "public"."products"."is_available" IS 'Operational sellability; false means sold out but still visible in the POS menu.';



COMMENT ON COLUMN "public"."products"."image_url" IS 'Optional product image URL managed by the catalogue.';



COMMENT ON COLUMN "public"."products"."product_code" IS 'Staff-facing product identifier, e.g. PRD-000001.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "username" character varying(50),
    "email" character varying(255),
    "password_hash" "text" DEFAULT 'supabase_managed'::"text" NOT NULL,
    "status" character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    "login_attempt" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "role_name" "text" DEFAULT 'CASHIER'::"text" NOT NULL,
    CONSTRAINT "profiles_login_attempt_check" CHECK (("login_attempt" >= 0)),
    CONSTRAINT "profiles_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'LOCKED'::character varying])::"text"[])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "receipt_number" character varying(32) NOT NULL,
    "order_id" "uuid" NOT NULL,
    "issued_by" "uuid" NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "discount" numeric(12,2) NOT NULL,
    "tax" numeric(12,2) NOT NULL,
    "service_charge" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "paid_amount" numeric(12,2) NOT NULL,
    "status" character varying(12) DEFAULT 'ISSUED'::character varying NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "receipts_check" CHECK (("paid_amount" >= "total")),
    CONSTRAINT "receipts_discount_check" CHECK (("discount" >= (0)::numeric)),
    CONSTRAINT "receipts_number_format_check" CHECK ((("receipt_number")::"text" ~ '^RCP-[0-9]{8}-[0-9]{6}$'::"text")),
    CONSTRAINT "receipts_service_charge_check" CHECK (("service_charge" >= (0)::numeric)),
    CONSTRAINT "receipts_status_check" CHECK ((("status")::"text" = 'ISSUED'::"text")),
    CONSTRAINT "receipts_subtotal_check" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "receipts_tax_check" CHECK (("tax" >= (0)::numeric)),
    CONSTRAINT "receipts_total_check" CHECK (("total" >= (0)::numeric))
);


ALTER TABLE "public"."receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "refund_number" character varying(32) NOT NULL,
    "order_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "status" character varying(12) DEFAULT 'COMPLETED'::character varying NOT NULL,
    "idempotency_key" character varying(128) NOT NULL,
    "request_fingerprint" "text" NOT NULL,
    "refunded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refunds_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "refunds_number_format_check" CHECK ((("refund_number")::"text" ~ '^REF-[0-9]{8}-[0-9]{6}$'::"text")),
    CONSTRAINT "refunds_reason_check" CHECK ((("char_length"("btrim"("reason")) >= 3) AND ("char_length"("btrim"("reason")) <= 500))),
    CONSTRAINT "refunds_status_check" CHECK ((("status")::"text" = 'COMPLETED'::"text"))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."table_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "restaurant_table_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "action" character varying(50) NOT NULL,
    "from_status" character varying(20),
    "to_status" character varying(20),
    "performed_by" "uuid",
    "operation_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "table_activity_logs_action_check" CHECK ((("action")::"text" = ANY ((ARRAY['TABLE_RESERVED'::character varying, 'RESERVATION_RELEASED'::character varying, 'TABLE_OCCUPIED'::character varying, 'NEW_BILL_AFTER_PAYMENT'::character varying, 'ORDER_MOVED_IN'::character varying, 'ORDER_MOVED_OUT'::character varying, 'ORDER_CANCELLED'::character varying, 'PAYMENT_COMPLETED'::character varying, 'CLEANING_STARTED'::character varying, 'CLEANING_COMPLETED'::character varying, 'TABLE_OUT_OF_SERVICE'::character varying, 'TABLE_RESTORED'::character varying, 'MANAGER_OVERRIDE'::character varying])::"text"[]))),
    CONSTRAINT "table_activity_operation_key_length" CHECK ((("operation_key" IS NULL) OR (("char_length"("btrim"("operation_key")) >= 1) AND ("char_length"("btrim"("operation_key")) <= 128))))
);

ALTER TABLE ONLY "public"."table_activity_logs" REPLICA IDENTITY FULL;


ALTER TABLE "public"."table_activity_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_order_items"
    ADD CONSTRAINT "kitchen_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_orders"
    ADD CONSTRAINT "kitchen_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kitchen_stations"
    ADD CONSTRAINT "kitchen_stations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."kitchen_stations"
    ADD CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_bill_items"
    ADD CONSTRAINT "order_bill_items_order_item_id_key" UNIQUE ("order_item_id");



ALTER TABLE ONLY "public"."order_bill_items"
    ADD CONSTRAINT "order_bill_items_pkey" PRIMARY KEY ("bill_id", "order_item_id");



ALTER TABLE ONLY "public"."order_bills"
    ADD CONSTRAINT "order_bills_order_id_bill_number_key" UNIQUE ("order_id", "bill_number");



ALTER TABLE ONLY "public"."order_bills"
    ADD CONSTRAINT "order_bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_batches"
    ADD CONSTRAINT "order_item_batches_order_batch_no_key" UNIQUE ("order_id", "batch_no");



ALTER TABLE ONLY "public"."order_item_batches"
    ADD CONSTRAINT "order_item_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_item_batches"
    ADD CONSTRAINT "order_item_batches_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key");



ALTER TABLE ONLY "public"."order_item_options"
    ADD CONSTRAINT "order_item_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_submissions"
    ADD CONSTRAINT "order_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_submissions"
    ADD CONSTRAINT "order_submissions_user_id_idempotency_key_key" UNIQUE ("user_id", "idempotency_key");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_number_key" UNIQUE ("order_number");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."payments"
    ADD CONSTRAINT "payments_paid_method_supported_check" CHECK (((("status")::"text" <> 'PAID'::"text") OR (("payment_method")::"text" = 'CASH'::"text"))) NOT VALID;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_business_number_counters"
    ADD CONSTRAINT "pos_business_number_counters_pkey" PRIMARY KEY ("prefix", "business_date");



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "product_option_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "product_option_groups_product_id_name_key" UNIQUE ("product_id", "name");



ALTER TABLE ONLY "public"."product_options"
    ADD CONSTRAINT "product_options_option_group_id_name_key" UNIQUE ("option_group_id", "name");



ALTER TABLE ONLY "public"."product_options"
    ADD CONSTRAINT "product_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_receipt_number_key" UNIQUE ("receipt_number");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_refund_number_key" UNIQUE ("refund_number");



ALTER TABLE ONLY "public"."restaurant_tables"
    ADD CONSTRAINT "restaurant_tables_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."restaurant_tables"
    ADD CONSTRAINT "restaurant_tables_qr_code_key" UNIQUE ("qr_code");



ALTER TABLE ONLY "public"."restaurant_tables"
    ADD CONSTRAINT "restaurant_tables_table_number_key" UNIQUE ("table_number");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."table_activity_logs"
    ADD CONSTRAINT "table_activity_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE UNIQUE INDEX "idx_categories_category_code" ON "public"."categories" USING "btree" ("category_code");



CREATE INDEX "idx_categories_status_name" ON "public"."categories" USING "btree" ("status", "name");



CREATE INDEX "idx_kitchen_order_items_item_id" ON "public"."kitchen_order_items" USING "btree" ("order_item_id");



CREATE INDEX "idx_kitchen_order_items_order_id" ON "public"."kitchen_order_items" USING "btree" ("kitchen_order_id");



CREATE INDEX "idx_kitchen_orders_order_id" ON "public"."kitchen_orders" USING "btree" ("order_id");



CREATE INDEX "idx_kitchen_orders_station_id" ON "public"."kitchen_orders" USING "btree" ("station_id");



CREATE UNIQUE INDEX "idx_one_active_order_per_restaurant_table" ON "public"."orders" USING "btree" ("restaurant_table_id") WHERE (("restaurant_table_id" IS NOT NULL) AND (("payment_status")::"text" = ANY ((ARRAY['UNPAID'::character varying, 'PARTIALLY_PAID'::character varying])::"text"[])) AND (("status")::"text" = ANY ((ARRAY['DRAFT'::character varying, 'CONFIRMED'::character varying, 'PREPARING'::character varying, 'READY'::character varying, 'SERVED'::character varying])::"text"[])));



CREATE INDEX "idx_option_groups_product" ON "public"."product_option_groups" USING "btree" ("product_id", "sort_order");



CREATE INDEX "idx_order_bills_created_by" ON "public"."order_bills" USING "btree" ("created_by");



CREATE INDEX "idx_order_bills_order" ON "public"."order_bills" USING "btree" ("order_id", "bill_number");



CREATE INDEX "idx_order_history_order_time" ON "public"."order_status_history" USING "btree" ("order_id", "changed_at");



CREATE UNIQUE INDEX "idx_order_item_batches_batch_number" ON "public"."order_item_batches" USING "btree" ("batch_number");



CREATE INDEX "idx_order_item_batches_kitchen_queue" ON "public"."order_item_batches" USING "btree" ("status", "created_at") WHERE ("status" = ANY (ARRAY['PENDING'::"text", 'PREPARING'::"text", 'READY'::"text"]));



CREATE INDEX "idx_order_item_batches_order_created" ON "public"."order_item_batches" USING "btree" ("order_id", "created_at");



CREATE INDEX "idx_order_item_options_item" ON "public"."order_item_options" USING "btree" ("order_item_id");



CREATE INDEX "idx_order_items_batch_status" ON "public"."order_items" USING "btree" ("batch_id", "item_status");



CREATE INDEX "idx_order_items_order_item_status" ON "public"."order_items" USING "btree" ("order_id", "item_status");



CREATE INDEX "idx_order_items_order_product" ON "public"."order_items" USING "btree" ("order_id", "product_id");



CREATE INDEX "idx_order_items_order_sent" ON "public"."order_items" USING "btree" ("order_id", "sent_at");



CREATE INDEX "idx_order_items_product_id" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "idx_order_items_voided_by" ON "public"."order_items" USING "btree" ("voided_by") WHERE ("voided_by" IS NOT NULL);



CREATE INDEX "idx_order_status_history_changed_by" ON "public"."order_status_history" USING "btree" ("changed_by") WHERE ("changed_by" IS NOT NULL);



CREATE INDEX "idx_order_submissions_order_id" ON "public"."order_submissions" USING "btree" ("order_id");



CREATE INDEX "idx_orders_created_at" ON "public"."orders" USING "btree" ("created_at");



CREATE INDEX "idx_orders_restaurant_table" ON "public"."orders" USING "btree" ("restaurant_table_id") WHERE ("restaurant_table_id" IS NOT NULL);



CREATE INDEX "idx_orders_status_created_at" ON "public"."orders" USING "btree" ("status", "created_at");



CREATE INDEX "idx_orders_user_id" ON "public"."orders" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_orders_user_idempotency_key" ON "public"."orders" USING "btree" ("user_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "idx_payments_bill" ON "public"."payments" USING "btree" ("bill_id", "status");



CREATE UNIQUE INDEX "idx_payments_idempotency_key" ON "public"."payments" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE UNIQUE INDEX "idx_payments_one_paid_per_order" ON "public"."payments" USING "btree" ("order_id") WHERE ((("status")::"text" = 'PAID'::"text") AND ("bill_id" IS NULL));



CREATE INDEX "idx_payments_order_id" ON "public"."payments" USING "btree" ("order_id");



CREATE INDEX "idx_payments_paid_at" ON "public"."payments" USING "btree" ("paid_at");



CREATE UNIQUE INDEX "idx_payments_payment_number" ON "public"."payments" USING "btree" ("payment_number");



CREATE INDEX "idx_payments_user_id" ON "public"."payments" USING "btree" ("user_id");



CREATE INDEX "idx_product_options_group" ON "public"."product_options" USING "btree" ("option_group_id", "sort_order");



CREATE INDEX "idx_products_category_active_available" ON "public"."products" USING "btree" ("category_id", "status", "is_available");



CREATE INDEX "idx_products_category_status" ON "public"."products" USING "btree" ("category_id", "status");



CREATE INDEX "idx_products_name" ON "public"."products" USING "btree" ("product_name");



CREATE UNIQUE INDEX "idx_products_product_code" ON "public"."products" USING "btree" ("product_code");



CREATE INDEX "idx_receipts_issued_at" ON "public"."receipts" USING "btree" ("issued_at" DESC);



CREATE UNIQUE INDEX "idx_refunds_one_completed_per_order" ON "public"."refunds" USING "btree" ("order_id") WHERE (("status")::"text" = 'COMPLETED'::"text");



CREATE INDEX "idx_refunds_payment_id" ON "public"."refunds" USING "btree" ("payment_id");



CREATE INDEX "idx_refunds_refunded_at" ON "public"."refunds" USING "btree" ("refunded_at" DESC);



CREATE INDEX "idx_restaurant_tables_area_status" ON "public"."restaurant_tables" USING "btree" ("area", "status") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "idx_table_activity_operation_idempotency" ON "public"."table_activity_logs" USING "btree" ("performed_by", "action", "operation_key") WHERE ("operation_key" IS NOT NULL);



CREATE INDEX "idx_table_activity_order_time" ON "public"."table_activity_logs" USING "btree" ("order_id", "created_at" DESC) WHERE ("order_id" IS NOT NULL);



CREATE INDEX "idx_table_activity_table_time" ON "public"."table_activity_logs" USING "btree" ("restaurant_table_id", "created_at" DESC);



CREATE INDEX "idx_users_role_id" ON "public"."profiles" USING "btree" ("role_id");



CREATE OR REPLACE TRIGGER "sync_profile_role_name_and_id" BEFORE INSERT OR UPDATE OF "role_id", "role_name" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_profile_role_name_and_id"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_category_code" BEFORE INSERT ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_master_code"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_kitchen_batch_no" BEFORE INSERT ON "public"."order_item_batches" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_kitchen_batch_no"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_kitchen_batch_number" BEFORE INSERT ON "public"."order_item_batches" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_transaction_number"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_order_number" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_transaction_number"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_payment_number" BEFORE INSERT ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_transaction_number"();



CREATE OR REPLACE TRIGGER "trg_assign_pos_product_code" BEFORE INSERT ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."assign_pos_master_code"();



CREATE OR REPLACE TRIGGER "trg_categories_updated_at" BEFORE UPDATE ON "public"."categories" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_enforce_paid_payment_role" BEFORE INSERT OR UPDATE OF "status" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_paid_payment_role"();



CREATE OR REPLACE TRIGGER "trg_enforce_takeaway_order_item_service_mode" BEFORE INSERT OR UPDATE OF "order_id", "service_mode" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_takeaway_order_item_service_mode"();



CREATE OR REPLACE TRIGGER "trg_guard_active_order_write" BEFORE INSERT OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_active_pos_write"();



CREATE OR REPLACE TRIGGER "trg_guard_active_payment_write" BEFORE INSERT OR UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_active_pos_write"();



CREATE OR REPLACE TRIGGER "trg_guard_order_idempotency_fingerprint" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_order_idempotency_fingerprint"();



CREATE OR REPLACE TRIGGER "trg_guard_pos_order_payment_status" BEFORE UPDATE OF "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_pos_order_payment_status"();



CREATE OR REPLACE TRIGGER "trg_guard_profile_privilege_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_profile_privilege_fields"();



CREATE OR REPLACE TRIGGER "trg_issue_paid_order_receipt" AFTER UPDATE OF "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."issue_paid_order_receipt"();



CREATE OR REPLACE TRIGGER "trg_kitchen_order_items_updated_at" BEFORE UPDATE ON "public"."kitchen_order_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_kitchen_orders_updated_at" BEFORE UPDATE ON "public"."kitchen_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_kitchen_stations_updated_at" BEFORE UPDATE ON "public"."kitchen_stations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_normalize_order_item_status_values" BEFORE INSERT OR UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_pos_status_values"();



CREATE OR REPLACE TRIGGER "trg_normalize_order_status_values" BEFORE INSERT OR UPDATE OF "status", "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_pos_status_values"();



CREATE OR REPLACE TRIGGER "trg_normalize_pos_table_number" BEFORE INSERT OR UPDATE OF "table_number" ON "public"."restaurant_tables" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_pos_table_number"();



CREATE OR REPLACE TRIGGER "trg_normalize_table_status_values" BEFORE INSERT OR UPDATE OF "status" ON "public"."restaurant_tables" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_pos_status_values"();



CREATE OR REPLACE TRIGGER "trg_order_items_updated_at" BEFORE UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_product_option_groups_updated_at" BEFORE UPDATE ON "public"."product_option_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_product_options_updated_at" BEFORE UPDATE ON "public"."product_options" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_record_order_status_change" AFTER INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."record_order_status_change"();



CREATE OR REPLACE TRIGGER "trg_restaurant_tables_updated_at" BEFORE UPDATE ON "public"."restaurant_tables" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_roles_updated_at" BEFORE UPDATE ON "public"."roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_sync_pos_bill_payment_status" AFTER INSERT OR DELETE OR UPDATE OF "paid_amount", "status" ON "public"."order_bills" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pos_bill_payment_status"();



CREATE OR REPLACE TRIGGER "trg_sync_pos_kitchen_batch_status" AFTER UPDATE OF "item_status" ON "public"."order_items" FOR EACH ROW WHEN (("old"."item_status" IS DISTINCT FROM "new"."item_status")) EXECUTE FUNCTION "public"."sync_pos_kitchen_batch_status"();



CREATE OR REPLACE TRIGGER "trg_sync_restaurant_table_status" AFTER INSERT OR UPDATE OF "status", "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."sync_restaurant_table_status"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."kitchen_order_items"
    ADD CONSTRAINT "kitchen_order_items_kitchen_order_id_fkey" FOREIGN KEY ("kitchen_order_id") REFERENCES "public"."kitchen_orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kitchen_order_items"
    ADD CONSTRAINT "kitchen_order_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."kitchen_orders"
    ADD CONSTRAINT "kitchen_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kitchen_orders"
    ADD CONSTRAINT "kitchen_orders_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_bill_items"
    ADD CONSTRAINT "order_bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."order_bills"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_bill_items"
    ADD CONSTRAINT "order_bill_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_bills"
    ADD CONSTRAINT "order_bills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."order_bills"
    ADD CONSTRAINT "order_bills_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_batches"
    ADD CONSTRAINT "order_item_batches_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_batches"
    ADD CONSTRAINT "order_item_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_item_options"
    ADD CONSTRAINT "order_item_options_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_item_options"
    ADD CONSTRAINT "order_item_options_product_option_id_fkey" FOREIGN KEY ("product_option_id") REFERENCES "public"."product_options"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."order_item_batches"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_submissions"
    ADD CONSTRAINT "order_submissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_submissions"
    ADD CONSTRAINT "order_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_restaurant_table_id_fkey" FOREIGN KEY ("restaurant_table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "public"."order_bills"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "product_option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_options"
    ADD CONSTRAINT "product_options_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "public"."product_option_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."receipts"
    ADD CONSTRAINT "receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."table_activity_logs"
    ADD CONSTRAINT "table_activity_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."table_activity_logs"
    ADD CONSTRAINT "table_activity_logs_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."table_activity_logs"
    ADD CONSTRAINT "table_activity_logs_restaurant_table_id_fkey" FOREIGN KEY ("restaurant_table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE RESTRICT;



CREATE POLICY "active_staff_read_categories" ON "public"."categories" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() IS NOT NULL));



CREATE POLICY "active_staff_read_option_groups" ON "public"."product_option_groups" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() IS NOT NULL));



CREATE POLICY "active_staff_read_order_bill_items" ON "public"."order_bill_items" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'CASHIER'::"text"])));



CREATE POLICY "active_staff_read_order_bills" ON "public"."order_bills" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'CASHIER'::"text"])));



CREATE POLICY "active_staff_read_product_options" ON "public"."product_options" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() IS NOT NULL) AND (("is_available" = true) OR ("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text"])))));



CREATE POLICY "active_staff_read_products" ON "public"."products" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() IS NOT NULL) AND (("status" = true) OR ("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text"])))));



CREATE POLICY "active_staff_read_roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() IS NOT NULL));



CREATE POLICY "admin_full_access_categories" ON "public"."categories" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_kitchen_stations" ON "public"."kitchen_stations" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_product_option_groups" ON "public"."product_option_groups" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_product_options" ON "public"."product_options" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_products" ON "public"."products" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_profiles" ON "public"."profiles" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_restaurant_tables" ON "public"."restaurant_tables" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



CREATE POLICY "admin_full_access_roles" ON "public"."roles" TO "authenticated" USING (("public"."current_pos_role"() = 'ADMIN'::"text")) WITH CHECK (("public"."current_pos_role"() = 'ADMIN'::"text"));



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authorized_staff_read_order_history" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING ("public"."can_read_pos_order"("order_id"));



CREATE POLICY "authorized_staff_read_order_item_options" ON "public"."order_item_options" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."order_items" "oi"
  WHERE (("oi"."id" = "order_item_options"."order_item_id") AND "public"."can_read_pos_order"("oi"."order_id") AND (("public"."current_pos_role"() <> 'KITCHEN'::"text") OR ("oi"."item_status" = ANY (ARRAY['SUBMITTED'::"text", 'PREPARING'::"text", 'READY'::"text"])))))));



CREATE POLICY "authorized_staff_read_order_items" ON "public"."order_items" FOR SELECT TO "authenticated" USING (("public"."can_read_pos_order"("order_id") AND (("public"."current_pos_role"() <> 'KITCHEN'::"text") OR ("item_status" = ANY (ARRAY['SUBMITTED'::"text", 'PREPARING'::"text", 'READY'::"text"])))));



CREATE POLICY "authorized_staff_read_orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ("public"."can_read_pos_order"("id"));



ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_staff_read_payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['MANAGER'::"text", 'CASHIER'::"text"])));



CREATE POLICY "finance_staff_read_receipts" ON "public"."receipts" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'CASHIER'::"text"])));



CREATE POLICY "finance_staff_read_refunds" ON "public"."refunds" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'CASHIER'::"text"])));



CREATE POLICY "front_of_house_read_order_submissions" ON "public"."order_submissions" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'WAITER'::"text", 'CASHIER'::"text"])) AND "public"."can_read_pos_order"("order_id")));



CREATE POLICY "front_of_house_read_table_activity" ON "public"."table_activity_logs" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'WAITER'::"text"])));



ALTER TABLE "public"."kitchen_order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kitchen_orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kitchen_roles_read_kitchen_items" ON "public"."kitchen_order_items" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'KITCHEN'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."kitchen_orders" "ko"
  WHERE (("ko"."id" = "kitchen_order_items"."kitchen_order_id") AND "public"."can_read_pos_order"("ko"."order_id"))))));



CREATE POLICY "kitchen_roles_read_kitchen_orders" ON "public"."kitchen_orders" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'KITCHEN'::"text"])) AND "public"."can_read_pos_order"("order_id")));



CREATE POLICY "kitchen_roles_read_stations" ON "public"."kitchen_stations" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['MANAGER'::"text", 'KITCHEN'::"text"])));



ALTER TABLE "public"."kitchen_stations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "management_read_audit_logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text"])));



CREATE POLICY "managers_manage_categories" ON "public"."categories" TO "authenticated" USING (("public"."current_pos_role"() = 'MANAGER'::"text")) WITH CHECK (("public"."current_pos_role"() = 'MANAGER'::"text"));



CREATE POLICY "managers_manage_option_groups" ON "public"."product_option_groups" TO "authenticated" USING (("public"."current_pos_role"() = 'MANAGER'::"text")) WITH CHECK (("public"."current_pos_role"() = 'MANAGER'::"text"));



CREATE POLICY "managers_manage_product_options" ON "public"."product_options" TO "authenticated" USING (("public"."current_pos_role"() = 'MANAGER'::"text")) WITH CHECK (("public"."current_pos_role"() = 'MANAGER'::"text"));



CREATE POLICY "managers_manage_products" ON "public"."products" TO "authenticated" USING (("public"."current_pos_role"() = 'MANAGER'::"text")) WITH CHECK (("public"."current_pos_role"() = 'MANAGER'::"text"));



CREATE POLICY "operational_staff_read_order_batches" ON "public"."order_item_batches" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() = ANY (ARRAY['ADMIN'::"text", 'MANAGER'::"text", 'WAITER'::"text", 'KITCHEN'::"text", 'CASHIER'::"text"])) AND "public"."can_read_pos_order"("order_id")));



CREATE POLICY "operational_staff_read_tables" ON "public"."restaurant_tables" FOR SELECT TO "authenticated" USING ((("public"."current_pos_role"() = ANY (ARRAY['MANAGER'::"text", 'WAITER'::"text", 'KITCHEN'::"text", 'CASHIER'::"text"])) AND (("is_active" = true) OR ("public"."current_pos_role"() = 'MANAGER'::"text"))));



ALTER TABLE "public"."order_bill_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_bills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_item_batches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_item_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pos_business_number_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_option_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restaurant_tables" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "staff_read_own_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) AND ("public"."current_pos_role"() IS NOT NULL)));



CREATE POLICY "staff_update_own_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) AND ("public"."current_pos_role"() IS NOT NULL))) WITH CHECK ((("id" = "auth"."uid"()) AND ("public"."current_pos_role"() IS NOT NULL)));



ALTER TABLE "public"."table_activity_logs" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."categories";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_item_batches";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."products";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."restaurant_tables";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."table_activity_logs";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































REVOKE ALL ON FUNCTION "public"."append_pos_order_items"("p_order_id" "uuid", "p_items" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."append_pos_order_items"("p_order_id" "uuid", "p_items" "jsonb", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."assign_pos_kitchen_batch_no"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."assign_pos_master_code"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."assign_pos_transaction_number"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."can_read_pos_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_read_pos_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_payment"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_pos_bill_payment"("p_bill_id" "uuid", "p_payments" "jsonb", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_pos_bill_payment"("p_bill_id" "uuid", "p_payments" "jsonb", "p_idempotency_key" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."restaurant_tables" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."restaurant_tables" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_takeaway_payment_and_submit"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_takeaway_payment_and_submit"("p_order_id" "uuid", "p_payment_method" "text", "p_final_amount" numeric, "p_idempotency_key" "text", "p_provider" "text", "p_transaction_reference" "text", "p_received_amount" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."confirm_pos_payment"("p_payment_id" "uuid", "p_provider" "text", "p_transaction_reference" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_pos_bill_split"("p_order_id" "uuid", "p_mode" "text", "p_bill_count" integer, "p_assignments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_pos_bill_split"("p_order_id" "uuid", "p_mode" "text", "p_bill_count" integer, "p_assignments" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_pos_draft"("p_dining_mode" "text", "p_table_id" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_pos_draft"("p_dining_mode" "text", "p_table_id" "uuid", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_pos_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_pos_order_unbound"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."current_pos_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_pos_role"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."enforce_paid_payment_role"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."enforce_takeaway_order_item_service_mode"() FROM PUBLIC;



GRANT ALL ON TABLE "public"."order_item_batches" TO "service_role";
GRANT SELECT ON TABLE "public"."order_item_batches" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ensure_initial_pos_kitchen_batch"("p_order_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;



GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";



GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT SELECT ON TABLE "public"."payments" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."daily_sales_report" TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_daily_sales_report"("p_date_from" "date", "p_date_to" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_daily_sales_report"("p_date_from" "date", "p_date_to" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guard_active_pos_write"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."guard_order_idempotency_fingerprint"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."guard_pos_order_payment_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."guard_profile_privilege_fields"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_pos_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_pos_user"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."issue_paid_order_receipt"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."log_table_activity"("p_table_id" "uuid", "p_order_id" "uuid", "p_action" "text", "p_from_status" "text", "p_to_status" "text", "p_operation_key" "text", "p_metadata" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."move_pos_order"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_pos_order"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."move_pos_order_unbound"("p_order_id" "uuid", "p_destination_table_id" "uuid", "p_operation_key" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."next_pos_business_number"("p_prefix" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."normalize_pos_status_values"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."normalize_pos_table_number"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."place_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."place_order"("p_items" "jsonb", "p_payment_method" "text", "p_dining_mode" "text", "p_table_id" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ready_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ready_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."recalculate_pos_order"("p_order_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."record_order_status_change"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."refund_pos_order"("p_order_id" "uuid", "p_reason" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refund_pos_order"("p_order_id" "uuid", "p_reason" "text", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."replace_pos_draft_items"("p_order_id" "uuid", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_pos_draft_items"("p_order_id" "uuid", "p_items" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."restore_pos_table"("p_table_id" "uuid", "p_operation_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_pos_table"("p_table_id" "uuid", "p_operation_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."serve_ready_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."serve_ready_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_pos_payment_method"("p_payment_id" "uuid", "p_payment_method" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."set_table_out_of_service"("p_table_id" "uuid", "p_reason" "text", "p_operation_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_table_out_of_service"("p_table_id" "uuid", "p_reason" "text", "p_operation_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_takeaway_packaging"("p_order_id" "uuid", "p_packaging" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_takeaway_packaging"("p_order_id" "uuid", "p_packaging" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."split_pos_order_charges"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."start_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_kitchen_batch"("p_order_id" "uuid", "p_batch_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."start_kitchen_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_kitchen_order"("p_order_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."start_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."start_table_cleaning"("p_table_id" "uuid", "p_operation_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_pos_order"("p_order_id" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_pos_order"("p_order_id" "uuid", "p_idempotency_key" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."sync_pos_bill_payment_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_pos_kitchen_batch_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_profile_role_name_and_id"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."sync_restaurant_table_status"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."transition_pos_order"("p_order_id" "uuid", "p_new_status" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_pos_order"("p_order_id" "uuid", "p_new_status" "text", "p_notes" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transition_restaurant_table"("p_table_id" "uuid", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_restaurant_table"("p_table_id" "uuid", "p_new_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."write_pos_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_reason" "text", "p_metadata" "jsonb") FROM PUBLIC;


















GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."categories" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."categories" TO "authenticated";



GRANT ALL ON TABLE "public"."kitchen_order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."kitchen_order_items" TO "authenticated";



GRANT ALL ON TABLE "public"."kitchen_orders" TO "service_role";
GRANT SELECT ON TABLE "public"."kitchen_orders" TO "authenticated";



GRANT ALL ON TABLE "public"."kitchen_stations" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."kitchen_stations" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_bill_items" TO "service_role";
GRANT SELECT ON TABLE "public"."order_bill_items" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."order_bills" TO "service_role";
GRANT SELECT ON TABLE "public"."order_bills" TO "authenticated";



GRANT ALL ON TABLE "public"."order_item_options" TO "service_role";
GRANT SELECT ON TABLE "public"."order_item_options" TO "authenticated";



GRANT ALL ON TABLE "public"."order_items" TO "service_role";
GRANT SELECT ON TABLE "public"."order_items" TO "authenticated";



GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";
GRANT SELECT ON TABLE "public"."order_status_history" TO "authenticated";



GRANT ALL ON TABLE "public"."order_submissions" TO "service_role";
GRANT SELECT ON TABLE "public"."order_submissions" TO "authenticated";



GRANT ALL ON TABLE "public"."pos_business_number_counters" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."pos_category_code_seq" TO "service_role";



GRANT UPDATE ON SEQUENCE "public"."pos_product_code_seq" TO "service_role";



GRANT ALL ON TABLE "public"."product_option_groups" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."product_option_groups" TO "authenticated";



GRANT ALL ON TABLE "public"."product_options" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."product_options" TO "authenticated";



GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."receipts" TO "service_role";
GRANT SELECT ON TABLE "public"."receipts" TO "authenticated";



GRANT ALL ON TABLE "public"."refunds" TO "service_role";
GRANT SELECT ON TABLE "public"."refunds" TO "authenticated";



GRANT ALL ON TABLE "public"."roles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."roles" TO "authenticated";



GRANT ALL ON TABLE "public"."table_activity_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."table_activity_logs" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";































