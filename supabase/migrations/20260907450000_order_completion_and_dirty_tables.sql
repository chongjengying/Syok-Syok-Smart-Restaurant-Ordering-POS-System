begin;

alter table public.restaurant_tables add column if not exists dirty_at timestamptz,
 add column if not exists dirty_by uuid references public.profiles(id) on delete set null,
 add column if not exists cleaning_started_at timestamptz,
 add column if not exists cleaning_started_by uuid references public.profiles(id) on delete set null,
 add column if not exists cleaning_completed_at timestamptz,
 add column if not exists cleaning_completed_by uuid references public.profiles(id) on delete set null;
alter table public.restaurant_tables drop constraint if exists restaurant_tables_status_check;
alter table public.restaurant_tables add constraint restaurant_tables_status_check check(status in ('AVAILABLE','OCCUPIED','DIRTY','CLEANING','RESERVED','DISABLED'));

create table if not exists public.order_completion_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.orders(id) on delete restrict,
 company_id uuid not null references public.companies(id) on delete restrict, branch_id uuid not null references public.branches(id) on delete restrict,
 terminal_id uuid references public.pos_terminals(id) on delete set null, staff_id uuid references public.profiles(id) on delete set null,
 staff_session_id uuid references public.terminal_staff_sessions(id) on delete set null, previous_order_status text not null, new_order_status text not null,
 previous_table_status text, new_table_status text, completed_at timestamptz not null default clock_timestamp()
);
alter table public.order_completion_events enable row level security;
create policy order_completion_events_read on public.order_completion_events for select to authenticated using(public.can_access_branch(branch_id) and public.has_pos_permission('order.view'));
revoke all on public.order_completion_events from public,anon;
grant select on public.order_completion_events to authenticated;

create or replace function public.finalize_pos_order_completion(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype; receipt public.receipts%rowtype; paid numeric(12,2); table_row public.restaurant_tables%rowtype; prior_table text; prior_order text; session public.terminal_staff_sessions; event public.order_completion_events%rowtype;
begin
 select * into ord from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into event from public.order_completion_events where order_id=ord.id; if found then return jsonb_build_object('orderId',ord.id,'completed',true,'replayed',true,'event',to_jsonb(event)); end if;
 select round(coalesce(sum(amount),0),2) into paid from public.payments where order_id=ord.id and status='PAID';
 if ord.payment_status<>'PAID' or paid<>round(ord.total,2) then raise exception 'ORDER_OUTSTANDING_BALANCE'; end if;
 select * into receipt from public.receipts where order_id=ord.id and status='ISSUED'; if not found then raise exception 'ORDER_RECEIPT_REQUIRED'; end if;
 if exists(select 1 from public.order_items where order_id=ord.id and item_status in ('DRAFT','SUBMITTED','PREPARING','READY')) then raise exception 'ORDER_FULFILLMENT_PENDING'; end if;
 select * into session from public.terminal_staff_sessions where id=ord.staff_session_id;
 if ord.dining_mode='dine-in' and ord.restaurant_table_id is not null then
   select * into table_row from public.restaurant_tables where id=ord.restaurant_table_id for update; if not found then raise exception 'TABLE_NOT_FOUND'; end if; prior_table:=table_row.status;
   if table_row.status not in ('DISABLED','RESERVED') and not exists(select 1 from public.orders o where o.restaurant_table_id=table_row.id and o.id<>ord.id and o.status not in ('COMPLETED','CANCELLED') and o.payment_status in ('UNPAID','PARTIALLY_PAID')) then
     update public.restaurant_tables set status='DIRTY',dirty_at=clock_timestamp(),dirty_by=coalesce(auth.uid(),ord.created_by_staff_id) where id=table_row.id returning * into table_row;
   end if;
 end if;
 prior_order:=ord.status; update public.orders set status='COMPLETED',completed_at=coalesce(completed_at,clock_timestamp()) where id=ord.id returning * into ord;
 insert into public.order_completion_events(order_id,company_id,branch_id,terminal_id,staff_id,staff_session_id,previous_order_status,new_order_status,previous_table_status,new_table_status)
 values(ord.id,ord.company_id,ord.branch_id,coalesce(session.terminal_id,ord.terminal_id),coalesce(auth.uid(),ord.created_by_staff_id),ord.staff_session_id,prior_order,'COMPLETED',prior_table,table_row.status) returning * into event;
 perform public.write_pos_audit('ORDER_COMPLETED','ORDER',ord.id,null,jsonb_build_object('receiptId',receipt.id,'paidAmount',paid,'previousTableStatus',prior_table,'newTableStatus',table_row.status));
 return jsonb_build_object('orderId',ord.id,'completed',true,'replayed',false,'event',to_jsonb(event));
end $$;

-- A receipt is created only after successful settlement.  This trigger runs
-- completion once, even when payment retries/realtime notifications repeat.
create or replace function public.complete_order_after_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 -- Early payment is allowed while kitchen work continues. Receipt issuance must
 -- never fail because food is still being prepared; fulfillment later calls
 -- the same idempotent finalizer.
 if not exists(select 1 from public.order_items where order_id=new.order_id and item_status in ('DRAFT','SUBMITTED','PREPARING','READY')) then
   perform public.finalize_pos_order_completion(new.order_id);
 end if;
 return new;
end $$;
drop trigger if exists trg_complete_order_after_receipt on public.receipts;
create trigger trg_complete_order_after_receipt after insert on public.receipts for each row execute function public.complete_order_after_receipt();

create or replace function public.complete_paid_order_after_fulfillment()
returns trigger language plpgsql security definer set search_path=public as $$
declare ord public.orders%rowtype;
begin
 if new.item_status not in ('SERVED','VOIDED') then return new; end if;
 select * into ord from public.orders where id=new.order_id;
 if ord.payment_status='PAID' and exists(select 1 from public.receipts where order_id=ord.id and status='ISSUED')
   and not exists(select 1 from public.order_items where order_id=ord.id and item_status in ('DRAFT','SUBMITTED','PREPARING','READY')) then
   perform public.finalize_pos_order_completion(ord.id);
 end if;
 return new;
end $$;
drop trigger if exists trg_complete_paid_order_after_fulfillment on public.order_items;
create trigger trg_complete_paid_order_after_fulfillment after update of item_status on public.order_items for each row when(old.item_status is distinct from new.item_status) execute function public.complete_paid_order_after_fulfillment();

create or replace function public.start_table_cleaning(p_table_id uuid)
returns public.restaurant_tables language plpgsql security definer set search_path=public as $$
declare t public.restaurant_tables%rowtype;
begin
 if not public.has_pos_permission('table.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into t from public.restaurant_tables where id=p_table_id and public.can_access_branch(branch_id) for update; if not found then raise exception 'TABLE_NOT_FOUND'; end if;
 if t.status='CLEANING' then return t; end if; if t.status<>'DIRTY' then raise exception 'TABLE_NOT_DIRTY'; end if;
 update public.restaurant_tables set status='CLEANING',cleaning_started_at=clock_timestamp(),cleaning_started_by=auth.uid() where id=t.id returning * into t;
 perform public.log_table_activity(t.id,null,'CLEANING_STARTED','DIRTY','CLEANING',null,'{}'::jsonb); return t;
end $$;

create or replace function public.complete_table_cleaning(p_table_id uuid,p_operation_key text default null)
returns public.restaurant_tables language plpgsql security definer set search_path=public as $$
declare t public.restaurant_tables%rowtype;
begin
 if not public.has_pos_permission('table.manage') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into t from public.restaurant_tables where id=p_table_id and public.can_access_branch(branch_id) for update; if not found then raise exception 'TABLE_NOT_FOUND'; end if;
 if t.status='AVAILABLE' then return t; end if; if t.status<>'CLEANING' then raise exception 'INVALID_TABLE_TRANSITION'; end if;
 if exists(select 1 from public.orders o where o.restaurant_table_id=t.id and o.status not in ('COMPLETED','CANCELLED') and o.payment_status in ('UNPAID','PARTIALLY_PAID')) then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
 update public.restaurant_tables set status='AVAILABLE',cleaning_completed_at=clock_timestamp(),cleaning_completed_by=auth.uid() where id=t.id returning * into t;
 perform public.log_table_activity(t.id,null,'CLEANING_COMPLETED','CLEANING','AVAILABLE',p_operation_key,'{}'::jsonb); return t;
end $$;

revoke all on function public.finalize_pos_order_completion(uuid),public.start_table_cleaning(uuid),public.complete_table_cleaning(uuid,text) from public,anon;
grant execute on function public.finalize_pos_order_completion(uuid),public.start_table_cleaning(uuid),public.complete_table_cleaning(uuid,text) to authenticated;
commit;
