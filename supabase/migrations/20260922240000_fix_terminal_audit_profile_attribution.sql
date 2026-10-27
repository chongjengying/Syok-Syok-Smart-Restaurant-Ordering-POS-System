begin;

-- Terminal devices authenticate with an anonymous Auth user, which deliberately
-- has no matching public.profiles row. Keep terminal/staff attribution while
-- only writing profile-backed identities to profile foreign-key columns.
create or replace function public.attribute_pos_audit()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.terminal_staff_sessions;
begin
  s := public.current_terminal_staff_session();

  new.actor_id := coalesce(
    (select p.id from public.profiles p where p.id = new.actor_id),
    (select p.id from public.profiles p where p.id = auth.uid()),
    s.staff_id
  );
  new.actor_auth_user_id := coalesce(
    (select p.id from public.profiles p where p.id = auth.uid()),
    (select p.id from public.profiles p where p.id = s.actor_auth_user_id),
    (select p.id from public.profiles p where p.id = new.actor_id)
  );
  new.actor_staff_id := coalesce(s.staff_id, new.actor_staff_id);
  new.staff_session_id := coalesce(s.id, new.staff_session_id);
  new.terminal_id := coalesce(s.terminal_id, new.terminal_id);

  if s.id is not null then
    new.branch_id := s.branch_id;
  elsif new.entity_type = 'BRANCH' then
    new.branch_id := new.entity_id;
  elsif new.entity_type = 'TERMINAL' then
    select branch_id into new.branch_id from public.pos_terminals where id = new.entity_id;
  elsif new.entity_type = 'ORDER' then
    select branch_id, id into new.branch_id, new.order_id from public.orders where id = new.entity_id;
  elsif new.entity_type = 'PAYMENT' then
    select branch_id, order_id, id into new.branch_id, new.order_id, new.payment_id from public.payments where id = new.entity_id;
  elsif new.entity_type = 'RECEIPT' then
    select branch_id, order_id, id into new.branch_id, new.order_id, new.receipt_id from public.receipts where id = new.entity_id;
  end if;

  if new.branch_id is null and new.entity_type <> 'COMPANY' then
    select branch_id into new.branch_id from public.profiles where id = new.actor_id;
  end if;

  new.order_id := coalesce(new.order_id, nullif(new.metadata ->> 'orderId', '')::uuid);
  new.order_item_id := coalesce(new.order_item_id, nullif(new.metadata ->> 'orderItemId', '')::uuid);
  new.payment_id := coalesce(new.payment_id, nullif(new.metadata ->> 'paymentId', '')::uuid);
  new.receipt_id := coalesce(new.receipt_id, nullif(new.metadata ->> 'receiptId', '')::uuid);

  if new.order_id is not null and new.branch_id is null then
    select branch_id into new.branch_id from public.orders where id = new.order_id;
  end if;

  if new.entity_type = 'COMPANY' then
    new.company_id := new.entity_id;
    new.branch_id := null;
  elsif new.branch_id is not null then
    select company_id into new.company_id from public.branches where id = new.branch_id;
  end if;

  return new;
end $$;

commit;
