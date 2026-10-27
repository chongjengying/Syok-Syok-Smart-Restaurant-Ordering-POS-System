begin;

alter table public.refunds
  drop constraint if exists refunds_status_check;
alter table public.refunds
  add constraint refunds_status_check check (status in ('PENDING','APPROVED','PROCESSING','COMPLETED','FAILED','CANCELLED'));
alter table public.refunds
  add column if not exists refund_type text not null default 'FULL' check (refund_type in ('FULL','PARTIAL','ITEM')),
  add column if not exists tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  add column if not exists service_charge_amount numeric(12,2) not null default 0 check (service_charge_amount >= 0),
  add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
  add column if not exists approved_at timestamptz,
  add column if not exists original_receipt_number text,
  add column if not exists original_order_number text,
  add column if not exists original_payment_method text,
  add column if not exists cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict,
  add column if not exists terminal_id uuid references public.pos_terminals(id) on delete restrict;
drop index if exists public.idx_refunds_one_completed_per_order;
create index if not exists idx_refunds_order_status on public.refunds(order_id,status,refunded_at desc);

alter table public.orders add column if not exists refund_status text not null default 'NONE';
alter table public.orders drop constraint if exists orders_refund_status_check;
alter table public.orders add constraint orders_refund_status_check check (refund_status in ('NONE','PARTIALLY_REFUNDED','FULLY_REFUNDED'));

create table if not exists public.refund_items (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null references public.refunds(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  amount numeric(12,2) not null check (amount > 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  created_at timestamptz not null default now(),
  unique(refund_id,order_item_id)
);
create index if not exists idx_refund_items_order_item on public.refund_items(order_item_id);
alter table public.refund_items enable row level security;
drop policy if exists refund_items_read on public.refund_items;
create policy refund_items_read on public.refund_items for select to authenticated
using (exists(select 1 from public.refunds r join public.orders o on o.id=r.order_id where r.id=refund_id and public.can_access_branch(o.branch_id) and public.has_pos_permission('payment.refund')));
revoke all on public.refund_items from public,anon,authenticated;
grant select on public.refund_items to authenticated;

create table if not exists public.refund_receipts (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid not null unique references public.refunds(id) on delete restrict,
  receipt_number text not null unique,
  original_receipt_number text,
  order_number text not null,
  amount numeric(12,2) not null check (amount > 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  payment_method text not null,
  reason text not null,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  items_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(items_snapshot)='array')
);
alter table public.refund_receipts enable row level security;
create policy refund_receipts_read on public.refund_receipts for select to authenticated
using (exists(select 1 from public.refunds r join public.orders o on o.id=r.order_id where r.id=refund_id and public.can_access_branch(o.branch_id) and public.has_pos_permission('payment.refund')));
revoke all on public.refund_receipts from public,anon,authenticated;
grant select on public.refund_receipts to authenticated;

create or replace function public.issue_refund_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
declare payment_row public.payments%rowtype; order_row public.orders%rowtype;
begin
  if new.status<>'COMPLETED' then return new; end if;
  select * into order_row from public.orders where id=new.order_id;
  select * into payment_row from public.payments where id=new.payment_id;
  insert into public.refund_receipts(refund_id,receipt_number,original_receipt_number,order_number,amount,tax_amount,payment_method,reason,issued_by,items_snapshot)
  values(new.id,public.next_pos_business_number('RFD'),new.original_receipt_number,order_row.order_number,new.amount,new.tax_amount,payment_row.payment_method,new.reason,new.requested_by,
    coalesce((select jsonb_agg(jsonb_build_object('orderItemId',ri.order_item_id,'product',ri.product_name_snapshot,'quantity',ri.quantity,'amount',ri.amount,'taxAmount',ri.tax_amount) order by ri.created_at) from public.refund_items ri where ri.refund_id=new.id),'[]'::jsonb))
  on conflict(refund_id) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_issue_refund_receipt on public.refunds;
create trigger trg_issue_refund_receipt after insert on public.refunds for each row execute function public.issue_refund_receipt();

create or replace function public.refund_pos_order(
  p_order_id uuid,p_reason text,p_idempotency_key text,
  p_amount numeric default null,p_items jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  caller_id uuid:=auth.uid(); ord public.orders%rowtype; paid_payment public.payments%rowtype;
  existing_refund public.refunds%rowtype; created_refund public.refunds%rowtype;
  reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),''); key text:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),'');
  paid_total numeric(12,2); prior_refunded numeric(12,2); remaining numeric(12,2); requested numeric(12,2);
  refund_type text; fingerprint text; item_entry jsonb; item_id uuid; requested_qty integer;
  line public.order_items%rowtype; already_qty integer; item_amount numeric(12,2); basis numeric(12,2); tax_total numeric(12,2):=0;
begin
  if not public.has_pos_permission('payment.refund') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if reason is null or char_length(reason)<3 then raise exception 'REFUND_REASON_REQUIRED'; end if;
  if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_REFUND_ITEMS'; end if;
  fingerprint:=md5(p_order_id::text||'|'||reason||'|'||coalesce(p_amount::text,'')||'|'||p_items::text);
  perform pg_advisory_xact_lock(hashtextextended('refund:'||key,0));
  select * into existing_refund from public.refunds where idempotency_key=key for update;
  if found then
    if existing_refund.order_id<>p_order_id or existing_refund.request_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    return jsonb_build_object('refund',row_to_json(existing_refund),'replayed',true,'remainingRefundable',greatest((select coalesce(sum(amount),0) from public.payments where order_id=p_order_id and status in ('PAID','REFUNDED'))-(select coalesce(sum(amount),0) from public.refunds where order_id=p_order_id and status='COMPLETED'),0));
  end if;
  select * into ord from public.orders where id=p_order_id for update;
  if not found or not public.can_access_branch(ord.branch_id) then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.status<>'COMPLETED' or ord.payment_status not in ('PAID','REFUNDED') then raise exception 'ORDER_NOT_REFUNDABLE'; end if;
  select round(coalesce(sum(amount),0),2) into paid_total from public.payments where order_id=ord.id and status in ('PAID','REFUNDED');
  select round(coalesce(sum(amount),0),2) into prior_refunded from public.refunds where order_id=ord.id and status='COMPLETED';
  remaining:=round(paid_total-prior_refunded,2);
  if remaining<=0 then raise exception 'ORDER_ALREADY_REFUNDED'; end if;
  select * into paid_payment from public.payments where order_id=ord.id and status in ('PAID','REFUNDED') order by paid_at desc nulls last,id desc for update limit 1;
  if not found then raise exception 'SUCCESSFUL_PAYMENT_NOT_FOUND'; end if;
  if jsonb_array_length(p_items)>0 then
    refund_type:='ITEM'; requested:=0;
    select round(coalesce(sum(case when coalesce(line_total,0)>0 then line_total else subtotal end),0),2) into basis from public.order_items where order_id=ord.id and item_status<>'VOIDED';
    if basis<=0 then raise exception 'REFUND_ITEMS_NOT_ELIGIBLE'; end if;
    for item_entry in select value from jsonb_array_elements(p_items) loop
      begin item_id:=(item_entry->>'orderItemId')::uuid; requested_qty:=(item_entry->>'quantity')::integer; exception when others then raise exception 'INVALID_REFUND_ITEMS'; end;
      if requested_qty is null or requested_qty<=0 then raise exception 'INVALID_REFUND_QUANTITY'; end if;
      select * into line from public.order_items where id=item_id and order_id=ord.id for update;
      if not found or line.item_status='VOIDED' then raise exception 'REFUND_ITEM_NOT_FOUND'; end if;
      select coalesce(sum(quantity),0) into already_qty from public.refund_items ri join public.refunds r on r.id=ri.refund_id where ri.order_item_id=line.id and r.status='COMPLETED';
      if already_qty+requested_qty>line.quantity then raise exception 'REFUND_QUANTITY_EXCEEDS_REMAINING'; end if;
      item_amount:=round((case when coalesce(line.line_total,0)>0 then line.line_total else line.subtotal end)/line.quantity*requested_qty,2);
      requested:=requested+item_amount; tax_total:=tax_total+round(coalesce(line.tax_amount,0)/line.quantity*requested_qty,2);
    end loop;
  else
    requested:=coalesce(p_amount,remaining); refund_type:=case when requested>=remaining then 'FULL' else 'PARTIAL' end;
  end if;
  if requested<=0 or requested>remaining then raise exception 'REFUND_AMOUNT_EXCEEDS_REMAINING'; end if;
  insert into public.refunds(refund_number,order_id,payment_id,requested_by,amount,reason,status,idempotency_key,request_fingerprint,refund_type,tax_amount,original_receipt_number,original_order_number,original_payment_method,cashier_shift_id,terminal_id)
  values(public.next_pos_business_number('REF'),ord.id,paid_payment.id,caller_id,requested,reason,'COMPLETED',key,fingerprint,refund_type,tax_total,(select receipt_number from public.receipts where order_id=ord.id),ord.order_number,paid_payment.payment_method,coalesce((select cs.id from public.cashier_shifts cs where cs.terminal_id=(public.current_terminal_staff_session()).terminal_id and cs.status='OPEN'),paid_payment.cashier_shift_id),coalesce((public.current_terminal_staff_session()).terminal_id,paid_payment.terminal_id)) returning * into created_refund;
  if jsonb_array_length(p_items)>0 then
    for item_entry in select value from jsonb_array_elements(p_items) loop
      item_id:=(item_entry->>'orderItemId')::uuid; requested_qty:=(item_entry->>'quantity')::integer;
      select * into line from public.order_items where id=item_id and order_id=ord.id;
      item_amount:=round((case when coalesce(line.line_total,0)>0 then line.line_total else line.subtotal end)/line.quantity*requested_qty,2);
      insert into public.refund_items(refund_id,order_item_id,product_name_snapshot,quantity,amount,tax_amount) values(created_refund.id,line.id,line.product_name_snapshot,requested_qty,item_amount,round(coalesce(line.tax_amount,0)/line.quantity*requested_qty,2));
    end loop;
    update public.refund_receipts rr set items_snapshot=coalesce((select jsonb_agg(jsonb_build_object('orderItemId',ri.order_item_id,'product',ri.product_name_snapshot,'quantity',ri.quantity,'amount',ri.amount,'taxAmount',ri.tax_amount) order by ri.created_at) from public.refund_items ri where ri.refund_id=created_refund.id),'[]'::jsonb) where rr.refund_id=created_refund.id;
  end if;
  if requested>=remaining then
    update public.payments set status='REFUNDED',updated_at=now() where order_id=ord.id and status='PAID';
    update public.orders set payment_status='REFUNDED',refund_status='FULLY_REFUNDED' where id=ord.id;
  else
    update public.orders set refund_status='PARTIALLY_REFUNDED' where id=ord.id;
  end if;
  perform public.write_pos_audit('PAYMENT_REFUNDED','REFUND',created_refund.id,reason,jsonb_build_object('orderId',ord.id,'paymentId',paid_payment.id,'amount',requested,'refundType',refund_type,'remainingRefundable',round(remaining-requested,2)));
  return jsonb_build_object('refund',row_to_json(created_refund),'replayed',false,'remainingRefundable',round(remaining-requested,2));
end;
$$;

create or replace function public.refund_pos_order(p_order_id uuid,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin return public.refund_pos_order(p_order_id,p_reason,p_idempotency_key,null,'[]'::jsonb); end;
$$;
revoke all on function public.refund_pos_order(uuid,text,text,numeric,jsonb),public.refund_pos_order(uuid,text,text) from public,anon;
grant execute on function public.refund_pos_order(uuid,text,text,numeric,jsonb),public.refund_pos_order(uuid,text,text) to authenticated;

commit;
