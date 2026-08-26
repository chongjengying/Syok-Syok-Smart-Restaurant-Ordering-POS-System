-- Split bills are server-owned. Bills retain the original order as their parent
-- and payment rows retain the cashier/audit trail already used by the POS.
create table if not exists public.order_bills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  bill_number integer not null check (bill_number between 1 and 10),
  total numeric(12, 2) not null check (total >= 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0 and paid_amount <= total),
  status varchar(10) not null default 'OPEN' check (status in ('OPEN', 'PAID')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (order_id, bill_number)
);

create table if not exists public.order_bill_items (
  bill_id uuid not null references public.order_bills(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  primary key (bill_id, order_item_id),
  unique (order_item_id)
);

alter table public.payments add column if not exists bill_id uuid references public.order_bills(id) on delete restrict;
create index if not exists idx_order_bills_order on public.order_bills(order_id, bill_number);
create index if not exists idx_payments_bill on public.payments(bill_id, status);

alter table public.order_bills enable row level security;
alter table public.order_bill_items enable row level security;

create policy active_staff_read_order_bills
on public.order_bills for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER'));

create policy active_staff_read_order_bill_items
on public.order_bill_items for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER'));

create or replace function public.create_pos_bill_split(
  p_order_id uuid,
  p_mode text,
  p_bill_count integer default null,
  p_assignments jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  role_name text;
  ord public.orders%rowtype;
  item record;
  bill_id uuid;
  item_total numeric(12,2);
  bill_total numeric(12,2);
  total_cents bigint;
  remaining_cents bigint;
  count_bills integer := coalesce(p_bill_count, 0);
  normalized_mode text := upper(trim(coalesce(p_mode, '')));
  assignment jsonb;
  assigned_ids uuid[] := '{}';
begin
  select p.role_name into role_name from public.profiles p where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if normalized_mode not in ('EQUAL', 'ITEM') then raise exception 'INVALID_SPLIT_MODE'; end if;
  if normalized_mode = 'EQUAL' and (count_bills < 2 or count_bills > 10) then raise exception 'BILL_COUNT_MUST_BE_2_TO_10'; end if;
  if normalized_mode = 'ITEM' and (jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) < 2 or jsonb_array_length(p_assignments) > 10) then raise exception 'INVALID_BILL_ASSIGNMENTS'; end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status in ('PAID', 'PARTIALLY_PAID') or exists (select 1 from public.order_bills where order_id = ord.id) then raise exception 'ORDER_ALREADY_SPLIT_OR_PAID'; end if;
  if ord.status not in ('CONFIRMED', 'PREPARING', 'READY', 'SERVED') then raise exception 'ORDER_NOT_PAYABLE'; end if;

  total_cents := round(ord.total * 100);
  if normalized_mode = 'EQUAL' then
    remaining_cents := total_cents;
    for i in 1..count_bills loop
      bill_total := case when i = count_bills then remaining_cents / 100.0 else floor(total_cents / count_bills) / 100.0 end;
      remaining_cents := remaining_cents - round(bill_total * 100);
      insert into public.order_bills(order_id, bill_number, total, created_by) values (ord.id, i, bill_total, caller_id) returning id into bill_id;
    end loop;
  else
    for i in 0..jsonb_array_length(p_assignments)-1 loop
      assignment := p_assignments->i;
      if jsonb_typeof(assignment->'itemIds') <> 'array' or jsonb_array_length(assignment->'itemIds') = 0 then raise exception 'BILL_MUST_HAVE_ITEMS'; end if;
      item_total := 0;
      for item in select oi.id, oi.subtotal from public.order_items oi where oi.order_id = ord.id and oi.id = any(array(select jsonb_array_elements_text(assignment->'itemIds')::uuid)) loop
        if item.id = any(assigned_ids) then raise exception 'ORDER_ITEM_ASSIGNED_TWICE'; end if;
        assigned_ids := array_append(assigned_ids, item.id);
        item_total := item_total + item.subtotal;
      end loop;
      if item_total = 0 then raise exception 'BILL_ITEMS_NOT_FOUND'; end if;
      insert into public.order_bills(order_id, bill_number, total, created_by) values (ord.id, i + 1, case when i = jsonb_array_length(p_assignments)-1 then ord.total - coalesce((select sum(total) from public.order_bills where order_id=ord.id),0) else item_total end, caller_id) returning id into bill_id;
      insert into public.order_bill_items(bill_id, order_item_id) select bill_id, value::uuid from jsonb_array_elements_text(assignment->'itemIds');
    end loop;
    if cardinality(assigned_ids) <> (select count(*) from public.order_items where order_id = ord.id and item_status <> 'VOIDED') then raise exception 'EVERY_ITEM_MUST_BE_ASSIGNED'; end if;
  end if;

  update public.orders set payment_status = 'PARTIALLY_PAID' where id = ord.id;
  return jsonb_build_object('orderId', ord.id, 'bills', (select jsonb_agg(jsonb_build_object('id', b.id, 'billNumber', b.bill_number, 'total', b.total, 'paidAmount', b.paid_amount, 'status', b.status) order by b.bill_number) from public.order_bills b where b.order_id = ord.id));
end;
$$;

create or replace function public.complete_pos_bill_payment(
  p_bill_id uuid,
  p_payments jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  role_name text;
  bill public.order_bills%rowtype;
  payment jsonb;
  method text;
  amount numeric(12,2);
  received numeric(12,2);
  paid numeric(12,2);
  remaining numeric(12,2);
  order_paid boolean;
begin
  select p.role_name into role_name from public.profiles p where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER', 'CASHIER') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then raise exception 'PAYMENTS_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('bill-payment:' || coalesce(p_idempotency_key,''), 0));
  select * into bill from public.order_bills where id = p_bill_id for update;
  if not found then raise exception 'BILL_NOT_FOUND'; end if;
  if bill.status = 'PAID' then raise exception 'BILL_ALREADY_PAID'; end if;
  paid := 0;
  for payment in select * from jsonb_array_elements(p_payments) loop
    method := upper(coalesce(payment->>'method',''));
    amount := round((payment->>'amount')::numeric, 2);
    received := round(coalesce((payment->>'receivedAmount')::numeric, amount), 2);
    if method not in ('CASH','CARD','QR','EWALLET') or amount <= 0 then raise exception 'INVALID_PAYMENT'; end if;
    if method <> 'CASH' and amount > bill.total - bill.paid_amount - paid then raise exception 'PAYMENT_EXCEEDS_BALANCE'; end if;
    if method = 'CASH' and received < amount then raise exception 'INSUFFICIENT_CASH_RECEIVED'; end if;
    paid := paid + amount;
    insert into public.payments(order_id, bill_id, user_id, payment_method, amount, received_amount, change_amount, reference, status, paid_at, idempotency_key, request_fingerprint)
    values (bill.order_id, bill.id, caller_id, method, amount, received, greatest(received-amount,0), 'BILL-' || bill.id::text, 'PAID', now(), left(p_idempotency_key || '-' || method || '-' || amount::text,128), md5(bill.id::text || '|' || method || '|' || amount::text));
  end loop;
  remaining := round(bill.total - bill.paid_amount - paid, 2);
  if remaining <> 0 then raise exception 'BILL_BALANCE_REMAINING'; end if;
  update public.order_bills set paid_amount = total, status = 'PAID', paid_at = now() where id = bill.id;
  select not exists(select 1 from public.order_bills where order_id = bill.order_id and status <> 'PAID') into order_paid;
  if order_paid then update public.orders set payment_status='PAID' where id=bill.order_id; end if;
  return jsonb_build_object('billId', bill.id, 'paidAmount', bill.total, 'remainingAmount', 0, 'orderPaid', order_paid);
end;
$$;

revoke all on function public.create_pos_bill_split(uuid,text,integer,jsonb) from public, anon;
grant execute on function public.create_pos_bill_split(uuid,text,integer,jsonb) to authenticated;
revoke all on function public.complete_pos_bill_payment(uuid,jsonb,text) from public, anon;
grant execute on function public.complete_pos_bill_payment(uuid,jsonb,text) to authenticated;
