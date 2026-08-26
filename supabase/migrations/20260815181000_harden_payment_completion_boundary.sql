-- The complete_payment RPC is now the only authenticated completion boundary.
revoke execute on function public.confirm_pos_payment(uuid, text, text) from authenticated;
revoke execute on function public.set_pos_payment_method(uuid, text) from authenticated;

-- Keep table lifecycle consistent even if another privileged workflow completes
-- an order: a paid dine-in table must enter CLEANING, never AVAILABLE directly.
create or replace function public.sync_restaurant_table_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior text;
begin
  if new.dining_mode <> 'dine-in' or new.restaurant_table_id is null then return new; end if;

  if tg_op = 'INSERT' then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id for update;
    update public.restaurant_tables
    set status = 'OCCUPIED', is_active = true
    where id = new.restaurant_table_id and is_active and status in ('AVAILABLE', 'RESERVED');
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    perform public.log_table_activity(
      new.restaurant_table_id, new.id, 'TABLE_OCCUPIED', prior, 'OCCUPIED',
      new.idempotency_key, jsonb_build_object('order_number', new.order_number)
    );
    return new;
  end if;

  if new.status = 'COMPLETED' and new.payment_status = 'PAID'
    and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) then
    select status into prior from public.restaurant_tables
    where id = new.restaurant_table_id for update;
    update public.restaurant_tables
    set status = 'CLEANING', is_active = true
    where id = new.restaurant_table_id;
    perform public.log_table_activity(
      new.restaurant_table_id, new.id, 'CLEANING_STARTED', prior, 'CLEANING', null,
      jsonb_build_object('order_number', new.order_number, 'payment_status', new.payment_status)
    );
  elsif new.status = 'CANCELLED' and old.status in ('DRAFT', 'PLACED') then
    update public.restaurant_tables
    set status = 'AVAILABLE', is_active = true
    where id = new.restaurant_table_id;
  elsif new.status = 'CANCELLED' then
    update public.restaurant_tables
    set status = 'CLEANING', is_active = true
    where id = new.restaurant_table_id;
  end if;
  return new;
end;
$$;
