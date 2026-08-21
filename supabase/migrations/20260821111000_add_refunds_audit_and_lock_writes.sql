begin;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action varchar(80) not null,
  entity_type varchar(50) not null,
  entity_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index idx_audit_logs_entity on public.audit_logs(entity_type, entity_id, created_at desc);
create index idx_audit_logs_actor on public.audit_logs(actor_id, created_at desc);
alter table public.audit_logs enable row level security;
create policy management_read_audit_logs on public.audit_logs
for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER'));
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

create or replace function public.write_pos_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare audit_id uuid;
begin
  if btrim(coalesce(p_action, '')) = '' or btrim(coalesce(p_entity_type, '')) = '' then
    raise exception 'INVALID_AUDIT_EVENT';
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, reason, metadata)
  values (
    auth.uid(), upper(left(btrim(p_action), 80)), upper(left(btrim(p_entity_type), 50)),
    p_entity_id, nullif(left(btrim(coalesce(p_reason, '')), 500), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into audit_id;
  return audit_id;
end;
$$;
revoke all on function public.write_pos_audit(text,text,uuid,text,jsonb)
from public, anon, authenticated;

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  refund_number varchar(32) not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status varchar(12) not null default 'COMPLETED' check (status = 'COMPLETED'),
  idempotency_key varchar(128) not null unique,
  request_fingerprint text not null,
  refunded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint refunds_number_format_check
    check (refund_number ~ '^REF-[0-9]{8}-[0-9]{6}$')
);
create unique index idx_refunds_one_completed_per_order
  on public.refunds(order_id) where status = 'COMPLETED';
create index idx_refunds_payment_id on public.refunds(payment_id);
create index idx_refunds_refunded_at on public.refunds(refunded_at desc);
alter table public.refunds enable row level security;
create policy finance_staff_read_refunds on public.refunds
for select to authenticated
using (public.current_pos_role() in ('ADMIN', 'MANAGER', 'CASHIER'));
revoke all on public.refunds from public, anon, authenticated;
grant select on public.refunds to authenticated;
grant all on public.refunds to service_role;

create or replace function public.refund_pos_order(
  p_order_id uuid,
  p_reason text,
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
  ord public.orders%rowtype;
  paid_payment public.payments%rowtype;
  existing_refund public.refunds%rowtype;
  created_refund public.refunds%rowtype;
  normalized_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  fingerprint text;
begin
  select role_name into role_name from public.profiles
  where id = caller_id and status = 'ACTIVE';
  if coalesce(role_name, '') not in ('ADMIN', 'MANAGER') then
    raise exception 'INSUFFICIENT_PERMISSION';
  end if;
  if normalized_reason is null or char_length(normalized_reason) < 3 then
    raise exception 'REFUND_REASON_REQUIRED';
  end if;
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  fingerprint := md5(p_order_id::text || '|' || normalized_reason);

  perform pg_advisory_xact_lock(hashtextextended('refund:' || normalized_key, 0));
  select * into existing_refund from public.refunds
  where idempotency_key = normalized_key for update;
  if found then
    if existing_refund.order_id <> p_order_id
       or existing_refund.request_fingerprint <> fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';
    end if;
    return jsonb_build_object('refund', row_to_json(existing_refund), 'replayed', true);
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.payment_status = 'REFUNDED' then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
  if ord.payment_status <> 'PAID' or ord.status <> 'COMPLETED' then
    raise exception 'ORDER_NOT_REFUNDABLE';
  end if;
  select * into paid_payment from public.payments
  where order_id = ord.id and status = 'PAID'
  order by paid_at desc for update limit 1;
  if not found then raise exception 'SUCCESSFUL_PAYMENT_NOT_FOUND'; end if;
  if (select round(sum(amount), 2) from public.payments where order_id = ord.id and status = 'PAID')
     <> round(ord.total, 2) then
    raise exception 'PARTIAL_REFUND_NOT_SUPPORTED';
  end if;

  insert into public.refunds(
    refund_number, order_id, payment_id, requested_by, amount, reason,
    idempotency_key, request_fingerprint
  ) values (
    public.next_pos_business_number('REF'), ord.id, paid_payment.id, caller_id,
    ord.total, normalized_reason, normalized_key, fingerprint
  ) returning * into created_refund;

  update public.payments set status = 'REFUNDED', updated_at = now()
  where order_id = ord.id and status = 'PAID';
  update public.orders set payment_status = 'REFUNDED' where id = ord.id;
  perform public.write_pos_audit(
    'ORDER_REFUNDED', 'ORDER', ord.id, normalized_reason,
    jsonb_build_object(
      'refund_id', created_refund.id,
      'refund_number', created_refund.refund_number,
      'amount', created_refund.amount,
      'receipt_id', (select id from public.receipts where order_id = ord.id)
    )
  );
  return jsonb_build_object('refund', row_to_json(created_refund), 'replayed', false);
end;
$$;
revoke all on function public.refund_pos_order(uuid,text,text) from public, anon;
grant execute on function public.refund_pos_order(uuid,text,text) to authenticated;

-- Operational mutations must use the audited RPC/Edge boundaries. Read grants
-- remain in place and existing least-privilege SELECT policies still apply.
revoke insert, update, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items from authenticated;
revoke insert, update, delete on public.order_item_options from authenticated;
revoke insert, update, delete on public.order_item_batches from authenticated;
revoke insert, update, delete on public.order_submissions from authenticated;
revoke insert, update, delete on public.order_status_history from authenticated;
revoke insert, update, delete on public.order_bills from authenticated;
revoke insert, update, delete on public.order_bill_items from authenticated;
revoke insert, update, delete on public.payments from authenticated;
revoke insert, update, delete on public.receipts from authenticated;
revoke insert, update, delete on public.refunds from authenticated;
revoke insert, update, delete on public.kitchen_orders from authenticated;
revoke insert, update, delete on public.kitchen_order_items from authenticated;
revoke insert, update, delete on public.table_activity_logs from authenticated;

drop policy if exists admin_full_access_orders on public.orders;
drop policy if exists admin_full_access_order_items on public.order_items;
drop policy if exists admin_full_access_order_item_options on public.order_item_options;
drop policy if exists admin_full_access_order_item_batches on public.order_item_batches;
drop policy if exists admin_full_access_order_submissions on public.order_submissions;
drop policy if exists admin_full_access_order_status_history on public.order_status_history;
drop policy if exists admin_full_access_payments on public.payments;
drop policy if exists admin_full_access_kitchen_orders on public.kitchen_orders;
drop policy if exists admin_full_access_kitchen_order_items on public.kitchen_order_items;
drop policy if exists admin_full_access_table_activity_logs on public.table_activity_logs;

commit;
