SET local check_function_bodies = off;

ALTER TABLE "public"."profiles"
  DROP CONSTRAINT "profiles_auth_user_fkey";

ALTER TABLE "public"."api_rate_limit_windows"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."einvoice_consolidation_items"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."einvoice_document_links"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."receipt_number_counters"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."staff_pin_credentials"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::text;

CREATE OR REPLACE FUNCTION public.append_pos_order_items (
  p_order_id        uuid,
  p_items           jsonb,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.apply_voucher_to_order (
  p_order_id uuid,
  p_code     text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare result jsonb; message text;
begin
  begin
    result := public.evaluate_order_discounts(p_order_id,p_code);
    return result || jsonb_build_object('ok',true);
  exception when others then
    message := sqlerrm;
    if message in ('VOUCHER_NOT_FOUND','VOUCHER_INACTIVE','VOUCHER_NOT_ACTIVE_YET','VOUCHER_EXPIRED','VOUCHER_MINIMUM_SPEND','VOUCHER_ORDER_TYPE','VOUCHER_USAGE_LIMIT','VOUCHER_STACKING_CONFLICT','VOUCHER_NO_ELIGIBLE_ITEMS','ORDER_NOT_EDITABLE','INSUFFICIENT_PERMISSION') then
      return jsonb_build_object('ok',false,'code',message);
    end if;
    raise;
  end;
end $function$;

CREATE OR REPLACE FUNCTION public.approve_order_void (
  p_order_id     uuid,
  p_requested_by uuid,
  p_manager_id   uuid,
  p_reason       text
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
declare
  current_order public.orders%rowtype;
  result public.orders%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'INVALID_VOID_REASON'; end if;
  if not exists (select 1 from public.profiles where id = p_requested_by and status = 'ACTIVE') then raise exception 'REQUESTER_UNAVAILABLE'; end if;
  if not exists (select 1 from public.profiles where id = p_manager_id and status = 'ACTIVE' and role_name in ('ADMIN', 'MANAGER')) then raise exception 'MANAGER_UNAVAILABLE'; end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if current_order.status not in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY') then raise exception 'ORDER_CANNOT_BE_VOIDED'; end if;
  perform set_config('app.status_change_notes', left(btrim(p_reason), 500), true);
  update public.orders set status = 'CANCELLED' where id = p_order_id returning * into result;
  update public.order_status_history set changed_by = p_manager_id
   where id = (select id from public.order_status_history where order_id = p_order_id and new_status = 'CANCELLED' order by changed_at desc limit 1);
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, metadata, old_value, new_value)
  values (p_requested_by, 'ORDER_VOIDED', 'ORDER', p_order_id, left(btrim(p_reason), 500),
          jsonb_build_object('approved_by', p_manager_id), to_jsonb(current_order), to_jsonb(result));
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.archive_promotion_admin (
  p_promotion_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare is_used boolean;
begin
  if not public.has_pos_permission('promotion.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select exists(select 1 from public.order_adjustments where promotion_id=p_promotion_id) into is_used;
  if is_used then
    update public.promotions set status='ARCHIVED',updated_at=now(),updated_by=auth.uid() where id=p_promotion_id;
    perform public.write_pos_audit_diff('PROMOTION_ARCHIVED','PROMOTION',p_promotion_id,null,null,jsonb_build_object('reason','referenced_by_order'));
    return jsonb_build_object('action','ARCHIVED','message','Promotion is used in order history and was archived.');
  end if;
  delete from public.promotion_targets where promotion_id=p_promotion_id;
  delete from public.promotions where id=p_promotion_id;
  perform public.write_pos_audit_diff('PROMOTION_DELETED','PROMOTION',p_promotion_id,null,null,'{}'::jsonb);
  return jsonb_build_object('action','DELETED','message','Promotion deleted.');
end $function$;

CREATE OR REPLACE FUNCTION public.assign_manual_payment_confirmation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_provider text;
begin
  if new.status <> 'PAID' or new.payment_method not in ('QR','EWALLET') then return new; end if;
  if TG_OP = 'UPDATE' then
    if old.status = 'PAID' then return new; end if;
  end if;
  if auth.uid() is null or coalesce(public.current_pos_role(),'') not in ('ADMIN','MANAGER','CASHIER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  v_provider := coalesce(nullif(new.provider_id,''),
    case when new.provider='DUITNOW_STATIC_MANUAL' then 'DUITNOW_QR' else upper(btrim(new.provider)) end);
  perform 1 from public.payment_providers where provider_id=v_provider and enabled for share;
  if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE'; end if;
  new.provider_id := v_provider;
  new.confirmed_by := auth.uid();
  new.confirmed_at := coalesce(new.paid_at,now());
  new.confirmation_mode := 'MANUAL';
  new.optional_reference_no := left(nullif(btrim(new.transaction_reference),''),150);
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.assign_order_branch_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.terminal_staff_sessions; cfg jsonb;
begin
 s:=public.require_terminal_staff_session();
 new.branch_id:=s.branch_id; new.terminal_id:=s.terminal_id; new.staff_session_id:=s.id; new.user_id:=s.staff_id;
 if (select terminal_type from public.pos_terminals where id=s.terminal_id)<>'POS' then raise exception 'POS_TERMINAL_REQUIRED'; end if;
 if new.restaurant_table_id is not null and not exists(select 1 from public.restaurant_tables where id=new.restaurant_table_id and branch_id=s.branch_id and is_active) then raise exception 'TABLE_BRANCH_MISMATCH'; end if;
 cfg:=public.effective_branch_settings(s.branch_id);
 if new.dining_mode='dine-in' and coalesce((cfg#>>'{pos,dineInEnabled}')::boolean,true)=false then raise exception 'DINE_IN_DISABLED'; end if;
 if new.dining_mode='takeaway' and coalesce((cfg#>>'{pos,takeawayEnabled}')::boolean,true)=false then raise exception 'TAKEAWAY_DISABLED'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_payment_branch_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.terminal_staff_sessions; order_branch uuid; cfg jsonb;
begin
 s:=public.require_terminal_staff_session();
 select branch_id into order_branch from public.orders where id=new.order_id;
 if order_branch is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 new.branch_id:=order_branch;new.terminal_id:=s.terminal_id;new.staff_session_id:=s.id;new.user_id:=s.staff_id;
 cfg:=public.effective_branch_settings(s.branch_id);
 if new.status in ('PAID','SUCCESS') then
  if (not coalesce((cfg#>>'{pos,partialPaymentEnabled}')::boolean,true) or not coalesce((cfg#>>'{payment,partialPaymentAllowed}')::boolean,true)) and new.amount < (select greatest(o.total-coalesce((select sum(p.amount) from public.payments p where p.order_id=o.id and p.status='PAID' and p.id<>new.id),0),0) from public.orders o where o.id=new.order_id) then raise exception 'PARTIAL_PAYMENT_DISABLED'; end if;
  if new.payment_method='CASH' and not coalesce((cfg#>>'{payment,cashEnabled}')::boolean,true) or new.payment_method='CARD' and not coalesce((cfg#>>'{payment,cardEnabled}')::boolean,true) or new.payment_method='QR' and not coalesce((cfg#>>'{payment,qrEnabled}')::boolean,true) then raise exception 'PAYMENT_METHOD_DISABLED'; end if;
  if coalesce((cfg#>>'{payment,referenceRequired}')::boolean,false) and new.payment_method<>'CASH' and nullif(trim(coalesce(new.optional_reference_no,new.transaction_reference,new.reference)), '') is null then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
  if coalesce(new.split_type,'FULL')<>'FULL' and (not coalesce((cfg#>>'{pos,splitPaymentEnabled}')::boolean,true) or not coalesce((cfg#>>'{payment,splitPaymentEnabled}')::boolean,true)) then raise exception 'SPLIT_PAYMENT_DISABLED'; end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_pos_kitchen_batch_no()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.assign_user_branch (
  p_user_id    uuid,
  p_branch_id  uuid,
  p_is_primary boolean DEFAULT false
)
  RETURNS public.staff_branch_assignments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare result public.staff_branch_assignments; old jsonb;
begin
 if not public.has_pos_permission('user.edit') or not public.can_access_branch(p_branch_id) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and status='ACTIVE') then raise exception 'STAFF_NOT_ACTIVE'; end if;
 if not exists(select 1 from public.branches where id=p_branch_id and status='ACTIVE') then raise exception 'INVALID_BRANCH'; end if;
 select to_jsonb(a) into old from public.staff_branch_assignments a where a.staff_id=p_user_id and a.branch_id=p_branch_id;
 if p_is_primary then update public.staff_branch_assignments set is_primary=false,updated_at=now() where staff_id=p_user_id and is_primary; end if;
 insert into public.staff_branch_assignments(staff_id,branch_id,is_primary,status,assigned_by,assigned_at,removed_at)
 values(p_user_id,p_branch_id,p_is_primary,'ACTIVE',auth.uid(),now(),null)
 on conflict(staff_id,branch_id) do update set is_primary=excluded.is_primary,status='ACTIVE',assigned_by=auth.uid(),assigned_at=coalesce(public.staff_branch_assignments.assigned_at,now()),removed_at=null,updated_at=now()
 returning * into result;
 update public.profiles set branch_id=(select branch_id from public.staff_branch_assignments where staff_id=p_user_id and is_primary and status='ACTIVE' limit 1),updated_at=now() where id=p_user_id;
 perform public.write_pos_audit_diff(case when old is null then 'STAFF_BRANCH_ASSIGNED' when (old->>'status')='INACTIVE' then 'STAFF_BRANCH_ACTIVATED' else 'STAFF_PRIMARY_BRANCH_CHANGED' end,'STAFF_BRANCH_ASSIGNMENT',result.id,null,old,to_jsonb(result));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.can_read_pos_order (
  p_order_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 select exists(select 1 from public.orders o where o.id=p_order_id and public.can_access_branch(o.branch_id) and (public.current_pos_role() in ('ADMIN','MANAGER','WAITER') or public.current_pos_role()='KITCHEN' and (o.status in ('CONFIRMED','PREPARING','READY') or exists(select 1 from public.order_items i where i.order_id=o.id and i.item_status in ('SUBMITTED','PREPARING','READY')))));
$function$;

CREATE OR REPLACE FUNCTION public.complete_payment (
  p_order_id              uuid,
  p_payment_method        text,
  p_final_amount          numeric,
  p_idempotency_key       text,
  p_provider              text,
  p_transaction_reference text,
  p_received_amount       numeric
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.complete_pos_bill_payment (
  p_bill_id         uuid,
  p_payments        jsonb,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare caller_id uuid:=auth.uid(); role_name text; bill public.order_bills%rowtype; branch uuid; payment jsonb; method text; amount numeric(12,2); received numeric(12,2); paid numeric(12,2); remaining numeric(12,2); order_paid boolean;
begin
 select p.role_name into role_name from public.profiles p where p.id=caller_id and p.status='ACTIVE';
 if coalesce(role_name,'') not in ('ADMIN','MANAGER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments)=0 then raise exception 'PAYMENTS_REQUIRED'; end if;
 select * into bill from public.order_bills where id=p_bill_id for update; if not found then raise exception 'BILL_NOT_FOUND'; end if;
 if bill.status='PAID' then raise exception 'BILL_ALREADY_PAID'; end if;
 select branch_id into branch from public.orders where id=bill.order_id; if branch is null then raise exception 'BRANCH_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('bill-payment:'||coalesce(p_idempotency_key,''),0)); paid:=0;
 for payment in select * from jsonb_array_elements(p_payments) loop
  method:=upper(coalesce(payment->>'method','')); amount:=round((payment->>'amount')::numeric,2); received:=round(coalesce((payment->>'receivedAmount')::numeric,amount),2);
  if method not in ('CASH','CARD','QR','EWALLET') or amount<=0 then raise exception 'INVALID_PAYMENT'; end if;
  if method<>'CASH' and amount>bill.total-bill.paid_amount-paid then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
  if method='CASH' and received<amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
  paid:=paid+amount;
  insert into public.payments(order_id,bill_id,user_id,branch_id,payment_method,amount,received_amount,change_amount,reference,status,paid_at,idempotency_key,request_fingerprint)
  values(bill.order_id,bill.id,caller_id,branch,method,amount,received,greatest(received-amount,0),'BILL-'||bill.id::text,'PAID',now(),left(p_idempotency_key||'-'||method||'-'||amount::text,128),md5(bill.id::text||'|'||method||'|'||amount::text));
 end loop;
 remaining:=round(bill.total-bill.paid_amount-paid,2); if remaining<>0 then raise exception 'BILL_BALANCE_REMAINING'; end if;
 update public.order_bills set paid_amount=total,status='PAID',paid_at=now() where id=bill.id;
 select not exists(select 1 from public.order_bills where order_id=bill.order_id and status<>'PAID') into order_paid;
 if order_paid then update public.orders set payment_status='PAID' where id=bill.order_id; end if;
 return jsonb_build_object('billId',bill.id,'paidAmount',bill.total,'remainingAmount',0,'orderPaid',order_paid);
end; $function$;

CREATE OR REPLACE FUNCTION public.complete_takeaway_payment_and_submit (
  p_order_id              uuid,
  p_payment_method        text,
  p_final_amount          numeric,
  p_idempotency_key       text,
  p_provider              text,
  p_transaction_reference text,
  p_received_amount       numeric
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.confirm_pos_payment (
  p_payment_id            uuid,
  p_provider              text,
  p_transaction_reference text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.create_pos_order (
  p_items           jsonb,
  p_payment_method  text,
  p_dining_mode     text,
  p_table_id        text  DEFAULT NULL::text,
  p_idempotency_key text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO 'public'
  AS $function$
  select public.place_order(
    p_items,
    p_payment_method,
    p_dining_mode,
    p_table_id,
    p_idempotency_key
  );
$function$;

CREATE OR REPLACE FUNCTION public.create_pos_order_unbound (
  p_items           jsonb,
  p_payment_method  text,
  p_dining_mode     text,
  p_table_id        text  DEFAULT NULL::text,
  p_idempotency_key text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.current_terminal_staff_session()
  RETURNS public.terminal_staff_sessions
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 select s from public.terminal_staff_sessions s join public.profiles p on p.id=s.staff_id join public.pos_terminals t on t.id=s.terminal_id join public.branches b on b.id=s.branch_id join public.companies c on c.id=b.company_id
 where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid and s.staff_id=auth.uid() and s.status='ACTIVE' and p.status='ACTIVE' and p.branch_id=b.id and t.branch_id=b.id and t.status='ACTIVE' and t.registration_status='REGISTERED' and b.status='ACTIVE' and c.status='ACTIVE';
$function$;

CREATE OR REPLACE FUNCTION public.delete_voucher_admin (
  p_voucher_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare is_used boolean;
begin
  if not public.has_pos_permission('voucher.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select exists(select 1 from public.voucher_redemptions where voucher_id=p_voucher_id)
      or exists(select 1 from public.order_adjustments where voucher_id=p_voucher_id)
    into is_used;
  if is_used then
    update public.vouchers set status='DISABLED',updated_at=now() where id=p_voucher_id;
    perform public.write_pos_audit_diff('VOUCHER_DISABLED','VOUCHER',p_voucher_id,null,null,jsonb_build_object('reason','referenced_by_order'));
    return jsonb_build_object('action','DISABLED','message','Voucher is used in order history and was disabled.');
  end if;
  delete from public.vouchers where id=p_voucher_id;
  perform public.write_pos_audit_diff('VOUCHER_DELETED','VOUCHER',p_voucher_id,null,null,'{}'::jsonb);
  return jsonb_build_object('action','DELETED','message','Voucher deleted.');
end $function$;

CREATE OR REPLACE FUNCTION public.effective_branch_settings (
  p_branch_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 select to_jsonb(s)||b.configuration||jsonb_build_object(
 'currency_code',coalesce(b.currency_code,c.currency_code,s.currency_code),
 'timezone',coalesce(b.timezone,c.timezone,s.timezone),
 'restaurant_info',s.restaurant_info||jsonb_build_object('restaurantName',c.name,'branchName',b.name,'branchCode',b.code,'address',coalesce(b.address,c.address),'phone',coalesce(b.phone,c.phone),'registrationNo',coalesce(b.registration_no,c.registration_no)),
 'receipt_config',s.receipt_config||coalesce(b.configuration->'receipt_config','{}'))
 from public.restaurant_system_settings s cross join public.branches b join public.companies c on c.id=b.company_id where s.id and b.id=p_branch_id;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_paid_payment_role()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is not null
    and new.status = 'PAID'
    and public.current_pos_role() not in ('ADMIN', 'MANAGER', 'CASHIER')
  then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_takeaway_order_item_service_mode()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if exists (
    select 1 from public.orders
    where id = new.order_id and dining_mode = 'takeaway'
  ) then
    new.service_mode := 'TAKEAWAY';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_initial_pos_kitchen_batch (
  p_order_id uuid,
  p_user_id  uuid
)
  RETURNS public.order_item_batches
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.finalize_order_voucher_redemption()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v public.vouchers%rowtype; a public.order_adjustments%rowtype;
begin
  if new.payment_status<>'PAID' or old.payment_status='PAID' or new.voucher_id is null then return new; end if;
  select * into v from public.vouchers where id=new.voucher_id for update;
  select * into a from public.order_adjustments where order_id=new.id and voucher_id=new.voucher_id and status='APPLIED' order by created_at desc limit 1;
  if not found or v.status<>'ACTIVE' or (v.usage_limit is not null and v.usage_count>=v.usage_limit) then raise exception 'VOUCHER_REDEMPTION_UNAVAILABLE'; end if;
  update public.vouchers set usage_count=usage_count+1,status=case when usage_limit is not null and usage_count+1>=usage_limit then 'REDEEMED' else status end,updated_at=now() where id=v.id;
  insert into public.voucher_redemptions(voucher_id,order_id,staff_id,amount,idempotency_key,status,snapshot,finalized_at)
  values(v.id,new.id,auth.uid(),a.amount,'final:'||new.id,'REDEEMED',a.snapshot,now()) on conflict(voucher_id,order_id) do nothing;
  update public.order_adjustments set status='REDEEMED' where id=a.id;
  perform public.write_pos_audit_diff('VOUCHER_REDEEMED','VOUCHER',v.id,null,null,jsonb_build_object('orderId',new.id,'amount',a.amount));
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.get_available_vouchers (
  p_order_id uuid,
  p_search   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare o public.orders%rowtype;
begin
  if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into o from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) - 'usage_count' order by v.expires_at)
    from public.vouchers v
    where v.status='ACTIVE' and now() between v.starts_at and v.expires_at
      and (p_search is null or v.code ilike '%'||p_search||'%' or v.name ilike '%'||p_search||'%')
      and o.subtotal >= coalesce(v.min_spend,0)
      and (v.usage_limit is null or v.usage_count < v.usage_limit)
      and (v.order_type is null or replace(upper(v.order_type),'-','_')=replace(upper(case when o.dining_mode='dine-in' then 'DINE_IN' else 'TAKEAWAY' end),'-','_'))), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.get_branch_management (
  p_branch_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare b public.branches; settings jsonb;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission('branch.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id; if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
 settings:=public.effective_branch_settings(b.id);
 return jsonb_build_object('branch',to_jsonb(b),'company',(select to_jsonb(c) from public.companies c where c.id=b.company_id),'settings',settings,'activeTerminalCount',(select count(*) from public.pos_terminals where branch_id=b.id and status='ACTIVE'),'activeStaffCount',(select count(*) from public.staff_branch_assignments a join public.profiles p on p.id=a.staff_id where a.branch_id=b.id and a.status='ACTIVE' and p.status='ACTIVE'),'terminals',(select coalesce(jsonb_agg(to_jsonb(t)-'device_identifier' order by t.terminal_code),'[]') from public.pos_terminals t where t.branch_id=b.id),'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'assignmentId',a.id,'name',p.name,'email',p.email,'role',p.role_name,'status',a.status,'assignmentStatus',a.status,'isPrimary',a.is_primary,'branchCode',b.code,'branchName',b.name,'assignedAt',a.assigned_at,'removedAt',a.removed_at,'pinStatus',coalesce(sc.status,'SETUP_REQUIRED'),'lastActive',(select max(last_activity_at) from public.terminal_staff_sessions where staff_id=p.id),'currentTerminal',(select t3.terminal_code from public.terminal_staff_sessions ss join public.pos_terminals t3 on t3.id=ss.terminal_id where ss.staff_id=p.id and ss.status in ('ACTIVE','LOCKED') order by ss.started_at desc limit 1),'terminals',(select coalesce(jsonb_agg(jsonb_build_object('code',t2.terminal_code,'name',t2.name,'type',t2.terminal_type,'status',t2.status) order by t2.terminal_code),'[]') from public.pos_terminals t2 left join public.terminal_staff_access tsa on tsa.terminal_id=t2.id and tsa.staff_id=p.id where t2.branch_id=b.id and (t2.access_mode='ALL_BRANCH_STAFF' or (t2.access_mode='ROLE_RESTRICTED' and p.role_name=any(t2.allowed_roles)) or tsa.staff_id is not null))) order by p.name),'[]') from public.staff_branch_assignments a join public.profiles p on p.id=a.staff_id left join public.staff_pin_credentials sc on sc.user_id=p.id where a.branch_id=b.id),'tables',(select coalesce(jsonb_agg(to_jsonb(t) order by t.table_number),'[]') from public.restaurant_tables t where t.branch_id=b.id),'openOrders',(select count(*) from public.orders where branch_id=b.id and status not in ('COMPLETED','CANCELLED') and payment_status<>'PAID'),'todayOrders',(select count(*) from public.orders where branch_id=b.id and (created_at at time zone (settings->>'timezone'))::date=(now() at time zone (settings->>'timezone'))::date),'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select * from public.audit_logs where branch_id=b.id and public.has_pos_permission('audit.view') order by created_at desc limit 50) a));
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
  RETURNS text[]
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 select coalesce(array_agg(p.code order by p.code),'{}') from public.permissions p where public.has_pos_permission(p.code);
$function$;

CREATE OR REPLACE FUNCTION public.get_order_vouchers (
  p_order_id uuid,
  p_search   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare o public.orders%rowtype; v public.vouchers%rowtype; result jsonb := '[]'::jsonb; s text; eligible boolean;
begin
  if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into o from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  for v in select * from public.vouchers where (branch_id is null or branch_id=o.branch_id) and (p_search is null or code ilike '%'||p_search||'%' or name ilike '%'||p_search||'%') order by status='ACTIVE' desc, expires_at loop
    s := case when v.status <> 'ACTIVE' then 'DISABLED' when now() < v.starts_at then 'NOT_STARTED' when now() >= v.expires_at then 'EXPIRED' when v.usage_limit is not null and v.usage_count >= v.usage_limit then 'USAGE_LIMIT_REACHED' when o.subtotal < coalesce(v.min_spend,0) then 'MINIMUM_SPEND_NOT_REACHED' when v.order_type is not null and replace(upper(v.order_type),'-','_') <> replace(upper(case when o.dining_mode='dine-in' then 'DINE_IN' else 'TAKEAWAY' end),'-','_') then 'ORDER_TYPE_NOT_ALLOWED' else 'AVAILABLE' end;
    result := result || jsonb_build_array(jsonb_build_object('id',v.id,'code',v.code,'name',v.name,'description',v.description,'customer_description',v.customer_description,'voucher_type',v.voucher_type,'value',v.value,'min_spend',v.min_spend,'max_discount',v.max_discount,'starts_at',v.starts_at,'expires_at',v.expires_at,'status',s,'statusLabel',case s when 'AVAILABLE' then 'Available' when 'MINIMUM_SPEND_NOT_REACHED' then 'Minimum spend not reached' when 'EXPIRED' then 'Expired' when 'USAGE_LIMIT_REACHED' then 'Usage limit reached' when 'NOT_STARTED' then 'Not started' when 'ORDER_TYPE_NOT_ALLOWED' then 'Order type not allowed' else 'Disabled' end));
  end loop;
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_payment_report_v1 (
  p_date_from date,
  p_date_to   date
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public'
  AS $function$
declare from_at timestamptz;to_at timestamptz;rows jsonb;
begin
 if not public.has_pos_permission('report.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 from_at:=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur';to_at:=(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur';
 select coalesce(jsonb_agg(to_jsonb(item) order by item.payment_at desc),'[]'::jsonb)into rows from(
  select payment.id payment_id,payment.payment_number,orders.order_number,receipt.receipt_number,coalesce(payment.paid_at,payment.created_at) payment_at,payment.payment_method,
   case when payment.payment_method='QR' then payment.qr_scheme end qr_scheme,case when payment.payment_method='QR' then payment.qr_mode end qr_mode,payment.amount payment_amount,payment.status payment_status,
   coalesce(payment.transaction_reference,payment.reference) transaction_reference,cashier.name cashier,confirmed.name confirmed_by,payment.confirmed_at,payment.confirmation_mode,coalesce(refunded.refunded_amount,0)refunded_amount
  from public.payments payment join public.orders orders on orders.id=payment.order_id left join public.receipts receipt on receipt.order_id=orders.id left join public.profiles cashier on cashier.id=payment.user_id left join public.profiles confirmed on confirmed.id=payment.confirmed_by left join lateral(select sum(refund.amount)refunded_amount from public.refunds refund where refund.payment_id=payment.id and refund.status='COMPLETED')refunded on true
  where coalesce(payment.paid_at,payment.created_at)>=from_at and coalesce(payment.paid_at,payment.created_at)<to_at
 )item;return rows;
end;$function$;

CREATE OR REPLACE FUNCTION public.get_pos_display_settings()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s jsonb; branch uuid;
begin
 if not public.is_active_pos_user() then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 branch:=coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()));
 s:=public.effective_branch_settings(branch);
 return jsonb_build_object('restaurantInfo',s->'restaurant_info','logoPath',s->'logo_path','receiptConfig',s->'receipt_config','timezone',s->'timezone','currencyCode',s->'currency_code','currencySymbol',s->'currency_symbol','decimalPlaces',s->'decimal_places','defaultLanguage',s->'default_language','enabledLanguages',s->'enabled_languages','pos',s->'pos','payment',s->'payment');
end $function$;

CREATE OR REPLACE FUNCTION public.guard_active_pos_write()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  if auth.uid() is not null and not public.is_active_pos_user() then
    raise exception 'An active staff profile is required';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_order_branch_mutation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.terminal_staff_sessions;
begin
 if auth.uid() is null then return new; end if;
 s:=public.require_terminal_staff_session();
 if old.branch_id is distinct from s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 if new.branch_id is distinct from old.branch_id or new.terminal_id is distinct from old.terminal_id or new.staff_session_id is distinct from old.staff_session_id or new.user_id is distinct from old.user_id then raise exception 'ORDER_CONTEXT_IMMUTABLE'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_order_idempotency_fingerprint()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if new.idempotency_key is not null then
    new.idempotency_fingerprint := nullif(current_setting('app.order_idempotency_fingerprint', true), '');
    if new.idempotency_fingerprint is null then
      raise exception 'IDEMPOTENCY_FINGERPRINT_REQUIRED';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_table_branch_context()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
 if tg_op='UPDATE' and new.branch_id is distinct from old.branch_id then raise exception 'TABLE_BRANCH_IMMUTABLE'; end if;
 if new.branch_id is null then select branch_id into new.branch_id from public.profiles where id=auth.uid(); end if;
 if new.branch_id is null then raise exception 'BRANCH_REQUIRED'; end if;
 if auth.uid() is not null and not public.can_access_branch(new.branch_id) then raise exception 'TABLE_BRANCH_MISMATCH'; end if;
 if tg_op='INSERT' and not exists(select 1 from public.branches where id=new.branch_id and status='ACTIVE') then raise exception 'BRANCH_INACTIVE'; end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.has_pos_permission (
  p_permission text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 select exists(select 1 from public.profiles p join public.role_permissions rp on rp.role_id=p.role_id join public.permissions pm on pm.id=rp.permission_id
 where p.id=auth.uid() and p.status='ACTIVE' and pm.code=p_permission and (
 not exists(select 1 from public.terminal_staff_sessions s where s.auth_session_id=nullif(auth.jwt()->>'session_id','')::uuid)
 or (public.current_terminal_staff_session()).id is not null and p_permission not like 'company.%' and p_permission not like 'branch.%' and p_permission not like 'terminal.%' and p_permission not like 'user.%' and p_permission not like 'role.%' and p_permission not like 'settings.%'));
$function$;

CREATE OR REPLACE FUNCTION public.invalidate_changed_staff_sessions()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
 if old.status is distinct from new.status or old.role_id is distinct from new.role_id or old.branch_id is distinct from new.branch_id then
  update public.terminal_staff_sessions set status='ENDED',ended_at=now() where staff_id=new.id and status in ('ACTIVE','LOCKED');
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.log_table_activity (
  p_table_id      uuid,
  p_order_id      uuid,
  p_action        text,
  p_from_status   text,
  p_to_status     text,
  p_operation_key text  DEFAULT NULL::text,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.move_pos_order (
  p_order_id             uuid,
  p_destination_table_id uuid,
  p_operation_key        text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.move_pos_order (
  p_order_id                 uuid,
  p_destination_table_id     uuid,
  p_operation_key            text,
  p_expected_source_table_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.move_pos_order_unbound (
  p_order_id             uuid,
  p_destination_table_id uuid,
  p_operation_key        text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.next_pos_business_number (
  p_prefix text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_code text := upper(btrim(p_prefix));
  v_settings public.numbering_settings%rowtype;
  v_system public.restaurant_system_settings%rowtype;
  v_date date;
  v_period text;
  v_next bigint;
  v_date_part text;
  v_branch text;
begin
  select * into v_system from jsonb_populate_record(null::public.restaurant_system_settings,public.effective_branch_settings(coalesce((public.current_terminal_staff_session()).branch_id,(select branch_id from public.profiles where id=auth.uid()))));
  v_date := (clock_timestamp() at time zone coalesce(v_system.timezone,'Asia/Kuala_Lumpur'))::date;
  if v_code = 'KB' then
    insert into public.pos_business_number_counters(prefix,business_date,last_value)
    values ('KB',v_date,1)
    on conflict(prefix,business_date) do update
      set last_value=public.pos_business_number_counters.last_value+1
    returning last_value into v_next;
    if v_next > 999999 then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
    return 'KB-'||to_char(v_date,'YYYYMMDD')||'-'||lpad(v_next::text,6,'0');
  end if;
  select * into v_settings from public.numbering_settings where entity_code=v_code;
  if not found then raise exception 'INVALID_BUSINESS_NUMBER_PREFIX'; end if;
  v_branch := upper(regexp_replace(coalesce(nullif(v_system.restaurant_info->>'branchCode',''),'MAIN'),'[^A-Z0-9]','','g'));
  v_period := case v_settings.reset_frequency when 'NEVER' then 'ALL' when 'MONTHLY' then to_char(v_date,'YYYYMM') when 'YEARLY' then to_char(v_date,'YYYY') else to_char(v_date,'YYYYMMDD') end;
  insert into public.configurable_number_counters(entity_code,branch_code,period_key,last_value)
  values(v_code,v_branch,v_period,1)
  on conflict(entity_code,branch_code,period_key) do update
    set last_value=public.configurable_number_counters.last_value+1
  returning last_value into v_next;
  if length(v_next::text)>v_settings.sequence_padding then raise exception 'BUSINESS_NUMBER_EXHAUSTED'; end if;
  v_date_part := case v_settings.date_format when 'YYMMDD' then to_char(v_date,'YYMMDD') when 'YYYY-MM' then to_char(v_date,'YYYY-MM') else to_char(v_date,'YYYYMMDD') end;
  return v_settings.prefix||'-'||v_branch||'-'||v_date_part||'-'||lpad(v_next::text,v_settings.sequence_padding,'0');
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_pos_status_values()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.place_order (
  p_items           jsonb,
  p_payment_method  text,
  p_dining_mode     text,
  p_table_id        text  DEFAULT NULL::text,
  p_idempotency_key text  DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.process_pos_split_payment (
  p_order_id              uuid,
  p_split_type            text,
  p_payment_method        text,
  p_amount                numeric,
  p_received_amount       numeric,
  p_item_allocations      jsonb,
  p_bill_id               uuid,
  p_idempotency_key       text,
  p_provider              text    DEFAULT NULL::text,
  p_transaction_reference text    DEFAULT NULL::text,
  p_provider_id           text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare method text:=upper(btrim(coalesce(p_payment_method,'')));provider_key text:=upper(btrim(coalesce(p_provider_id,'')));result jsonb;payment_id uuid;patched public.payments%rowtype;
begin
 if method='E_WALLET' then method:='EWALLET';end if;
 if method in('QR','EWALLET') then
  if provider_key='' then raise exception 'PAYMENT_PROVIDER_REQUIRED';end if;
  perform 1 from public.payment_providers where provider_id=provider_key and enabled=true;
  if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE';end if;
 end if;
 result:=public.process_pos_split_payment_core(p_order_id,p_split_type,method,p_amount,p_received_amount,p_item_allocations,p_bill_id,p_idempotency_key,coalesce(nullif(provider_key,''),p_provider),p_transaction_reference);
 payment_id:=(result->'payment'->>'id')::uuid;
 update public.payments set provider_id=nullif(provider_key,''),confirmed_by=auth.uid(),confirmed_at=coalesce(paid_at,now()),optional_reference_no=left(nullif(btrim(coalesce(p_transaction_reference,'')),''),150) where id=payment_id returning * into patched;
 return jsonb_set(jsonb_set(result,'{payment}',to_jsonb(patched),true),'{summary}',public.get_pos_payment_summary(p_order_id),true);
end;$function$;

CREATE OR REPLACE FUNCTION public.recalculate_pos_order (
  p_order_id uuid
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.record_order_status_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.redeem_voucher (
  p_voucher_id      uuid,
  p_order_id        uuid,
  p_amount          numeric,
  p_idempotency_key text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  raise exception 'VOUCHER_REDEMPTION_AT_PAYMENT_ONLY';
end $function$;

CREATE OR REPLACE FUNCTION public.replace_pos_draft_items (
  p_order_id uuid,
  p_items    jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.require_terminal_staff_session()
  RETURNS public.terminal_staff_sessions
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare s public.terminal_staff_sessions;
begin s:=public.current_terminal_staff_session(); if s.id is null then raise exception 'ACTIVE_STAFF_SESSION_REQUIRED'; end if; return s; end $function$;

CREATE OR REPLACE FUNCTION public.restore_pos_table (
  p_table_id      uuid,
  p_operation_key text DEFAULT NULL::text
)
  RETURNS public.restaurant_tables
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_branch_configuration (
  p_branch_id         uuid,
  p_patch             jsonb,
  p_expected_revision bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare b public.branches; k text; v jsonb; next_config jsonb;
begin
 if not public.can_access_branch(p_branch_id) or not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into b from public.branches where id=p_branch_id for update;
 if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
 if b.revision is distinct from p_expected_revision then raise exception 'CONFIGURATION_CHANGED'; end if;
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'INVALID_CONFIGURATION'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if not k=any(array['tax_enabled','tax_name','tax_rate','tax_mode','service_charge_enabled','service_charge_name','service_charge_rate','service_charge_order_types','rounding_rule','receipt_config','pos','payment','kitchen','business_hours']) then raise exception 'UNKNOWN_CONFIGURATION_FIELD: %',k; end if;
  if v='null'::jsonb then continue; end if;
  if k in ('tax_rate','service_charge_rate') and (jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 0 and 100) then raise exception 'INVALID_RATE'; end if;
  if k in ('tax_enabled','service_charge_enabled') and jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_BOOLEAN'; end if;
  if k='tax_mode' and (v#>>'{}') not in ('INCLUSIVE','EXCLUSIVE') then raise exception 'INVALID_TAX_MODE'; end if;
  if k='rounding_rule' and (v#>>'{}') not in ('NONE','0.05','0.10') then raise exception 'INVALID_ROUNDING_RULE'; end if;
  if k='service_charge_order_types' and (jsonb_typeof(v)<>'array' or exists(select 1 from jsonb_array_elements_text(v) x where x not in ('DINE_IN','TAKEAWAY'))) then raise exception 'INVALID_ORDER_TYPE'; end if;
  if k in ('receipt_config','pos','payment','kitchen') and jsonb_typeof(v)<>'object' then raise exception 'INVALID_CONFIGURATION'; end if;
 end loop;
 next_config:=jsonb_strip_nulls(b.configuration||p_patch);
 -- Type-check the operational switches on the server before accepting them.
 for k,v in select * from jsonb_each(coalesce(next_config->'pos','{}')) loop
  if k='idleTimeoutMinutes' then
   if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 1 and 120 then raise exception 'INVALID_IDLE_TIMEOUT'; end if;
  elsif k='defaultOrderType' then
   if (v#>>'{}') not in ('DINE_IN','TAKEAWAY') then raise exception 'INVALID_ORDER_TYPE'; end if;
  elsif k in ('dineInEnabled','takeawayEnabled','splitPaymentEnabled','partialPaymentEnabled','voucherEnabled','promotionEnabled','autoLockEnabled') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_BOOLEAN'; end if;
  else raise exception 'UNKNOWN_POS_SETTING'; end if;
 end loop;
 for k,v in select * from jsonb_each(coalesce(next_config->'payment','{}')) loop
  if k not in ('cashEnabled','cardEnabled','qrEnabled','referenceRequired','partialPaymentAllowed','splitPaymentEnabled') or jsonb_typeof(v)<>'boolean' then raise exception 'INVALID_PAYMENT_SETTING'; end if;
 end loop;
 update public.branches set configuration=next_config,revision=revision+1,updated_at=now() where id=b.id;
 perform public.write_pos_audit_diff('BRANCH_CONFIGURATION_UPDATED','BRANCH',b.id,null,b.configuration,next_config);
 return public.get_branch_management(b.id);
end $function$;

CREATE OR REPLACE FUNCTION public.save_terminal_access (
  p_terminal_id   uuid,
  p_access_mode   text,
  p_allowed_roles text[],
  p_staff_ids     uuid[]
)
  RETURNS public.pos_terminals
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare t public.pos_terminals; mode text:=upper(trim(p_access_mode)); role_list text[]:=coalesce(p_allowed_roles,array[]::text[]);
begin
  if not public.has_pos_permission('terminal.update') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into t from public.pos_terminals where id=p_terminal_id for update;
  if not found or not public.can_access_branch(t.branch_id) then raise exception 'TERMINAL_NOT_FOUND'; end if;
  if mode not in ('ALL_BRANCH_STAFF','ROLE_RESTRICTED','STAFF_RESTRICTED') then raise exception 'INVALID_TERMINAL_ACCESS_MODE'; end if;
  if exists(select 1 from unnest(role_list) r where r not in ('ADMIN','MANAGER','WAITER','KITCHEN','CASHIER')) then raise exception 'INVALID_TERMINAL_ROLE'; end if;
  if mode='ROLE_RESTRICTED' and cardinality(role_list)=0 then raise exception 'TERMINAL_ROLE_REQUIRED'; end if;
  if mode='STAFF_RESTRICTED' and cardinality(coalesce(p_staff_ids,array[]::uuid[]))=0 then raise exception 'TERMINAL_STAFF_REQUIRED'; end if;
  if exists(select 1 from public.profiles p where p.id=any(coalesce(p_staff_ids,array[]::uuid[])) and (p.branch_id<>t.branch_id or p.status<>'ACTIVE')) then raise exception 'STAFF_BRANCH_ACCESS_DENIED'; end if;
  update public.pos_terminals set access_mode=mode,allowed_roles=role_list,updated_at=now() where id=t.id returning * into t;
  delete from public.terminal_staff_access where terminal_id=t.id;
  if mode='STAFF_RESTRICTED' then insert into public.terminal_staff_access(terminal_id,staff_id) select t.id,unnest(p_staff_ids); end if;
  perform public.write_pos_audit_diff('TERMINAL_ACCESS_UPDATED','TERMINAL',t.id,null,null,jsonb_build_object('accessMode',mode,'allowedRoles',role_list,'staffCount',cardinality(coalesce(p_staff_ids,array[]::uuid[]))));
  return t;
end $function$;

CREATE OR REPLACE FUNCTION public.serve_ready_order (
  p_order_id uuid
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_pos_payment_method (
  p_payment_id     uuid,
  p_payment_method text
)
  RETURNS public.payments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_primary_staff_branch (
  p_assignment_id uuid
)
  RETURNS public.staff_branch_assignments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare a public.staff_branch_assignments; old jsonb;
begin
 select * into a from public.staff_branch_assignments where id=p_assignment_id for update;
 if not found or a.status<>'ACTIVE' or not public.can_access_branch(a.branch_id) or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 old:=to_jsonb(a); update public.staff_branch_assignments set is_primary=false,updated_at=now() where staff_id=a.staff_id and is_primary; update public.staff_branch_assignments set is_primary=true,updated_at=now() where id=a.id returning * into a; update public.profiles set branch_id=a.branch_id,updated_at=now() where id=a.staff_id; perform public.write_pos_audit_diff('PRIMARY_BRANCH_CHANGED','STAFF_BRANCH_ASSIGNMENT',a.id,null,old,to_jsonb(a)); return a;
end $function$;

CREATE OR REPLACE FUNCTION public.set_staff_branch_assignment_status (
  p_assignment_id uuid,
  p_status        text
)
  RETURNS public.staff_branch_assignments
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare a public.staff_branch_assignments; old jsonb; next_status text:=upper(p_status);
begin
 if next_status not in ('ACTIVE','INACTIVE') then raise exception 'INVALID_ASSIGNMENT_STATUS'; end if;
 select * into a from public.staff_branch_assignments where id=p_assignment_id for update;
 if not found or not public.can_access_branch(a.branch_id) or not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if next_status='ACTIVE' and not exists(select 1 from public.profiles where id=a.staff_id and status='ACTIVE') then raise exception 'STAFF_NOT_ACTIVE'; end if;
 old:=to_jsonb(a); update public.staff_branch_assignments set status=next_status,removed_at=case when next_status='INACTIVE' then now() else null end,updated_at=now() where id=a.id returning * into a;
 if a.is_primary and next_status='INACTIVE' then update public.profiles set branch_id=null,updated_at=now() where id=a.staff_id and branch_id=a.branch_id; end if;
 perform public.write_pos_audit_diff(case when next_status='ACTIVE' then 'STAFF_BRANCH_ACTIVATED' else 'STAFF_BRANCH_REMOVED' end,'STAFF_BRANCH_ASSIGNMENT',a.id,null,old,to_jsonb(a)); return a;
end $function$;

CREATE OR REPLACE FUNCTION public.set_staff_pin (
  p_user_id uuid,
  p_pin     text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
  AS $function$
begin
  if not public.has_pos_permission('user.edit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'INVALID_STAFF_PIN'; end if;
  perform 1 from public.profiles where id = p_user_id and status <> 'MISSING_PROFILE';
  if not found then raise exception 'USER_NOT_FOUND'; end if;

  insert into public.staff_pin_credentials (user_id, pin_hash, changed_by)
  values (p_user_id, crypt(p_pin, gen_salt('bf', 12)), auth.uid())
  on conflict (user_id) do update
  set pin_hash = excluded.pin_hash,
      failed_attempts = 0,
      locked_until = null,
      changed_at = now(),
      changed_by = auth.uid();
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_table_out_of_service (
  p_table_id      uuid,
  p_reason        text DEFAULT NULL::text,
  p_operation_key text DEFAULT NULL::text
)
  RETURNS public.restaurant_tables
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_takeaway_packaging (
  p_order_id  uuid,
  p_packaging text[]
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.split_pos_order_charges()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.start_kitchen_order (
  p_order_id uuid
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.start_table_cleaning (
  p_table_id      uuid,
  p_operation_key text
)
  RETURNS public.restaurant_tables
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_pos_kitchen_batch_status()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_default_branch()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
 if new.default_branch_id is distinct from old.default_branch_id and new.branch_id is not distinct from old.branch_id then new.branch_id:=new.default_branch_id;
 elsif new.branch_id is distinct from old.branch_id and new.default_branch_id is not distinct from old.default_branch_id then new.default_branch_id:=new.branch_id;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_profile_role_name_and_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.transition_pos_order (
  p_order_id   uuid,
  p_new_status text,
  p_notes      text DEFAULT NULL::text
)
  RETURNS public.orders
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.transition_restaurant_table (
  p_table_id   uuid,
  p_new_status text
)
  RETURNS public.restaurant_tables
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_auth_user_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_staff_pin"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_staff_pin"(uuid, text) TO "authenticated", "postgres", "service_role";


REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "anon";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "authenticated";

REVOKE ALL ON FUNCTION "public"."set_staff_pin"(uuid, text) FROM "anon";
