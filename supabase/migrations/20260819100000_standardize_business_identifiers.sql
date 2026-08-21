-- Human-readable POS identifiers. UUID primary/foreign keys remain the
-- authoritative internal relationships; these codes are for staff and audit
-- output only.

create sequence if not exists public.pos_category_code_seq;
create sequence if not exists public.pos_product_code_seq;

alter table public.categories
  add column if not exists category_code varchar(20);

alter table public.products
  add column if not exists product_code varchar(20);

-- Backfill master data deterministically without changing UUID relationships.
with ranked as (
  select id, row_number() over (order by created_at, id) as code_no
  from public.categories
)
update public.categories category
set category_code = 'CAT-' || lpad(ranked.code_no::text, 4, '0')
from ranked
where ranked.id = category.id
  and category.category_code is null;

with ranked as (
  select id, row_number() over (order by created_at, id) as code_no
  from public.products
)
update public.products product
set product_code = 'PRD-' || lpad(ranked.code_no::text, 6, '0')
from ranked
where ranked.id = product.id
  and product.product_code is null;

do $$
declare
  category_max bigint;
  product_max bigint;
begin
  select coalesce(max(substring(category_code from 5)::bigint), 0)
  into category_max
  from public.categories
  where category_code ~ '^CAT-[0-9]{4}$';

  if category_max = 0 then
    perform setval('public.pos_category_code_seq', 1, false);
  else
    perform setval('public.pos_category_code_seq', category_max, true);
  end if;

  select coalesce(max(substring(product_code from 5)::bigint), 0)
  into product_max
  from public.products
  where product_code ~ '^PRD-[0-9]{6}$';

  if product_max = 0 then
    perform setval('public.pos_product_code_seq', 1, false);
  else
    perform setval('public.pos_product_code_seq', product_max, true);
  end if;
end;
$$;

create or replace function public.assign_pos_master_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.assign_pos_master_code() from public, anon, authenticated;

drop trigger if exists trg_assign_pos_category_code on public.categories;
create trigger trg_assign_pos_category_code
before insert on public.categories
for each row execute function public.assign_pos_master_code();

drop trigger if exists trg_assign_pos_product_code on public.products;
create trigger trg_assign_pos_product_code
before insert on public.products
for each row execute function public.assign_pos_master_code();

alter table public.categories
  alter column category_code set not null;
alter table public.categories drop constraint if exists categories_category_code_format_check;
alter table public.categories
  add constraint categories_category_code_format_check check (category_code ~ '^CAT-[0-9]{4}$');
create unique index if not exists idx_categories_category_code
  on public.categories(category_code);

alter table public.products
  alter column product_code set not null;
alter table public.products drop constraint if exists products_product_code_format_check;
alter table public.products
  add constraint products_product_code_format_check check (product_code ~ '^PRD-[0-9]{6}$');
create unique index if not exists idx_products_product_code
  on public.products(product_code);

-- A row per prefix/day provides a transaction-safe daily counter. PostgreSQL
-- serializes the ON CONFLICT update, preventing duplicate numbers across POS
-- terminals without using MAX(number) + 1.
create table if not exists public.pos_business_number_counters (
  prefix varchar(8) not null,
  business_date date not null,
  last_value bigint not null check (last_value > 0),
  primary key (prefix, business_date),
  check (prefix in ('ORD', 'KB', 'PAY'))
);

alter table public.pos_business_number_counters enable row level security;
revoke all on public.pos_business_number_counters from public, anon, authenticated;
grant all on public.pos_business_number_counters to service_role;

create or replace function public.next_pos_business_number(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_prefix text := upper(btrim(coalesce(p_prefix, '')));
  malaysia_business_date date := (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
  next_value bigint;
begin
  if normalized_prefix not in ('ORD', 'KB', 'PAY') then
    raise exception 'INVALID_BUSINESS_NUMBER_PREFIX';
  end if;

  insert into public.pos_business_number_counters(prefix, business_date, last_value)
  values (normalized_prefix, malaysia_business_date, 1)
  on conflict (prefix, business_date) do update
  set last_value = public.pos_business_number_counters.last_value + 1
  returning last_value into next_value;

  if next_value > 999999 then
    raise exception 'BUSINESS_NUMBER_EXHAUSTED';
  end if;

  return normalized_prefix || '-' || to_char(malaysia_business_date, 'YYYYMMDD')
    || '-' || lpad(next_value::text, 6, '0');
end;
$$;

revoke all on function public.next_pos_business_number(text) from public, anon, authenticated;

alter table public.order_item_batches
  add column if not exists batch_number varchar(32);

alter table public.payments
  add column if not exists payment_number varchar(32);

-- New columns can safely be assigned to historical batches and payments.
with ranked as (
  select
    id,
    (created_at at time zone 'Asia/Kuala_Lumpur')::date as business_date,
    row_number() over (
      partition by (created_at at time zone 'Asia/Kuala_Lumpur')::date
      order by created_at, id
    ) as code_no
  from public.order_item_batches
)
update public.order_item_batches batch
set batch_number = 'KB-' || to_char(ranked.business_date, 'YYYYMMDD')
  || '-' || lpad(ranked.code_no::text, 6, '0')
from ranked
where ranked.id = batch.id
  and batch.batch_number is null;

with ranked as (
  select
    id,
    (created_at at time zone 'Asia/Kuala_Lumpur')::date as business_date,
    row_number() over (
      partition by (created_at at time zone 'Asia/Kuala_Lumpur')::date
      order by created_at, id
    ) as code_no
  from public.payments
)
update public.payments payment
set payment_number = 'PAY-' || to_char(ranked.business_date, 'YYYYMMDD')
  || '-' || lpad(ranked.code_no::text, 6, '0')
from ranked
where ranked.id = payment.id
  and payment.payment_number is null;

insert into public.pos_business_number_counters(prefix, business_date, last_value)
select 'KB', to_date(split_part(batch_number, '-', 2), 'YYYYMMDD'),
  max(split_part(batch_number, '-', 3)::bigint)
from public.order_item_batches
where batch_number ~ '^KB-[0-9]{8}-[0-9]{6}$'
group by to_date(split_part(batch_number, '-', 2), 'YYYYMMDD')
on conflict (prefix, business_date) do update
set last_value = greatest(public.pos_business_number_counters.last_value, excluded.last_value);

insert into public.pos_business_number_counters(prefix, business_date, last_value)
select 'PAY', to_date(split_part(payment_number, '-', 2), 'YYYYMMDD'),
  max(split_part(payment_number, '-', 3)::bigint)
from public.payments
where payment_number ~ '^PAY-[0-9]{8}-[0-9]{6}$'
group by to_date(split_part(payment_number, '-', 2), 'YYYYMMDD')
on conflict (prefix, business_date) do update
set last_value = greatest(public.pos_business_number_counters.last_value, excluded.last_value);

-- Keep historical order numbers immutable. Seed counters from any orders that
-- already use the standard, then issue the standard format on every new order.
insert into public.pos_business_number_counters(prefix, business_date, last_value)
select 'ORD', to_date(split_part(order_number, '-', 2), 'YYYYMMDD'),
  max(split_part(order_number, '-', 3)::bigint)
from public.orders
where order_number ~ '^ORD-[0-9]{8}-[0-9]{6}$'
group by to_date(split_part(order_number, '-', 2), 'YYYYMMDD')
on conflict (prefix, business_date) do update
set last_value = greatest(public.pos_business_number_counters.last_value, excluded.last_value);

create or replace function public.assign_pos_transaction_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.assign_pos_transaction_number() from public, anon, authenticated;

drop trigger if exists trg_assign_pos_order_number on public.orders;
create trigger trg_assign_pos_order_number
before insert on public.orders
for each row execute function public.assign_pos_transaction_number();

drop trigger if exists trg_assign_pos_kitchen_batch_number on public.order_item_batches;
create trigger trg_assign_pos_kitchen_batch_number
before insert on public.order_item_batches
for each row execute function public.assign_pos_transaction_number();

drop trigger if exists trg_assign_pos_payment_number on public.payments;
create trigger trg_assign_pos_payment_number
before insert on public.payments
for each row execute function public.assign_pos_transaction_number();

alter table public.order_item_batches
  alter column batch_number set not null;
alter table public.order_item_batches drop constraint if exists order_item_batches_batch_number_format_check;
alter table public.order_item_batches
  add constraint order_item_batches_batch_number_format_check
  check (batch_number ~ '^KB-[0-9]{8}-[0-9]{6}$');
create unique index if not exists idx_order_item_batches_batch_number
  on public.order_item_batches(batch_number);

alter table public.payments
  alter column payment_number set not null;
alter table public.payments drop constraint if exists payments_payment_number_format_check;
alter table public.payments
  add constraint payments_payment_number_format_check
  check (payment_number ~ '^PAY-[0-9]{8}-[0-9]{6}$');
create unique index if not exists idx_payments_payment_number
  on public.payments(payment_number);

-- Numeric table input becomes T01, T02, ... while established alphanumeric
-- table identities are preserved for backward compatibility.
create or replace function public.normalize_pos_table_number()
returns trigger
language plpgsql
set search_path = public
as $$
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
$$;

drop trigger if exists trg_normalize_pos_table_number on public.restaurant_tables;
create trigger trg_normalize_pos_table_number
before insert or update of table_number on public.restaurant_tables
for each row execute function public.normalize_pos_table_number();

-- Report payment identifiers alongside the UUID used internally.
create or replace view public.daily_sales_report
with (security_invoker = true)
as
select
  coalesce(p.paid_at, p.created_at)::date as report_date,
  p.order_id,
  o.order_number,
  o.user_id,
  o.status as order_status,
  o.dining_mode,
  o.restaurant_table_id,
  p.id as payment_id,
  p.payment_method,
  coalesce(p.provider, 'UNSPECIFIED') as provider,
  p.transaction_reference,
  round(o.subtotal, 2) as subtotal,
  round(o.tax, 2) as tax,
  round(o.discount, 2) as discount,
  round(p.amount, 2) as amount_paid,
  round(o.total, 2) as order_total,
  coalesce(p.paid_at, p.created_at) as paid_at,
  round(o.service_charge, 2) as service_charge,
  p.payment_number
from public.payments p
join public.orders o on o.id = p.order_id
where p.status = 'PAID'
  and public.current_pos_role() in ('ADMIN', 'MANAGER');

revoke all on public.daily_sales_report from anon;
grant select on public.daily_sales_report to authenticated;

comment on column public.categories.category_code is 'Staff-facing category identifier, e.g. CAT-0001.';
comment on column public.products.product_code is 'Staff-facing product identifier, e.g. PRD-000001.';
comment on column public.orders.order_number is 'Staff-facing order identifier. UUID id remains the internal key.';
comment on column public.order_item_batches.batch_number is 'Staff-facing kitchen batch identifier.';
comment on column public.payments.payment_number is 'Staff-facing payment identifier.';
