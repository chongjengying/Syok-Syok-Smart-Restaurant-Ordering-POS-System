-- Treat each kitchen submission as an independently actionable ticket while
-- keeping every submission on the same financial order/bill.

alter table public.order_item_batches
  add column if not exists batch_no integer,
  add column if not exists status text,
  add column if not exists started_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists served_at timestamptz;

-- Older first submissions predate explicit batches. Give those items a
-- synthetic batch before enforcing the new invariants.
do $$
declare
  ord record;
  created_batch_id uuid;
begin
  for ord in
    select o.id, o.user_id, min(coalesce(oi.sent_at, oi.created_at)) as first_sent_at
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where oi.batch_id is null
      and oi.item_status not in ('DRAFT', 'VOIDED')
    group by o.id, o.user_id
  loop
    insert into public.order_item_batches (
      order_id, user_id, idempotency_key, request_items, created_at
    )
    select ord.id, ord.user_id, 'initial-' || ord.id::text,
      jsonb_agg(jsonb_build_object('orderItemId', oi.id) order by oi.created_at),
      ord.first_sent_at
    from public.order_items oi
    where oi.order_id = ord.id
      and oi.batch_id is null
      and oi.item_status not in ('DRAFT', 'VOIDED')
    on conflict (user_id, idempotency_key) do update
      set request_items = excluded.request_items
    returning id into created_batch_id;

    update public.order_items
    set batch_id = created_batch_id
    where order_id = ord.id
      and batch_id is null
      and item_status not in ('DRAFT', 'VOIDED');
  end loop;
end;
$$;

with ranked as (
  select id, row_number() over (partition by order_id order by created_at, id)::integer as batch_no
  from public.order_item_batches
)
update public.order_item_batches batch
set batch_no = ranked.batch_no
from ranked
where ranked.id = batch.id;

update public.order_item_batches batch
set status = case
      when exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status = 'SUBMITTED') then 'PENDING'
      when exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status = 'PREPARING') then 'PREPARING'
      when exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status = 'READY') then 'READY'
      when exists (select 1 from public.order_items item where item.batch_id = batch.id and item.item_status = 'SERVED') then 'SERVED'
      else 'CANCELLED'
    end,
    started_at = case when exists (
      select 1 from public.order_items item where item.batch_id = batch.id and item.item_status in ('PREPARING', 'READY', 'SERVED')
    ) then coalesce(batch.started_at, batch.created_at) else batch.started_at end,
    ready_at = case when exists (
      select 1 from public.order_items item where item.batch_id = batch.id and item.item_status in ('READY', 'SERVED')
    ) then coalesce(batch.ready_at, batch.created_at) else batch.ready_at end,
    served_at = case when exists (
      select 1 from public.order_items item where item.batch_id = batch.id and item.item_status = 'SERVED'
    ) then coalesce(batch.served_at, batch.created_at) else batch.served_at end;

alter table public.order_item_batches
  alter column batch_no set not null,
  alter column status set default 'PENDING',
  alter column status set not null;

alter table public.order_item_batches drop constraint if exists order_item_batches_batch_no_check;
alter table public.order_item_batches add constraint order_item_batches_batch_no_check check (batch_no > 0);
alter table public.order_item_batches drop constraint if exists order_item_batches_status_check;
alter table public.order_item_batches add constraint order_item_batches_status_check
  check (status in ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'));
alter table public.order_item_batches drop constraint if exists order_item_batches_order_batch_no_key;
alter table public.order_item_batches add constraint order_item_batches_order_batch_no_key unique (order_id, batch_no);

create index if not exists idx_order_item_batches_kitchen_queue
  on public.order_item_batches(status, created_at)
  where status in ('PENDING', 'PREPARING', 'READY');
create index if not exists idx_order_items_batch_status
  on public.order_items(batch_id, item_status);

-- All batch writers already lock the order. The trigger also takes that lock
-- so any future writer receives the same race-free sequential allocation.
create or replace function public.assign_pos_kitchen_batch_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.assign_pos_kitchen_batch_no() from public, anon, authenticated;
drop trigger if exists trg_assign_pos_kitchen_batch_no on public.order_item_batches;
create trigger trg_assign_pos_kitchen_batch_no
before insert on public.order_item_batches
for each row execute function public.assign_pos_kitchen_batch_no();

create or replace function public.ensure_initial_pos_kitchen_batch(
  p_order_id uuid,
  p_user_id uuid
)
returns public.order_item_batches
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.ensure_initial_pos_kitchen_batch(uuid, uuid) from public, anon, authenticated;

create or replace function public.submit_pos_order(p_order_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    left join public.products p on p.id = oi.product_id and p.status = true
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

revoke all on function public.submit_pos_order(uuid, text) from public, anon;
grant execute on function public.submit_pos_order(uuid, text) to authenticated;

-- Keep the audited place_order validation and locking boundary, then attach
-- its initially submitted items to Batch 1 in the same transaction.
create or replace function public.place_order(
  p_items jsonb,
  p_payment_method text,
  p_dining_mode text,
  p_table_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.place_order(jsonb, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text) to authenticated;

create or replace function public.start_kitchen_batch(p_order_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if batch.status in ('PREPARING', 'READY') then
    return to_jsonb(batch);
  end if;
  if batch.status <> 'PENDING' then raise exception 'KITCHEN_BATCH_NOT_PENDING'; end if;
  update public.order_items set item_status = 'PREPARING'
  where batch_id = batch.id and item_status = 'SUBMITTED';
  update public.order_item_batches
  set status = 'PREPARING', started_at = coalesce(started_at, clock_timestamp())
  where id = batch.id returning * into batch;
  perform set_config('app.status_change_notes', 'Kitchen started batch ' || batch.batch_no, true);
  update public.orders
  set status = 'PREPARING', kitchen_started_at = coalesce(kitchen_started_at, clock_timestamp())
  where id = ord.id;
  return to_jsonb(batch);
end;
$$;

create or replace function public.ready_kitchen_batch(p_order_id uuid, p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if ord.payment_status <> 'UNPAID' then raise exception 'ORDER_ALREADY_PAID'; end if;
  if batch.status = 'READY' then return to_jsonb(batch); end if;
  if batch.status <> 'PREPARING' then raise exception 'KITCHEN_BATCH_NOT_PREPARING'; end if;
  update public.order_items set item_status = 'READY'
  where batch_id = batch.id and item_status = 'PREPARING';
  update public.order_item_batches
  set status = 'READY', ready_at = coalesce(ready_at, clock_timestamp())
  where id = batch.id returning * into batch;

  next_status := case
    when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'SUBMITTED') then 'CONFIRMED'
    when exists (select 1 from public.order_items where order_id = ord.id and item_status = 'READY') then 'READY'
    else ord.status
  end;
  perform set_config('app.status_change_notes', 'Kitchen completed batch ' || batch.batch_no, true);
  update public.orders set status = next_status where id = ord.id;
  return to_jsonb(batch);
end;
$$;

revoke all on function public.start_kitchen_batch(uuid, uuid) from public, anon;
revoke all on function public.ready_kitchen_batch(uuid, uuid) from public, anon;
grant execute on function public.start_kitchen_batch(uuid, uuid) to authenticated;
grant execute on function public.ready_kitchen_batch(uuid, uuid) to authenticated;

create or replace function public.serve_ready_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
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
    if ord.status = 'SERVED' then return ord; end if;
    raise exception 'ORDER_NOT_READY';
  end if;
  update public.order_items set item_status = 'SERVED'
  where order_id = p_order_id and item_status = 'READY';
  update public.order_item_batches batch
  set status = 'SERVED', served_at = coalesce(served_at, clock_timestamp())
  where batch.order_id = p_order_id and batch.status = 'READY'
    and not exists (
      select 1 from public.order_items item
      where item.batch_id = batch.id and item.item_status <> 'SERVED'
    );
  next_status := case
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'PREPARING') then 'PREPARING'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'SUBMITTED') then 'CONFIRMED'
    when exists (select 1 from public.order_items where order_id = p_order_id and item_status = 'READY') then 'READY'
    when ord.payment_status = 'PAID' then 'COMPLETED'
    else 'SERVED'
  end;
  perform set_config('app.status_change_notes', 'Ready kitchen items served', true);
  update public.orders set status = next_status where id = p_order_id returning * into ord;
  return ord;
end;
$$;

revoke all on function public.serve_ready_order(uuid) from public, anon;
grant execute on function public.serve_ready_order(uuid) to authenticated;

-- Kitchen access follows item/batch work, rather than an unreliable global
-- status when multiple batches are at different stages.
create or replace function public.can_read_pos_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case public.current_pos_role()
    when 'ADMIN' then true
    when 'MANAGER' then true
    when 'WAITER' then true
    when 'CASHIER' then true
    when 'KITCHEN' then exists (
      select 1 from public.order_items item
      where item.order_id = p_order_id
        and item.item_status in ('SUBMITTED', 'PREPARING', 'READY')
    )
    else false
  end
$$;

revoke all on function public.can_read_pos_order(uuid) from public, anon;
grant execute on function public.can_read_pos_order(uuid) to authenticated;

drop policy if exists front_of_house_read_order_batches on public.order_item_batches;
create policy operational_staff_read_order_batches
on public.order_item_batches for select to authenticated
using (
  public.current_pos_role() in ('MANAGER', 'WAITER', 'KITCHEN', 'CASHIER')
  and public.can_read_pos_order(order_id)
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.order_item_batches;
  exception when duplicate_object then null;
  end;
end;
$$;
