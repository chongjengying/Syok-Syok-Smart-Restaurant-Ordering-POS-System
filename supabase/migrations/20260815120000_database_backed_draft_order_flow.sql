-- Database-backed order drafts, mixed service modes, and idempotent submission.

alter table public.order_items
  add column if not exists service_mode text,
  add column if not exists item_status text,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null,
  add column if not exists voided_at timestamptz;

alter table public.order_items alter column sent_at drop not null;
alter table public.order_item_options
  add column if not exists product_option_id uuid references public.product_options(id) on delete restrict;

update public.order_items oi
set service_mode = case when o.dining_mode = 'takeaway' then 'TAKEAWAY' else 'DINE_IN' end,
    item_status = case o.status
      when 'DRAFT' then 'DRAFT'
      when 'PLACED' then 'SUBMITTED'
      when 'CONFIRMED' then 'SUBMITTED'
      when 'PREPARING' then 'PREPARING'
      when 'READY' then 'READY'
      when 'SERVED' then 'SERVED'
      when 'COMPLETED' then case when o.dining_mode = 'takeaway' then 'COLLECTED' else 'SERVED' end
      else 'VOIDED'
    end
from public.orders o
where o.id = oi.order_id and (oi.service_mode is null or oi.item_status is null);

alter table public.order_items alter column service_mode set default 'DINE_IN';
alter table public.order_items alter column service_mode set not null;
-- Legacy create/add-on RPCs insert submitted items; draft RPCs set DRAFT explicitly.
alter table public.order_items alter column item_status set default 'SUBMITTED';
alter table public.order_items alter column item_status set not null;
alter table public.order_items drop constraint if exists order_items_service_mode_check;
alter table public.order_items add constraint order_items_service_mode_check
  check (service_mode in ('DINE_IN', 'TAKEAWAY'));
alter table public.order_items drop constraint if exists order_items_item_status_check;
alter table public.order_items add constraint order_items_item_status_check
  check (item_status in ('DRAFT', 'SUBMITTED', 'PREPARING', 'READY', 'SERVED', 'COLLECTED', 'VOIDED'));

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('DRAFT', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COLLECTED', 'COMPLETED', 'CANCELLED', 'REFUNDED')
);

drop index if exists public.idx_one_active_order_per_restaurant_table;
create unique index idx_one_active_order_per_restaurant_table
  on public.orders(restaurant_table_id)
  where restaurant_table_id is not null
    and status in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED','COLLECTED');

create table if not exists public.order_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null,
  submitted_item_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
alter table public.order_submissions enable row level security;
drop policy if exists "Active staff can read order submissions" on public.order_submissions;
create policy "Active staff can read order submissions" on public.order_submissions
for select to authenticated using (public.is_active_pos_user());
grant select on public.order_submissions to authenticated;
grant all on public.order_submissions to service_role;

create index if not exists idx_order_items_order_item_status
  on public.order_items(order_id, item_status);

create or replace function public.recalculate_pos_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
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
revoke all on function public.recalculate_pos_order(uuid) from public, authenticated;

create or replace function public.create_pos_draft(
  p_dining_mode text, p_table_id uuid default null, p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
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
    perform 1 from public.restaurant_tables where id=p_table_id and is_active and status in ('AVAILABLE','RESERVED') for update;
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.orders where restaurant_table_id=p_table_id and status in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED','COLLECTED'))
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
revoke all on function public.create_pos_draft(text,uuid,text) from public;
grant execute on function public.create_pos_draft(text,uuid,text) to authenticated;

create or replace function public.replace_pos_draft_items(p_order_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid:=auth.uid(); ord public.orders%rowtype; item jsonb; product public.products%rowtype;
  new_item public.order_items%rowtype; ids jsonb; option_total numeric(12,2); unit numeric(12,2);
  selected_count int; distinct_count int; group_count int; grp record; mode text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>100 then raise exception 'INVALID_ORDER_ITEMS'; end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status not in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED','COLLECTED') then raise exception 'ORDER_NOT_ACTIVE'; end if;
  if ord.payment_status <> 'PENDING' then raise exception 'ORDER_ALREADY_PAID'; end if;
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
$$;
revoke all on function public.replace_pos_draft_items(uuid,jsonb) from public;
grant execute on function public.replace_pos_draft_items(uuid,jsonb) to authenticated;

create or replace function public.submit_pos_order(p_order_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); key text; ord public.orders%rowtype; prior public.order_submissions%rowtype; submitted uuid[];
  draft_item record; grp record; group_count int; option_total numeric(12,2); has_existing boolean; new_batch_id uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  key:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),''); if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||key,0));
  select * into prior from public.order_submissions where user_id=uid and idempotency_key=key;
  if found then if prior.order_id<>p_order_id then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    select * into ord from public.orders where id=p_order_id; return jsonb_build_object('id',ord.id,'status',ord.status,'submittedItemIds',prior.submitted_item_ids); end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status<>'PENDING' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if not exists(select 1 from public.profiles where id=uid and status='ACTIVE' and role_name in ('ADMIN','MANAGER','WAITER','CASHIER')) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  -- Recheck product and option availability at the irreversible kitchen boundary.
  if exists(select 1 from public.order_items oi left join public.products p on p.id=oi.product_id and p.status=true
    where oi.order_id=p_order_id and oi.item_status='DRAFT' and p.id is null) then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if exists(select 1 from public.order_items oi join public.order_item_options oio on oio.order_item_id=oi.id
    left join public.product_options po on po.id=oio.product_option_id and po.is_available
    where oi.order_id=p_order_id and oi.item_status='DRAFT' and po.id is null) then raise exception 'OPTION_NOT_AVAILABLE'; end if;
  for draft_item in
    select oi.*,p.sell_price,p.product_name from public.order_items oi join public.products p on p.id=oi.product_id
    where oi.order_id=p_order_id and oi.item_status='DRAFT' for update of oi
  loop
    for grp in select * from public.product_option_groups where product_id=draft_item.product_id loop
      select count(*) into group_count from public.order_item_options oio
      join public.product_options po on po.id=oio.product_option_id
      where oio.order_item_id=draft_item.id and po.option_group_id=grp.id;
      if group_count<grp.min_selection or group_count>grp.max_selection or (grp.is_required and group_count=0)
        then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if;
    end loop;
    select coalesce(sum(po.price_adjustment),0) into option_total from public.order_item_options oio
    join public.product_options po on po.id=oio.product_option_id where oio.order_item_id=draft_item.id;
    update public.order_items set unit_price=round(draft_item.sell_price+option_total,2),
      subtotal=round((draft_item.sell_price+option_total)*draft_item.quantity,2),product_name_snapshot=draft_item.product_name
    where id=draft_item.id;
    update public.order_item_options oio set option_group_name=pog.name,option_name=po.name,price_adjustment=po.price_adjustment
    from public.product_options po join public.product_option_groups pog on pog.id=po.option_group_id
    where oio.order_item_id=draft_item.id and po.id=oio.product_option_id;
  end loop;
  ord:=public.recalculate_pos_order(p_order_id);
  select exists(select 1 from public.order_items where order_id=p_order_id and item_status not in ('DRAFT','VOIDED')) into has_existing;
  select array_agg(id order by created_at) into submitted from public.order_items where order_id=p_order_id and item_status='DRAFT';
  if submitted is null then raise exception 'NO_DRAFT_ITEMS'; end if;
  if has_existing then
    insert into public.order_item_batches(order_id,user_id,idempotency_key,request_items)
    select p_order_id,uid,key,jsonb_agg(jsonb_build_object('orderItemId',id) order by created_at)
    from public.order_items where id=any(submitted)
    returning id into new_batch_id;
  end if;
  update public.order_items set item_status='SUBMITTED',sent_at=now(),batch_id=new_batch_id where id=any(submitted);
  perform set_config('app.status_change_notes','Submitted to kitchen',true);
  update public.orders set status='PLACED' where id=p_order_id returning * into ord;
  insert into public.order_submissions(order_id,user_id,idempotency_key,submitted_item_ids) values(p_order_id,uid,key,submitted);
  return jsonb_build_object('id',ord.id,'status',ord.status,'submittedItemIds',submitted);
end;
$$;
revoke all on function public.submit_pos_order(uuid,text) from public;
grant execute on function public.submit_pos_order(uuid,text) to authenticated;

create or replace function public.transition_pos_order(p_order_id uuid,p_new_status text,p_notes text default null)
returns public.orders language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; role text; target text:=upper(trim(coalesce(p_new_status,''))); result public.orders%rowtype;
begin
  select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE'; if role is null then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  select * into ord from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if target='CANCELLED' then
    if ord.payment_status='PAID' then raise exception 'PAID_ORDER_CANNOT_BE_CANCELLED'; end if;
    if role not in ('ADMIN','MANAGER') and (ord.user_id<>auth.uid() or ord.status not in ('DRAFT','PLACED')) then raise exception 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'; end if;
    update public.order_items set item_status='VOIDED',void_reason=coalesce(nullif(left(p_notes,1000),''),'Order cancelled'),voided_by=auth.uid(),voided_at=now() where order_id=p_order_id and item_status not in ('SERVED','COLLECTED','VOIDED');
    update public.payments set status='CANCELLED' where order_id=p_order_id and status in ('PENDING','PROCESSING','FAILED');
    update public.orders set status='CANCELLED',payment_status='CANCELLED' where id=p_order_id returning * into result; return result;
  end if;
  if not ((ord.status='PLACED' and target='CONFIRMED') or (ord.status='CONFIRMED' and target='PREPARING') or
          (ord.status='PREPARING' and target='READY') or (ord.status='READY' and target in ('SERVED','COLLECTED')) or
          (ord.status in ('SERVED','COLLECTED') and target='COMPLETED')) then raise exception 'INVALID_ORDER_TRANSITION'; end if;
  if role not in ('ADMIN','MANAGER') then
    if role='KITCHEN' and target not in ('CONFIRMED','PREPARING','READY') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if role='WAITER' and target not in ('SERVED','COLLECTED') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
    if role='CASHIER' and target<>'COMPLETED' then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  end if;
  if target='COLLECTED' and ord.dining_mode<>'takeaway' then raise exception 'INVALID_FULFILLMENT_STATUS'; end if;
  if target='SERVED' and ord.dining_mode<>'dine-in' then raise exception 'INVALID_FULFILLMENT_STATUS'; end if;
  if target='COMPLETED' and ord.payment_status<>'PAID' then raise exception 'PAYMENT_NOT_CONFIRMED'; end if;
  if target='PREPARING' then update public.order_items set item_status='PREPARING' where order_id=p_order_id and item_status='SUBMITTED'; end if;
  if target='READY' then update public.order_items set item_status='READY' where order_id=p_order_id and item_status in ('SUBMITTED','PREPARING'); end if;
  if target in ('SERVED','COLLECTED') then
    update public.order_items set item_status=case when service_mode='TAKEAWAY' then 'COLLECTED' else 'SERVED' end where order_id=p_order_id and item_status='READY';
  end if;
  perform set_config('app.status_change_notes',coalesce(left(p_notes,1000),''),true);
  update public.orders set status=case when target in ('SERVED','COLLECTED') and payment_status='PAID' then 'COMPLETED' else target end
  where id=p_order_id returning * into result; return result;
end;
$$;
revoke all on function public.transition_pos_order(uuid,text,text) from public;
grant execute on function public.transition_pos_order(uuid,text,text) to authenticated;

create or replace function public.confirm_pos_payment(p_payment_id uuid,p_provider text,p_transaction_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare pay public.payments%rowtype; ord public.orders%rowtype; role text;
begin
  select role_name into role from public.profiles where id=auth.uid() and status='ACTIVE';
  if coalesce(role,'') not in ('ADMIN','MANAGER','WAITER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into pay from public.payments where id=p_payment_id for update; if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into ord from public.orders where id=pay.order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if pay.status='PAID' then return jsonb_build_object('payment',row_to_json(pay),'order',row_to_json(ord)); end if;
  if pay.status not in ('PENDING','PROCESSING','FAILED') or ord.status in ('DRAFT','CANCELLED','REFUNDED') then raise exception 'PAYMENT_NOT_ALLOWED'; end if;
  if ord.status not in ('SERVED','COLLECTED') then raise exception 'ORDER_NOT_FULFILLED'; end if;
  if round(pay.amount,2)<>round(ord.total,2) then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  if exists(select 1 from public.payments where order_id=ord.id and id<>pay.id and status='PAID') then raise exception 'PAYMENT_ALREADY_CONFIRMED'; end if;
  update public.payments set status='PAID',provider=left(nullif(btrim(p_provider),''),50),transaction_reference=left(nullif(btrim(p_transaction_reference),''),150),paid_at=now() where id=pay.id returning * into pay;
  update public.orders set payment_status='PAID',status=case when status in ('SERVED','COLLECTED') then 'COMPLETED' else status end where id=ord.id returning * into ord;
  return jsonb_build_object('payment',row_to_json(pay),'order',row_to_json(ord));
end;
$$;
revoke all on function public.confirm_pos_payment(uuid,text,text) from public;
grant execute on function public.confirm_pos_payment(uuid,text,text) to authenticated;

create or replace function public.sync_restaurant_table_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare prior text;
begin
  if new.dining_mode<>'dine-in' or new.restaurant_table_id is null then return new; end if;
  if tg_op='INSERT' then
    select status into prior from public.restaurant_tables where id=new.restaurant_table_id for update;
    update public.restaurant_tables set status='OCCUPIED',is_active=true where id=new.restaurant_table_id and is_active and status in ('AVAILABLE','RESERVED');
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    perform public.log_table_activity(new.restaurant_table_id,new.id,'TABLE_OCCUPIED',prior,'OCCUPIED',new.idempotency_key,jsonb_build_object('order_number',new.order_number)); return new;
  end if;
  if new.status='COMPLETED' and new.payment_status='PAID' and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    select status into prior from public.restaurant_tables where id=new.restaurant_table_id for update;
    update public.restaurant_tables set status='AVAILABLE',is_active=true where id=new.restaurant_table_id;
    perform public.log_table_activity(new.restaurant_table_id,new.id,'PAYMENT_COMPLETED',prior,'AVAILABLE',null,jsonb_build_object('order_number',new.order_number));
  elsif new.status='CANCELLED' and old.status in ('DRAFT','PLACED') then
    update public.restaurant_tables set status='AVAILABLE',is_active=true where id=new.restaurant_table_id;
  end if;
  return new;
end;
$$;
