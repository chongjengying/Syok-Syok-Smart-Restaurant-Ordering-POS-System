begin;

alter table public.receipts add column if not exists company_id uuid references public.companies(id) on delete restrict,
 add column if not exists terminal_id uuid references public.pos_terminals(id) on delete set null,
 add column if not exists staff_session_id uuid references public.terminal_staff_sessions(id) on delete set null,
 add column if not exists print_count integer not null default 0,
 add column if not exists last_printed_at timestamptz,
 add column if not exists last_printed_by uuid references public.profiles(id) on delete set null;
update public.receipts r set company_id=o.company_id from public.orders o where o.id=r.order_id and r.company_id is null;
create index if not exists receipts_company_branch_issued_idx on public.receipts(company_id,branch_id,issued_at desc);

create or replace function public.next_branch_receipt_number(p_branch_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare d date; n bigint; branch_code text; branch_timezone text;
begin
 select upper(regexp_replace(code,'[^A-Za-z0-9]','','g')),coalesce(timezone,'Asia/Kuala_Lumpur') into branch_code,branch_timezone from public.branches where id=p_branch_id and status='ACTIVE' for share;
 if branch_code is null then raise exception 'ACTIVE_BRANCH_REQUIRED'; end if;
 d:=(clock_timestamp() at time zone branch_timezone)::date;
 insert into public.receipt_number_counters(branch_id,business_date,last_value) values(p_branch_id,d,1) on conflict(branch_id,business_date) do update set last_value=public.receipt_number_counters.last_value+1 returning last_value into n;
 if n>999999 then raise exception 'RECEIPT_NUMBER_EXHAUSTED'; end if;
 return 'RCP-'||branch_code||'-'||to_char(d,'YYYYMMDD')||'-'||lpad(n::text,6,'0');
end $$;

create table if not exists public.receipt_print_jobs (
 id uuid primary key default gen_random_uuid(), receipt_id uuid not null references public.receipts(id) on delete restrict,
 terminal_id uuid references public.pos_terminals(id) on delete set null, printer_id text, print_type text not null check(print_type in ('ORIGINAL','REPRINT')),
 status text not null default 'QUEUED' check(status in ('QUEUED','PRINTING','PRINTED','FAILED','CANCELLED')),
 attempt_count integer not null default 0 check(attempt_count>=0), requested_by uuid not null references public.profiles(id) on delete restrict,
 requested_at timestamptz not null default clock_timestamp(), printed_at timestamptz, failure_reason text, reprint_history_id uuid references public.receipt_print_history(id) on delete set null
);
create index if not exists receipt_print_jobs_receipt_requested_idx on public.receipt_print_jobs(receipt_id,requested_at desc);
alter table public.receipt_print_jobs enable row level security;
create policy receipt_print_jobs_read on public.receipt_print_jobs for select to authenticated using(exists(select 1 from public.receipts r where r.id=receipt_id and public.can_access_branch(r.branch_id) and public.has_pos_permission('payment.view')));
revoke all on public.receipt_print_jobs from public,anon;
grant select on public.receipt_print_jobs to authenticated;

-- Correctly sum all paid rows (not just the final cashier's rows), and retain
-- item/options/financial snapshots so historical receipts never query menu.
create or replace function public.issue_paid_order_receipt() returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid; paid numeric(12,2); items jsonb; payment_rows jsonb; restaurant jsonb; table_data jsonb; cashier jsonb; session_id uuid; terminal uuid;
begin
 if new.payment_status<>'PAID' or old.payment_status is not distinct from new.payment_status then return new; end if;
 select round(coalesce(sum(amount),0),2) into paid from public.payments where order_id=new.id and status='PAID';
 select p.user_id,p.staff_session_id,p.terminal_id into actor,session_id,terminal from public.payments p where p.order_id=new.id and p.status='PAID' order by p.paid_at desc,p.id desc limit 1;
 if actor is null or paid<>round(new.total,2) then raise exception 'PAID_ORDER_REQUIRES_EXACT_SUCCESSFUL_PAYMENT'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'productId',i.product_id,'name',i.product_name_snapshot,'quantity',i.quantity,'baseUnitPrice',i.base_unit_price,'modifierTotal',i.modifier_total,'unitPrice',i.unit_price,'grossAmount',i.gross_amount,'discountAmount',i.discount_amount,'taxAmount',i.tax_amount,'serviceChargeAmount',i.service_charge_amount,'lineSubtotal',i.line_subtotal,'lineTotal',i.line_total,'note',i.special_request,'options',coalesce((select jsonb_agg(jsonb_build_object('groupName',x.option_group_name,'name',x.option_name,'unitPrice',x.unit_price,'totalPrice',x.total_price) order by x.created_at) from public.order_item_options x where x.order_item_id=i.id),'[]'::jsonb)) order by i.created_at),'[]'::jsonb) into items from public.order_items i where i.order_id=new.id and i.item_status<>'VOIDED';
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'paymentNumber',p.payment_number,'method',p.payment_method,'providerId',p.provider_id,'providerName',pp.display_name,'amount',p.amount,'cashReceived',p.received_amount,'changeGiven',p.change_amount,'reference',coalesce(p.optional_reference_no,p.transaction_reference,p.reference),'confirmationMode',p.confirmation_mode,'paidAt',p.paid_at) order by p.paid_at,p.id),'[]'::jsonb) into payment_rows from public.payments p left join public.payment_providers pp on pp.provider_id=p.provider_id where p.order_id=new.id and p.status='PAID';
 select coalesce(to_jsonb(s)-'password'-'secret','{}') into restaurant from public.restaurant_system_settings s limit 1;
 select coalesce(jsonb_build_object('id',t.id,'number',t.table_number,'name',t.table_name),'{}') into table_data from public.restaurant_tables t where t.id=new.restaurant_table_id;
 select jsonb_build_object('id',p.id,'name',p.name,'username',p.username) into cashier from public.profiles p where p.id=actor;
 insert into public.receipts(receipt_number,order_id,issued_by,company_id,branch_id,terminal_id,staff_session_id,order_number_snapshot,table_snapshot,cashier_snapshot,restaurant_snapshot,line_items_snapshot,financial_snapshot,payments_snapshot,subtotal,discount,tax,service_charge,total,paid_amount)
 values(public.next_branch_receipt_number(new.branch_id),new.id,actor,new.company_id,new.branch_id,terminal,session_id,new.order_number,coalesce(table_data,'{}'),coalesce(cashier,'{}'),coalesce(restaurant,'{}'),items,jsonb_build_object('subtotal',new.subtotal,'discount',new.discount,'tax',new.tax,'taxName',new.tax_name,'taxRate',new.tax_rate,'taxMode',new.tax_mode,'serviceCharge',new.service_charge,'serviceChargeName',new.service_charge_name,'serviceChargeRate',new.service_charge_rate,'rounding',new.rounding,'total',new.total,'paidAmount',paid,'currencyCode',new.currency_code),payment_rows,new.subtotal,new.discount,new.tax,new.service_charge,new.total,paid) on conflict(order_id) do nothing;
 return new;
end $$;

create or replace function public.request_receipt_print(p_receipt_id uuid,p_printer_id text default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.receipts%rowtype; job public.receipt_print_jobs%rowtype; h public.receipt_print_history%rowtype; kind text; reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin
 if not public.has_pos_permission('receipt.reprint') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into r from public.receipts where id=p_receipt_id and public.can_access_branch(branch_id) for update; if not found then raise exception 'RECEIPT_NOT_FOUND'; end if; if r.status<>'ISSUED' then raise exception 'VOIDED_RECEIPT_CANNOT_BE_PRINTED'; end if;
 kind:=case when r.print_count=0 then 'ORIGINAL' else 'REPRINT' end;
 if kind='REPRINT' then if reason is null or length(reason)<3 then raise exception 'REPRINT_REASON_REQUIRED'; end if; update public.receipts set reprint_count=reprint_count+1 where id=r.id returning * into r; insert into public.receipt_print_history(receipt_id,reprint_number,reprinted_by,reason,device_context) values(r.id,r.reprint_count,auth.uid(),reason,jsonb_build_object('printerId',p_printer_id)) returning * into h; end if;
 insert into public.receipt_print_jobs(receipt_id,terminal_id,printer_id,print_type,requested_by,reprint_history_id) values(r.id,(public.current_terminal_staff_session()).terminal_id,nullif(left(btrim(coalesce(p_printer_id,'')),100),''),kind,auth.uid(),h.id) returning * into job;
 update public.receipts set print_count=print_count+1,last_printed_at=clock_timestamp(),last_printed_by=auth.uid() where id=r.id;
 perform public.write_pos_audit(case when kind='REPRINT' then 'RECEIPT_REPRINT_QUEUED' else 'RECEIPT_PRINT_QUEUED' end,'RECEIPT',r.id,reason,jsonb_build_object('receiptNumber',r.receipt_number,'jobId',job.id,'printType',kind)); return jsonb_build_object('receipt',to_jsonb(r),'job',to_jsonb(job));
end $$;
create or replace function public.update_receipt_print_job(p_job_id uuid,p_status text,p_failure_reason text default null)
returns public.receipt_print_jobs language plpgsql security definer set search_path=public as $$
declare job public.receipt_print_jobs%rowtype; target text:=upper(btrim(coalesce(p_status,'')));
begin
 if target not in ('PRINTING','PRINTED','FAILED','CANCELLED') then raise exception 'INVALID_PRINT_JOB_STATUS'; end if;
 select j.* into job from public.receipt_print_jobs j join public.receipts r on r.id=j.receipt_id where j.id=p_job_id and public.can_access_branch(r.branch_id) for update; if not found then raise exception 'PRINT_JOB_NOT_FOUND'; end if;
 if not public.has_pos_permission('receipt.reprint') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 update public.receipt_print_jobs set status=target,attempt_count=case when target='PRINTING' then attempt_count+1 else attempt_count end,printed_at=case when target='PRINTED' then clock_timestamp() else printed_at end,failure_reason=case when target='FAILED' then left(nullif(btrim(coalesce(p_failure_reason,'')),''),500) else null end where id=job.id returning * into job;
 perform public.write_pos_audit('RECEIPT_PRINT_'||target,'RECEIPT_PRINT_JOB',job.id,job.failure_reason,jsonb_build_object('receiptId',job.receipt_id,'printType',job.print_type)); return job;
end $$;

create or replace function public.get_pos_receipt(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.receipts%rowtype;
begin
 if not public.has_pos_permission('payment.view') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into r from public.receipts where order_id=p_order_id and company_id=public.current_user_company_id() and public.can_access_branch(branch_id); if not found then raise exception 'RECEIPT_NOT_FOUND'; end if;
 return jsonb_build_object('receipt',to_jsonb(r),'printHistory',coalesce((select jsonb_agg(to_jsonb(h) order by h.reprint_number) from public.receipt_print_history h where h.receipt_id=r.id),'[]'::jsonb),'printJobs',coalesce((select jsonb_agg(to_jsonb(j) order by j.requested_at) from public.receipt_print_jobs j where j.receipt_id=r.id),'[]'::jsonb));
end $$;

revoke all on function public.request_receipt_print(uuid,text,text),public.update_receipt_print_job(uuid,text,text) from public,anon;
grant execute on function public.request_receipt_print(uuid,text,text),public.update_receipt_print_job(uuid,text,text) to authenticated;
commit;
