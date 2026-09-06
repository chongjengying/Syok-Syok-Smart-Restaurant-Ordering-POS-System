create or replace function public.assign_payment_branch_id() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.branch_id is null then select branch_id into new.branch_id from public.orders where id=new.order_id; end if;
  if new.branch_id is null then raise exception 'BRANCH_REQUIRED'; end if;
  return new;
end; $$;
drop trigger if exists trg_assign_payment_branch_id on public.payments;
create trigger trg_assign_payment_branch_id before insert on public.payments
for each row execute function public.assign_payment_branch_id();
