begin;

-- Explicit capabilities keep exceptional financial actions out of generic status APIs.
insert into public.permissions(code,module,description) values
 ('order.cancel','operations','Cancel an eligible unpaid order with a reason'),
 ('order.reopen','operations','Reopen an eligible completed unpaid order'),
 ('payment.void','finance','Reverse a completed payment without deleting history'),
 ('receipt.reprint','finance','Reprint an issued receipt with an audit record')
on conflict(code) do update set module=excluded.module,description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('ADMIN','MANAGER') and p.code in ('order.cancel','order.reopen','payment.void','receipt.reprint')
on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name='WAITER' and p.code='order.cancel' on conflict do nothing;

alter table public.orders
 add column if not exists cancelled_by uuid references public.profiles(id) on delete restrict,
 add column if not exists cancelled_at timestamptz,
 add column if not exists cancellation_reason text,
 add column if not exists status_before_cancel varchar(20),
 add column if not exists reopened_by uuid references public.profiles(id) on delete restrict,
 add column if not exists reopened_at timestamptz,
 add column if not exists reopen_reason text,
 add column if not exists reopen_count integer not null default 0;
alter table public.orders drop constraint if exists orders_cancellation_metadata_check;
alter table public.orders add constraint orders_cancellation_metadata_check check(
 status<>'CANCELLED' or (cancelled_by is not null and cancelled_at is not null and char_length(btrim(cancellation_reason)) between 3 and 500)
) not valid;

create table public.order_lifecycle_actions(
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete restrict,
 action varchar(12) not null check(action in('CANCEL','REOPEN')), previous_status varchar(20) not null,
 new_status varchar(20) not null, actor_id uuid not null references public.profiles(id) on delete restrict,
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 device_context jsonb not null default '{}'::jsonb check(jsonb_typeof(device_context)='object'), created_at timestamptz not null default now()
);
create index idx_order_lifecycle_actions_order on public.order_lifecycle_actions(order_id,created_at desc);
alter table public.order_lifecycle_actions enable row level security;
create policy lifecycle_management_read on public.order_lifecycle_actions for select to authenticated using(public.has_pos_permission('audit.view'));
revoke all on public.order_lifecycle_actions from public,anon,authenticated;
grant select on public.order_lifecycle_actions to authenticated; grant all on public.order_lifecycle_actions to service_role;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check(status in('PENDING','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','VOIDED'));
alter table public.payments add column if not exists voided_by uuid references public.profiles(id) on delete restrict,
 add column if not exists voided_at timestamptz, add column if not exists void_reason text,
 add column if not exists provider_id text,
 add column if not exists confirmed_by uuid references public.profiles(id) on delete restrict,
 add column if not exists confirmed_at timestamptz,
 add column if not exists optional_reference_no text;

create table if not exists public.payment_providers(
 id uuid primary key default gen_random_uuid(),
 provider_id text not null unique check(provider_id ~ '^[A-Z0-9_]{2,40}$'),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 80),
 enabled boolean not null default true,
 sort_order integer not null default 100 check(sort_order between 0 and 999),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
insert into public.payment_providers(provider_id,display_name,enabled,sort_order) values
 ('TNG_EWALLET','Touch ''n Go eWallet',true,10),
 ('GRABPAY','GrabPay',true,20),
 ('SHOPEEPAY','ShopeePay',true,30),
 ('BOOST','Boost',true,40),
 ('DUITNOW_QR','DuitNow QR',true,50),
 ('MAE','MAE',true,60),
 ('OTHER','Other',true,999)
on conflict(provider_id) do nothing;
alter table public.payment_providers enable row level security;
drop policy if exists payment_provider_staff_read on public.payment_providers;
create policy payment_provider_staff_read on public.payment_providers for select to authenticated using(public.current_pos_role() in('ADMIN','MANAGER','CASHIER'));
revoke all on public.payment_providers from public,anon,authenticated;
grant select on public.payment_providers to authenticated; grant all on public.payment_providers to service_role;

create or replace function public.list_payment_providers() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'providerId',provider_id,'displayName',display_name,'enabled',enabled,'sortOrder',sort_order) order by sort_order,display_name) from public.payment_providers),'[]'::jsonb);
end;$$;

create or replace function public.update_payment_providers(p_providers jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare entry jsonb; pid text; pname text; enabled_value boolean; sort_value integer;
begin
 if not public.has_pos_permission('settings.manage') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if coalesce(jsonb_typeof(p_providers),'null')<>'array' then raise exception 'INVALID_PAYMENT_PROVIDERS';end if;
 for entry in select value from jsonb_array_elements(p_providers) loop
  pid:=upper(btrim(coalesce(entry->>'providerId',entry->>'provider_id','')));
  pname:=btrim(coalesce(entry->>'displayName',entry->>'display_name',''));
  enabled_value:=coalesce((entry->>'enabled')::boolean,true);
  sort_value:=coalesce((entry->>'sortOrder')::integer,(entry->>'sort_order')::integer,100);
  if pid !~ '^[A-Z0-9_]{2,40}$' or char_length(pname) not between 2 and 80 then raise exception 'INVALID_PAYMENT_PROVIDER';end if;
  insert into public.payment_providers(provider_id,display_name,enabled,sort_order,updated_at)
  values(pid,pname,enabled_value,sort_value,now())
  on conflict(provider_id) do update set display_name=excluded.display_name,enabled=excluded.enabled,sort_order=excluded.sort_order,updated_at=now();
 end loop;
 return public.list_payment_providers();
end;$$;

create table public.payment_voids(
 id uuid primary key default gen_random_uuid(), void_number varchar(64) not null unique,
 order_id uuid not null references public.orders(id) on delete restrict,
 payment_id uuid not null references public.payments(id) on delete restrict,
 receipt_id uuid references public.receipts(id) on delete restrict,
 amount numeric(12,2) not null check(amount>0), payment_method varchar(30) not null,
 requested_by uuid not null references public.profiles(id) on delete restrict,
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 idempotency_key varchar(128) not null unique, request_fingerprint text not null,
 device_context jsonb not null default '{}'::jsonb check(jsonb_typeof(device_context)='object'),
 status varchar(12) not null default 'COMPLETED' check(status='COMPLETED'), voided_at timestamptz not null default now()
);
create index idx_payment_voids_order on public.payment_voids(order_id,voided_at desc);
alter table public.payment_voids enable row level security;
create policy payment_void_finance_read on public.payment_voids for select to authenticated using(public.has_pos_permission('payment.view'));
revoke all on public.payment_voids from public,anon,authenticated; grant select on public.payment_voids to authenticated; grant all on public.payment_voids to service_role;

create table public.receipt_number_counters(
 branch_id uuid not null references public.branches(id) on delete restrict, business_date date not null,
 last_value bigint not null check(last_value between 1 and 999999), primary key(branch_id,business_date)
);
revoke all on public.receipt_number_counters from public,anon,authenticated; grant all on public.receipt_number_counters to service_role;
create or replace function public.next_branch_receipt_number(p_branch_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare d date:=(clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date; n bigint; branch_code text;
begin
 select upper(regexp_replace(code,'[^A-Za-z0-9]','','g')) into branch_code from public.branches where id=p_branch_id and status='ACTIVE' for share;
 if branch_code is null then raise exception 'ACTIVE_BRANCH_REQUIRED';end if;
 insert into public.receipt_number_counters(branch_id,business_date,last_value) values(p_branch_id,d,1)
 on conflict(branch_id,business_date) do update set last_value=public.receipt_number_counters.last_value+1 returning last_value into n;
 if n>999999 then raise exception 'RECEIPT_NUMBER_EXHAUSTED';end if;
 return 'RCP-'||branch_code||'-'||to_char(d,'YYYYMMDD')||'-'||lpad(n::text,6,'0');
end;$$;
revoke all on function public.next_branch_receipt_number(uuid) from public,anon,authenticated;

alter table public.receipts drop constraint if exists receipts_status_check;
alter table public.receipts add constraint receipts_status_check check(status in('ISSUED','VOIDED'));
alter table public.receipts
 add column if not exists branch_id uuid references public.branches(id) on delete restrict,
 add column if not exists order_number_snapshot varchar(64), add column if not exists table_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists cashier_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists restaurant_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists line_items_snapshot jsonb not null default '[]'::jsonb,
 add column if not exists financial_snapshot jsonb not null default '{}'::jsonb,
 add column if not exists payments_snapshot jsonb not null default '[]'::jsonb,
 add column if not exists voided_by uuid references public.profiles(id) on delete restrict,
 add column if not exists voided_at timestamptz, add column if not exists void_reason text,
 add column if not exists reprint_count integer not null default 0 check(reprint_count>=0);
update public.receipts r set branch_id=o.branch_id,order_number_snapshot=o.order_number,
 financial_snapshot=jsonb_build_object('subtotal',r.subtotal,'discount',r.discount,'tax',r.tax,'serviceCharge',r.service_charge,'total',r.total,'paidAmount',r.paid_amount,'currencyCode',r.currency_code,'taxRate',r.tax_rate,'serviceChargeRate',r.service_charge_rate,'rounding',r.rounding)
from public.orders o where o.id=r.order_id and r.branch_id is null;
alter table public.receipts alter column branch_id set not null,alter column order_number_snapshot set not null;

create table public.receipt_print_history(
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.receipts(id) on delete restrict,
 reprint_number integer not null check(reprint_number>0), reprinted_by uuid not null references public.profiles(id) on delete restrict,
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 device_context jsonb not null default '{}'::jsonb check(jsonb_typeof(device_context)='object'), reprinted_at timestamptz not null default now(),
 unique(receipt_id,reprint_number)
);
alter table public.receipt_print_history enable row level security;
create policy receipt_print_finance_read on public.receipt_print_history for select to authenticated using(public.has_pos_permission('payment.view'));
revoke all on public.receipt_print_history from public,anon,authenticated; grant select on public.receipt_print_history to authenticated; grant all on public.receipt_print_history to service_role;

create or replace function public.issue_paid_order_receipt() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid; paid numeric(12,2); items jsonb; payment_rows jsonb; restaurant jsonb; table_data jsonb; cashier jsonb;
begin
 if new.payment_status<>'PAID' or old.payment_status is not distinct from new.payment_status then return new;end if;
 select p.user_id,round(sum(p.amount),2) into actor,paid from public.payments p where p.order_id=new.id and p.status='PAID' group by p.user_id order by max(p.paid_at) desc limit 1;
 if actor is null or coalesce(paid,0)<round(new.total,2) then raise exception 'PAID_ORDER_REQUIRES_SUCCESSFUL_PAYMENT';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'name',i.product_name_snapshot,'quantity',i.quantity,'unitPrice',i.unit_price,'subtotal',i.subtotal,'status',i.item_status) order by i.created_at),'[]') into items from public.order_items i where i.order_id=new.id and i.item_status<>'VOIDED';
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'paymentNumber',p.payment_number,'method',p.payment_method,'providerId',p.provider_id,'providerName',pp.display_name,'amount',p.amount,'reference',coalesce(p.optional_reference_no,p.transaction_reference,p.reference),'paidAt',p.paid_at) order by p.paid_at),'[]') into payment_rows from public.payments p left join public.payment_providers pp on pp.provider_id=p.provider_id where p.order_id=new.id and p.status='PAID';
 select coalesce(to_jsonb(s)-'password'-'secret','{}') into restaurant from public.restaurant_system_settings s limit 1;
 select coalesce(jsonb_build_object('id',t.id,'number',t.table_number,'name',t.table_name),'{}') into table_data from public.restaurant_tables t where t.id=new.restaurant_table_id;
 select jsonb_build_object('id',p.id,'name',p.name,'username',p.username) into cashier from public.profiles p where p.id=actor;
 insert into public.receipts(receipt_number,order_id,issued_by,branch_id,order_number_snapshot,table_snapshot,cashier_snapshot,restaurant_snapshot,line_items_snapshot,financial_snapshot,payments_snapshot,subtotal,discount,tax,service_charge,total,paid_amount)
 values(public.next_branch_receipt_number(new.branch_id),new.id,actor,new.branch_id,new.order_number,coalesce(table_data,'{}'),coalesce(cashier,'{}'),coalesce(restaurant,'{}'),items,
 jsonb_build_object('subtotal',new.subtotal,'discount',new.discount,'tax',new.tax,'taxName',new.tax_name,'taxRate',new.tax_rate,'taxMode',new.tax_mode,'serviceCharge',new.service_charge,'serviceChargeName',new.service_charge_name,'serviceChargeRate',new.service_charge_rate,'rounding',new.rounding,'total',new.total,'paidAmount',paid,'currencyCode',new.currency_code),payment_rows,
 new.subtotal,new.discount,new.tax,new.service_charge,new.total,paid) on conflict(order_id) do nothing;
 return new;
end;$$;

create or replace function public.cancel_pos_order(p_order_id uuid,p_reason text,p_device_context jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; role_name text:=public.current_pos_role(); reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),''); actor uuid:=auth.uid();
begin
 if actor is null then raise exception 'AUTHENTICATION_REQUIRED';end if;if not public.has_pos_permission('order.cancel') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 if reason is null or char_length(reason)<3 then raise exception 'CANCELLATION_REASON_REQUIRED';end if;
 if coalesce(jsonb_typeof(p_device_context),'null')<>'object' then raise exception 'INVALID_DEVICE_CONTEXT';end if;
 select * into o from public.orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if o.status='CANCELLED' then raise exception 'ORDER_ALREADY_CANCELLED';end if;if o.status='COMPLETED' then raise exception 'COMPLETED_ORDER_CANNOT_BE_CANCELLED';end if;
 if o.payment_status in('PAID','PARTIALLY_PAID','REFUNDED') or exists(select 1 from public.payments where order_id=o.id and status in('PAID','REFUNDED','VOIDED')) then raise exception 'ORDER_WITH_PAYMENT_CANNOT_BE_CANCELLED';end if;
 if role_name='WAITER' and (o.user_id<>actor or o.status not in('DRAFT','CONFIRMED') or exists(select 1 from public.kitchen_order_items k join public.kitchen_orders ko on ko.id=k.kitchen_order_id where ko.order_id=o.id and upper(k.status) in('PREPARING','READY','COMPLETED'))) then raise exception 'WAITER_CANCELLATION_NOT_ALLOWED';end if;
 if role_name not in('ADMIN','MANAGER','WAITER') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 update public.payments set status='CANCELLED',updated_at=now() where order_id=o.id and status in('PENDING','PROCESSING');
 update public.orders set status_before_cancel=o.status,status='CANCELLED',cancelled_by=actor,cancelled_at=now(),cancellation_reason=reason where id=o.id returning * into o;
 insert into public.order_lifecycle_actions(order_id,action,previous_status,new_status,actor_id,reason,device_context) values(o.id,'CANCEL',o.status_before_cancel,'CANCELLED',actor,reason,p_device_context);
 perform public.write_pos_audit('ORDER_CANCELLED','ORDER',o.id,reason,jsonb_build_object('previousStatus',o.status_before_cancel,'deviceContext',p_device_context));
 return jsonb_build_object('order',to_jsonb(o),'action','CANCEL','replayed',false);
end;$$;

create or replace function public.reopen_pos_order(p_order_id uuid,p_reason text,p_device_context jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),''); actor uuid:=auth.uid(); target text;
begin
 if not public.has_pos_permission('order.reopen') then raise exception 'INSUFFICIENT_PERMISSION';end if;if reason is null or char_length(reason)<3 then raise exception 'REOPEN_REASON_REQUIRED';end if;
 select * into o from public.orders where id=p_order_id for update;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if o.status='CANCELLED' then raise exception 'CANCELLED_ORDER_CANNOT_BE_REOPENED';end if;if o.status<>'COMPLETED' then raise exception 'ORDER_NOT_REOPENABLE';end if;
 if o.payment_status in('PAID','PARTIALLY_PAID','REFUNDED') or exists(select 1 from public.receipts where order_id=o.id) then raise exception 'PAID_ORDER_REQUIRES_ADDITIONAL_BILL';end if;
 target:='SERVED';update public.orders set status=target,reopened_by=actor,reopened_at=now(),reopen_reason=reason,reopen_count=reopen_count+1 where id=o.id returning * into o;
 insert into public.order_lifecycle_actions(order_id,action,previous_status,new_status,actor_id,reason,device_context) values(o.id,'REOPEN','COMPLETED',target,actor,reason,p_device_context);
 perform public.write_pos_audit('ORDER_REOPENED','ORDER',o.id,reason,jsonb_build_object('newStatus',target,'deviceContext',p_device_context));return jsonb_build_object('order',to_jsonb(o),'action','REOPEN');
end;$$;

create or replace function public.void_pos_payment(p_payment_id uuid,p_reason text,p_idempotency_key text,p_device_context jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare pay public.payments%rowtype;o public.orders%rowtype;v public.payment_voids%rowtype;reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');k text:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),'');fp text;remaining numeric(12,2);
begin
 if not public.has_pos_permission('payment.void') then raise exception 'INSUFFICIENT_PERMISSION';end if;if reason is null or char_length(reason)<3 then raise exception 'VOID_REASON_REQUIRED';end if;if k is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED';end if;
 fp:=md5(p_payment_id::text||'|'||reason);perform pg_advisory_xact_lock(hashtextextended('payment-void:'||k,0));select * into v from public.payment_voids where idempotency_key=k for update;
 if found then if v.payment_id<>p_payment_id or v.request_fingerprint<>fp then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST';end if;return jsonb_build_object('void',to_jsonb(v),'replayed',true);end if;
 select * into pay from public.payments where id=p_payment_id for update;if not found then raise exception 'PAYMENT_NOT_FOUND';end if;select * into o from public.orders where id=pay.order_id for update;
 if pay.status<>'PAID' then raise exception 'PAYMENT_NOT_VOIDABLE';end if;if exists(select 1 from public.refunds where payment_id=pay.id and status='COMPLETED') then raise exception 'REFUNDED_PAYMENT_CANNOT_BE_VOIDED';end if;
 insert into public.payment_voids(void_number,order_id,payment_id,receipt_id,amount,payment_method,requested_by,reason,idempotency_key,request_fingerprint,device_context)
 values('VOID-'||to_char(clock_timestamp() at time zone 'Asia/Kuala_Lumpur','YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),o.id,pay.id,(select id from public.receipts where order_id=o.id),pay.amount,pay.payment_method,auth.uid(),reason,k,fp,p_device_context) returning * into v;
 update public.payments set status='VOIDED',voided_by=auth.uid(),voided_at=now(),void_reason=reason,updated_at=now() where id=pay.id;
 select coalesce(round(sum(amount),2),0) into remaining from public.payments where order_id=o.id and status='PAID';
 update public.orders set payment_status=case when remaining=0 then 'UNPAID' when remaining<total then 'PARTIALLY_PAID' else 'PAID' end,status=case when status='COMPLETED' and remaining<total then 'SERVED' else status end where id=o.id;
 update public.receipts set status='VOIDED',voided_by=auth.uid(),voided_at=now(),void_reason=reason where order_id=o.id and status='ISSUED';
 perform public.write_pos_audit('PAYMENT_VOIDED','PAYMENT',pay.id,reason,jsonb_build_object('voidId',v.id,'orderId',o.id,'amount',pay.amount,'remainingPaid',remaining,'deviceContext',p_device_context));return jsonb_build_object('void',to_jsonb(v),'replayed',false);
end;$$;

create or replace function public.get_pos_receipt(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.receipts%rowtype;
begin if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;select * into r from public.receipts where order_id=p_order_id;if not found then raise exception 'RECEIPT_NOT_FOUND';end if;
 return jsonb_build_object('receipt',to_jsonb(r),'printHistory',coalesce((select jsonb_agg(to_jsonb(h) order by h.reprint_number) from public.receipt_print_history h where h.receipt_id=r.id),'[]'));
end;$$;
create or replace function public.reprint_pos_receipt(p_receipt_id uuid,p_reason text,p_device_context jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.receipts%rowtype;h public.receipt_print_history%rowtype;reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin if not public.has_pos_permission('receipt.reprint') then raise exception 'INSUFFICIENT_PERMISSION';end if;if reason is null or char_length(reason)<3 then raise exception 'REPRINT_REASON_REQUIRED';end if;
 select * into r from public.receipts where id=p_receipt_id for update;if not found then raise exception 'RECEIPT_NOT_FOUND';end if;if r.status<>'ISSUED' then raise exception 'VOIDED_RECEIPT_CANNOT_BE_REPRINTED';end if;
 update public.receipts set reprint_count=reprint_count+1 where id=r.id returning * into r;insert into public.receipt_print_history(receipt_id,reprint_number,reprinted_by,reason,device_context) values(r.id,r.reprint_count,auth.uid(),reason,p_device_context) returning * into h;
 perform public.write_pos_audit('RECEIPT_REPRINTED','RECEIPT',r.id,reason,jsonb_build_object('receiptNumber',r.receipt_number,'reprintNumber',h.reprint_number,'deviceContext',p_device_context));return jsonb_build_object('receipt',to_jsonb(r),'reprint',to_jsonb(h));
end;$$;

create or replace function public.process_pos_split_payment(
 p_order_id uuid,p_split_type text,p_payment_method text,p_amount numeric,p_received_amount numeric,p_item_allocations jsonb,p_bill_id uuid,p_idempotency_key text,p_provider text default null,p_transaction_reference text default null,p_provider_id text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare method text:=upper(btrim(coalesce(p_payment_method,'')));provider_key text:=upper(btrim(coalesce(p_provider_id,'')));result jsonb;payment_id uuid;patched public.payments%rowtype;
begin
 if method='E_WALLET' then method:='EWALLET';end if;
 if method in('QR','EWALLET') then
  if provider_key='' then raise exception 'PAYMENT_PROVIDER_REQUIRED';end if;
  perform 1 from public.payment_providers where provider_id=provider_key and enabled=true;
  if not found then raise exception 'PAYMENT_PROVIDER_UNAVAILABLE';end if;
 end if;
 result:=public.process_pos_split_payment(p_order_id,p_split_type,method,p_amount,p_received_amount,p_item_allocations,p_bill_id,p_idempotency_key,coalesce(provider_key,p_provider),p_transaction_reference);
 payment_id:=(result->'payment'->>'id')::uuid;
 update public.payments set provider_id=nullif(provider_key,''),confirmed_by=auth.uid(),confirmed_at=coalesce(paid_at,now()),optional_reference_no=left(nullif(btrim(coalesce(p_transaction_reference,'')),''),150) where id=payment_id returning * into patched;
 return jsonb_set(jsonb_set(result,'{payment}',to_jsonb(patched),true),'{summary}',public.get_pos_payment_summary(p_order_id),true);
end;$$;

create or replace function public.get_pos_payment_summary(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ord public.orders%rowtype;successful_total numeric(12,2);
begin
 if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
 if public.current_pos_role() not in('ADMIN','MANAGER','CASHIER') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 select * into ord from public.orders where id=p_order_id;if not found then raise exception 'ORDER_NOT_FOUND';end if;
 select round(coalesce(sum(amount),0),2) into successful_total from public.payments where order_id=ord.id and status='PAID';
 return jsonb_build_object('orderId',ord.id,'orderNumber',ord.order_number,'orderTotal',round(ord.total,2),'paidAmount',successful_total,'remainingAmount',greatest(round(ord.total-successful_total,2),0),'paymentStatus',case when successful_total<=0 then 'UNPAID' when successful_total<round(ord.total,2) then 'PARTIALLY_PAID' else 'PAID' end,
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',payment.id,'paymentNumber',payment.payment_number,'paymentMethod',payment.payment_method,'amount',payment.amount,'receivedAmount',payment.received_amount,'changeAmount',payment.change_amount,'splitType',payment.split_type,'status',payment.status,'paidAt',payment.paid_at,'cashier',profile.name,'providerId',payment.provider_id,'providerName',provider.display_name,'optionalReferenceNo',payment.optional_reference_no,'paidTotalAfter',payment.running_total,'remainingAfter',greatest(round(ord.total-payment.running_total,2),0)) order by payment.paid_at,payment.id) from (select ledger.*,round(sum(ledger.amount) over(order by ledger.paid_at,ledger.id),2) running_total from public.payments ledger where ledger.order_id=ord.id and ledger.status='PAID') payment left join public.profiles profile on profile.id=payment.user_id left join public.payment_providers provider on provider.provider_id=payment.provider_id),'[]'::jsonb),
 'items', coalesce((
  with item_values as (
   select item.*,
    round(item.subtotal * 100)::bigint as item_cents,
    round(ord.total * 100)::bigint as order_cents,
    sum(round(item.subtotal * 100)::bigint) over () as basis_cents,
    row_number() over (order by item.id) as item_position,
    count(*) over () as item_count
   from public.order_items item
   where item.order_id = ord.id and item.item_status <> 'VOIDED'
  ), valued as (
   select item_values.*,
    case
     when basis_cents <= 0 then 0
     when item_position = item_count then order_cents - coalesce(sum(floor(order_cents * item_cents::numeric / basis_cents)) over (order by item_position rows between unbounded preceding and 1 preceding), 0)
     else floor(order_cents * item_cents::numeric / basis_cents)
    end::bigint as allocated_cents
   from item_values
  )
  select jsonb_agg(jsonb_build_object(
   'orderItemId', valued.id,
   'name', valued.product_name_snapshot,
   'quantity', valued.quantity,
   'allocatedQuantity', coalesce(allocation.quantity, 0),
   'remainingQuantity', valued.quantity - coalesce(allocation.quantity, 0),
   'remainingAmount', round((valued.allocated_cents - coalesce(allocation.amount_cents, 0)) / 100.0, 2),
   'remainingUnitAmounts', coalesce((
    select jsonb_agg(round((floor(valued.allocated_cents::numeric / valued.quantity) + case when unit_number > valued.quantity - (valued.allocated_cents % valued.quantity) then 1 else 0 end) / 100.0, 2) order by unit_number)
    from generate_series(coalesce(allocation.quantity, 0) + 1, valued.quantity) as units(unit_number)
   ), '[]'::jsonb)
  ) order by valued.created_at, valued.id)
  from valued
  left join lateral (
   select sum(payment_item.quantity)::integer as quantity,
    round(sum(payment_item.amount) * 100)::bigint as amount_cents
   from public.payment_items payment_item
   join public.payments payment on payment.id = payment_item.payment_id
   where payment_item.order_item_id = valued.id and payment.status = 'PAID'
  ) allocation on true
 ), '[]'::jsonb));
end;$$;

create or replace function public.list_admin_payments(
 p_search text default null,p_method text default null,p_status text default null,p_provider_id text default null,p_date_from date default null,p_date_to date default null,p_limit integer default 25,p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare rows jsonb;total bigint;safe_limit integer:=least(greatest(coalesce(p_limit,25),1),100);safe_offset integer:=greatest(coalesce(p_offset,0),0);
begin
 if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION';end if;
 select count(*) into total from public.payments p join public.orders o on o.id=p.order_id left join public.profiles staff on staff.id=p.user_id left join public.payment_providers pp on pp.provider_id=p.provider_id
 where (nullif(btrim(p_search),'') is null or p.payment_number ilike '%'||btrim(p_search)||'%' or o.order_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%' or pp.display_name ilike '%'||btrim(p_search)||'%')
 and (nullif(p_method,'') is null or p.payment_method=upper(p_method)) and (nullif(p_status,'') is null or p.status=upper(p_status)) and (nullif(p_provider_id,'') is null or p.provider_id=upper(p_provider_id))
 and (p_date_from is null or coalesce(p.paid_at,p.created_at)>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur') and (p_date_to is null or coalesce(p.paid_at,p.created_at)<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into rows from (
  select p.id,p.payment_number,p.order_id,p.user_id,p.payment_method,p.provider_id,pp.display_name provider_name,p.status,p.amount,p.provider,p.optional_reference_no,p.confirmed_by,p.confirmed_at,p.paid_at,p.created_at,o.order_number,staff.name staff_name
  from public.payments p join public.orders o on o.id=p.order_id left join public.profiles staff on staff.id=p.user_id left join public.payment_providers pp on pp.provider_id=p.provider_id
  where (nullif(btrim(p_search),'') is null or p.payment_number ilike '%'||btrim(p_search)||'%' or o.order_number ilike '%'||btrim(p_search)||'%' or staff.name ilike '%'||btrim(p_search)||'%' or pp.display_name ilike '%'||btrim(p_search)||'%')
  and (nullif(p_method,'') is null or p.payment_method=upper(p_method)) and (nullif(p_status,'') is null or p.status=upper(p_status)) and (nullif(p_provider_id,'') is null or p.provider_id=upper(p_provider_id))
  and (p_date_from is null or coalesce(p.paid_at,p.created_at)>=p_date_from::timestamp at time zone 'Asia/Kuala_Lumpur') and (p_date_to is null or coalesce(p.paid_at,p.created_at)<(p_date_to+1)::timestamp at time zone 'Asia/Kuala_Lumpur') order by p.created_at desc limit safe_limit offset safe_offset)x;
 return jsonb_build_object('rows',rows,'total',total,'limit',safe_limit,'offset',safe_offset);
end;$$;

revoke all on function public.cancel_pos_order(uuid,text,jsonb),public.reopen_pos_order(uuid,text,jsonb),public.void_pos_payment(uuid,text,text,jsonb),public.get_pos_receipt(uuid),public.reprint_pos_receipt(uuid,text,jsonb),public.list_payment_providers(),public.update_payment_providers(jsonb),public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text,text),public.get_pos_payment_summary(uuid),public.list_admin_payments(text,text,text,text,date,date,integer,integer) from public,anon;
grant execute on function public.cancel_pos_order(uuid,text,jsonb),public.reopen_pos_order(uuid,text,jsonb),public.void_pos_payment(uuid,text,text,jsonb),public.get_pos_receipt(uuid),public.reprint_pos_receipt(uuid,text,jsonb),public.list_payment_providers(),public.update_payment_providers(jsonb),public.process_pos_split_payment(uuid,text,text,numeric,numeric,jsonb,uuid,text,text,text,text),public.get_pos_payment_summary(uuid),public.list_admin_payments(text,text,text,text,date,date,integer,integer) to authenticated;

commit;
