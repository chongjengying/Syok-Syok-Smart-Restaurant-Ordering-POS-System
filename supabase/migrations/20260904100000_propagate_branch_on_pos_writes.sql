-- Production hardening made branch_id mandatory after the order/payment RPCs
-- were created. Keep all supported write paths compatible by resolving the
-- branch at the database boundary before NOT NULL constraints are checked.

create or replace function public.assign_pos_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is not null then
    return new;
  end if;

  if tg_table_name = 'restaurant_tables' then
    new.branch_id := coalesce(
      (select branch_id from public.profiles where id = auth.uid()),
      (select id from public.branches where code = 'MAIN' and status = 'ACTIVE')
    );
  elsif tg_table_name = 'orders' then
    new.branch_id := coalesce(
      (select branch_id from public.restaurant_tables where id = new.restaurant_table_id),
      (select branch_id from public.profiles where id = new.user_id),
      (select id from public.branches where code = 'MAIN' and status = 'ACTIVE')
    );
  elsif tg_table_name in ('payments', 'refunds') then
    new.branch_id := coalesce(
      (select branch_id from public.orders where id = new.order_id),
      (select id from public.branches where code = 'MAIN' and status = 'ACTIVE')
    );
  end if;

  if new.branch_id is null then
    raise exception 'BRANCH_REQUIRED';
  end if;
  return new;
end;
$$;

revoke all on function public.assign_pos_branch_id() from public, anon, authenticated;

drop trigger if exists trg_assign_restaurant_table_branch on public.restaurant_tables;
create trigger trg_assign_restaurant_table_branch
before insert on public.restaurant_tables
for each row execute function public.assign_pos_branch_id();

drop trigger if exists trg_assign_order_branch on public.orders;
create trigger trg_assign_order_branch
before insert on public.orders
for each row execute function public.assign_pos_branch_id();

drop trigger if exists trg_assign_payment_branch on public.payments;
create trigger trg_assign_payment_branch
before insert on public.payments
for each row execute function public.assign_pos_branch_id();

drop trigger if exists trg_assign_refund_branch on public.refunds;
create trigger trg_assign_refund_branch
before insert on public.refunds
for each row execute function public.assign_pos_branch_id();
