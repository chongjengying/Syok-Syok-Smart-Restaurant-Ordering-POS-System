-- Legacy direct-order RPCs predate mandatory branch ownership. Resolve the
-- branch in one database boundary so every order path remains consistent.
create or replace function public.assign_order_branch_id()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from public.restaurant_tables where id=new.restaurant_table_id;
  end if;
  if new.branch_id is null then
    select branch_id into new.branch_id from public.profiles where id=new.user_id;
  end if;
  if new.branch_id is null then
    select id into new.branch_id from public.branches where code='MAIN' and status='ACTIVE';
  end if;
  if new.branch_id is null then raise exception 'BRANCH_REQUIRED'; end if;
  return new;
end;
$$;
revoke all on function public.assign_order_branch_id() from public,anon,authenticated;
drop trigger if exists trg_assign_order_branch_id on public.orders;
create trigger trg_assign_order_branch_id before insert on public.orders
for each row execute function public.assign_order_branch_id();
