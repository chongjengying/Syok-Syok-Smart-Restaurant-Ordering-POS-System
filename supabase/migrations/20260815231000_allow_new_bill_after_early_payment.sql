-- A table may start a new financial bill after its previous bill is PAID,
-- even while the paid order is still being prepared/served. There may still
-- be only one active UNPAID/PARTIALLY_PAID bill per table.

drop index if exists public.idx_one_active_order_per_restaurant_table;
create unique index idx_one_active_order_per_restaurant_table
on public.orders(restaurant_table_id)
where restaurant_table_id is not null
  and payment_status in ('UNPAID', 'PARTIALLY_PAID')
  and status in ('DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED');

-- Update the two creation workers while retaining their existing validation,
-- catalog locking, authoritative pricing and idempotency implementations.
do $$
declare
  signature regprocedure;
  definition text;
begin
  signature := 'public.create_pos_order_unbound(jsonb,text,text,text,text)'::regprocedure;
  definition := pg_get_functiondef(signature);
  if position('status in (''AVAILABLE'', ''RESERVED'')' in definition) = 0 then
    raise exception 'EXPECTED_PLACE_ORDER_TABLE_GUARD_NOT_FOUND';
  end if;
  definition := replace(
    definition,
    'status in (''AVAILABLE'', ''RESERVED'')',
    'status in (''AVAILABLE'', ''RESERVED'', ''OCCUPIED'')'
  );
  definition := replace(
    definition,
    'and status in (''DRAFT'', ''CONFIRMED'', ''CONFIRMED'', ''PREPARING'', ''READY'', ''SERVED'')',
    'and payment_status in (''UNPAID'', ''PARTIALLY_PAID'') and status in (''DRAFT'', ''CONFIRMED'', ''PREPARING'', ''READY'', ''SERVED'')'
  );
  execute definition;

  signature := 'public.create_pos_draft(text,uuid,text)'::regprocedure;
  definition := pg_get_functiondef(signature);
  if position('status in (''AVAILABLE'',''RESERVED'')' in definition) = 0 then
    raise exception 'EXPECTED_DRAFT_TABLE_GUARD_NOT_FOUND';
  end if;
  definition := replace(
    definition,
    'status in (''AVAILABLE'',''RESERVED'')',
    'status in (''AVAILABLE'',''RESERVED'',''OCCUPIED'')'
  );
  definition := replace(
    definition,
    'where restaurant_table_id=p_table_id and status in (''DRAFT'',''CONFIRMED'',''CONFIRMED'',''PREPARING'',''READY'',''SERVED'',''SERVED'')',
    'where restaurant_table_id=p_table_id and payment_status in (''UNPAID'',''PARTIALLY_PAID'') and status in (''DRAFT'',''CONFIRMED'',''PREPARING'',''READY'',''SERVED'')'
  );
  execute definition;
end;
$$;

revoke all on function public.create_pos_order_unbound(jsonb, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.create_pos_draft(text, uuid, text) from public, anon;
grant execute on function public.create_pos_draft(text, uuid, text) to authenticated;

create or replace function public.sync_restaurant_table_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior text;
  has_other_operational_order boolean;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id and is_active for update;
    if prior is null or prior not in ('AVAILABLE', 'RESERVED', 'OCCUPIED') then
      raise exception 'TABLE_NOT_AVAILABLE';
    end if;
    if exists (
      select 1 from public.orders existing
      where existing.restaurant_table_id = new.restaurant_table_id
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
    if has_other_operational_order then
      update public.restaurant_tables set status = 'OCCUPIED', is_active = true
      where id = new.restaurant_table_id;
    else
      update public.restaurant_tables set status = 'CLEANING', is_active = true
      where id = new.restaurant_table_id;
      perform public.log_table_activity(
        new.restaurant_table_id, new.id, 'CLEANING_STARTED', prior, 'CLEANING', null,
        jsonb_build_object('order_number', new.order_number, 'payment_status', new.payment_status)
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

revoke all on function public.sync_restaurant_table_status() from public, anon, authenticated;
