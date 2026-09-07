begin;

-- A single server-side evaluator owns promotion, voucher and manual-discount
-- amounts.  The browser may only submit an identifier/code or a request.
alter table public.promotions add column if not exists company_id uuid references public.companies(id) on delete restrict;
alter table public.vouchers add column if not exists company_id uuid references public.companies(id) on delete restrict;
alter table public.order_adjustments add column if not exists requested_by_staff_id uuid references public.profiles(id) on delete restrict;
alter table public.order_adjustments add column if not exists approved_by_staff_id uuid references public.profiles(id) on delete restrict;
alter table public.order_adjustments add column if not exists discount_type text;
alter table public.order_adjustments add column if not exists discount_value numeric(12,2);
alter table public.order_adjustments add column if not exists approved_at timestamptz;

update public.promotions p set company_id=b.company_id from public.branches b where b.id=p.branch_id and p.company_id is null;
update public.vouchers v set company_id=b.company_id from public.branches b where b.id=v.branch_id and v.company_id is null;
update public.promotions p set company_id=(select company_id from public.orders o where o.company_id is not null limit 1) where p.company_id is null;
update public.vouchers v set company_id=(select company_id from public.orders o where o.company_id is not null limit 1) where v.company_id is null;
create index if not exists promotions_company_schedule_idx on public.promotions(company_id,status,starts_at,ends_at,priority desc);
create unique index if not exists voucher_company_normalized_code_uq on public.vouchers(company_id,upper(code));
create unique index if not exists order_promotion_redemption_once on public.order_adjustments(order_id,promotion_id) where kind='PROMOTION' and status='REDEEMED';

create or replace function public.assign_discount_company_context()
returns trigger language plpgsql security definer set search_path=public as $$
declare branch_company uuid;
begin
 if new.branch_id is not null then select company_id into branch_company from public.branches where id=new.branch_id; end if;
 new.company_id:=coalesce(branch_company,new.company_id,public.current_user_company_id());
 if new.company_id is null then raise exception 'COMPANY_CONTEXT_REQUIRED'; end if;
 if branch_company is not null and new.company_id<>branch_company then raise exception 'DISCOUNT_COMPANY_BRANCH_MISMATCH'; end if;
 return new;
end $$;
drop trigger if exists b_promotion_company_context on public.promotions;
create trigger b_promotion_company_context before insert or update of company_id,branch_id on public.promotions for each row execute function public.assign_discount_company_context();
drop trigger if exists b_voucher_company_context on public.vouchers;
create trigger b_voucher_company_context before insert or update of company_id,branch_id on public.vouchers for each row execute function public.assign_discount_company_context();

insert into public.permissions(code,module,description) values
 ('discount.apply','discount','Request a manual order discount'),
 ('discount.approve','discount','Approve a manual discount above cashier authority'),
 ('order.submit','operations','Submit draft order items to the kitchen')
on conflict(code) do update set module=excluded.module,description=excluded.description;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('discount.apply','order.submit')
where upper(r.name) in ('ADMIN','OWNER','MANAGER','CASHIER','WAITER') on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code='discount.approve'
where upper(r.name) in ('ADMIN','OWNER','MANAGER') on conflict do nothing;

create table if not exists public.staff_discount_limits (
 role_name text primary key,
 maximum_percentage numeric(7,4) not null default 0 check (maximum_percentage between 0 and 100),
 maximum_amount numeric(12,2),
 updated_at timestamptz not null default now()
);
insert into public.staff_discount_limits(role_name,maximum_percentage) values
 ('CASHIER',5),('WAITER',5),('MANAGER',20),('ADMIN',100),('OWNER',100)
on conflict(role_name) do nothing;
alter table public.staff_discount_limits enable row level security;
create policy staff_discount_limits_read on public.staff_discount_limits for select to authenticated using(public.has_pos_permission('discount.apply'));

-- Time windows are evaluated in the order branch's IANA timezone, not the
-- device timezone.  Eligibility always uses pre-discount item subtotal.
create or replace function public.evaluate_order_discounts(p_order_id uuid, p_voucher_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
 s public.terminal_staff_sessions; o public.orders%rowtype; b public.branches%rowtype;
 v public.vouchers%rowtype; p public.promotions%rowtype; local_now timestamp; local_dow smallint;
 eligible numeric(12,2); amount numeric(12,2); promotions jsonb:='[]'::jsonb; selected boolean:=false;
 voucher_code text:=nullif(upper(btrim(coalesce(p_voucher_code,''))), '');
begin
 s:=public.require_terminal_staff_session();
 if not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.company_id<>s.company_id or o.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 if o.payment_status='PAID' or o.status in ('COMPLETED','CANCELLED','REFUNDED') then raise exception 'ORDER_NOT_EDITABLE'; end if;
 select * into b from public.branches where id=o.branch_id;
 local_now:=clock_timestamp() at time zone coalesce(b.timezone,'Asia/Kuala_Lumpur'); local_dow:=extract(dow from local_now)::smallint;
 delete from public.order_adjustments where order_id=o.id and status='APPLIED' and kind in ('PROMOTION','VOUCHER');
 for p in select * from public.promotions where company_id=o.company_id and status='ACTIVE'
   and (starts_at is null or starts_at<=clock_timestamp()) and (ends_at is null or ends_at>clock_timestamp())
   and (branch_id is null or branch_id=o.branch_id) and (order_type is null or order_type=o.order_type)
   and (coalesce(array_length(days_of_week,1),0)=0 or local_dow=any(days_of_week))
   and (start_time is null or start_time<=local_now::time) and (end_time is null or local_now::time<end_time)
   and (usage_limit is null or usage_count<usage_limit) order by priority desc,created_at asc loop
   exit when selected and (p.exclusive or not p.stackable_with_promotions);
   if exists(select 1 from public.order_adjustments a where a.order_id=o.id and a.kind='MANUAL' and a.status='APPLIED') and not p.stackable_with_manual_discount then continue; end if;
   select coalesce(sum(oi.line_subtotal),0) into eligible from public.order_items oi
   left join public.products product on product.id=oi.product_id
   where oi.order_id=o.id and oi.item_status<>'VOIDED' and (not exists(select 1 from public.promotion_targets t where t.promotion_id=p.id)
     or exists(select 1 from public.promotion_targets t where t.promotion_id=p.id and (t.target_type='ORDER' or (t.target_type='PRODUCT' and t.product_id=oi.product_id) or (t.target_type='CATEGORY' and t.category_id=product.category_id))));
   if eligible<p.minimum_spend then continue; end if;
   amount:=case when p.promotion_type in ('PERCENTAGE_DISCOUNT','ITEM_PERCENTAGE_DISCOUNT','CATEGORY_PERCENTAGE_DISCOUNT','HAPPY_HOUR') then round(eligible*p.discount_value/100,2) else least(eligible,p.discount_value) end;
   amount:=least(amount,coalesce(p.max_discount,amount)); if amount<=0 then continue; end if;
   insert into public.order_adjustments(order_id,kind,promotion_id,label,amount,created_by,requested_by_staff_id,status,discount_type,discount_value,snapshot)
   values(o.id,'PROMOTION',p.id,p.name,amount,s.staff_id,s.staff_id,'APPLIED',p.promotion_type,p.discount_value,jsonb_build_object('promotionId',p.id,'name',p.name,'branchId',o.branch_id,'eligibleSubtotal',eligible,'actualAmount',amount,'evaluatedAt',clock_timestamp()));
   promotions:=promotions||jsonb_build_array(jsonb_build_object('promotionId',p.id,'name',p.name,'discount',amount)); selected:=true;
   exit when p.exclusive or not p.stackable_with_promotions;
 end loop;
 if voucher_code is not null then
   select * into v from public.vouchers where company_id=o.company_id and code=voucher_code for update;
   if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
   if v.status<>'ACTIVE' then raise exception 'VOUCHER_INACTIVE'; end if;
   if clock_timestamp()<v.starts_at then raise exception 'VOUCHER_NOT_ACTIVE_YET'; end if;
   if clock_timestamp()>=v.expires_at then raise exception 'VOUCHER_EXPIRED'; end if;
   if v.branch_id is not null and v.branch_id<>o.branch_id then raise exception 'VOUCHER_BRANCH'; end if;
   if v.order_type is not null and v.order_type<>o.order_type then raise exception 'VOUCHER_ORDER_TYPE'; end if;
   if v.usage_limit is not null and v.usage_count>=v.usage_limit then raise exception 'VOUCHER_USAGE_LIMIT'; end if;
   if coalesce(array_length(v.valid_days,1),0)>0 and local_dow<>any(v.valid_days) then raise exception 'VOUCHER_DAY_NOT_ALLOWED'; end if;
   if v.valid_time_from is not null and local_now::time<v.valid_time_from or v.valid_time_until is not null and local_now::time>=v.valid_time_until then raise exception 'VOUCHER_TIME_NOT_ALLOWED'; end if;
   if selected and (not v.stackable_with_promotions or exists(select 1 from public.order_adjustments a join public.promotions pp on pp.id=a.promotion_id where a.order_id=o.id and a.status='APPLIED' and not pp.stackable_with_vouchers)) then raise exception 'VOUCHER_STACKING_CONFLICT'; end if;
   if exists(select 1 from public.order_adjustments a where a.order_id=o.id and a.kind='MANUAL' and a.status='APPLIED') and not v.stackable_with_manual_discount then raise exception 'VOUCHER_STACKING_CONFLICT'; end if;
   select coalesce(sum(oi.line_subtotal),0) into eligible from public.order_items oi left join public.products product on product.id=oi.product_id
    where oi.order_id=o.id and oi.item_status<>'VOIDED' and (coalesce(array_length(v.eligible_product_ids,1),0)=0 and coalesce(array_length(v.eligible_category_ids,1),0)=0 or oi.product_id=any(v.eligible_product_ids) or product.category_id=any(v.eligible_category_ids));
   if eligible<v.min_spend then raise exception 'VOUCHER_MINIMUM_SPEND'; end if;
   amount:=case when v.voucher_type='PERCENTAGE' then round(eligible*v.value/100,2) else least(eligible,v.value) end; amount:=least(amount,coalesce(v.max_discount,amount));
   if amount<=0 then raise exception 'VOUCHER_NO_ELIGIBLE_ITEMS'; end if;
   insert into public.order_adjustments(order_id,kind,voucher_id,label,amount,created_by,requested_by_staff_id,status,discount_type,discount_value,snapshot)
   values(o.id,'VOUCHER',v.id,v.code,amount,s.staff_id,s.staff_id,'APPLIED',v.voucher_type,v.value,jsonb_build_object('voucherId',v.id,'code',v.code,'branchId',o.branch_id,'eligibleSubtotal',eligible,'actualAmount',amount,'evaluatedAt',clock_timestamp()));
   update public.orders set voucher_id=v.id where id=o.id;
 else update public.orders set voucher_id=null where id=o.id; end if;
 update public.orders set adjustment_metadata=jsonb_build_object('promotions',promotions,'voucher',case when voucher_code is null then null else voucher_code end),discount=round((select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status='APPLIED'),2) where id=o.id;
 perform public.recalculate_pos_order(o.id);
 perform public.write_pos_audit('DISCOUNTS_VALIDATED','ORDER',o.id,null,jsonb_build_object('voucherCode',voucher_code,'promotions',promotions));
 return (select jsonb_build_object('ok',true,'orderId',id,'subtotal',subtotal,'discount',discount,'tax',tax,'serviceCharge',service_charge,'total',total,'adjustments',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'label',label,'amount',amount,'sourceId',coalesce(voucher_id,promotion_id)) order by created_at) from public.order_adjustments where order_id=o.id and status='APPLIED'),'[]'::jsonb)) from public.orders where id=o.id);
end $$;

create or replace function public.apply_manual_order_discount(p_order_id uuid,p_discount_type text,p_value numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; o public.orders%rowtype; limit_row public.staff_discount_limits%rowtype; amount numeric(12,2); kind text:=upper(btrim(coalesce(p_discount_type,''))); reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),'');
begin
 s:=public.require_terminal_staff_session(); if not public.has_pos_permission('discount.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 if kind not in ('PERCENTAGE','FIXED_AMOUNT') or p_value is null or p_value<=0 or reason is null then raise exception 'INVALID_MANUAL_DISCOUNT'; end if;
 select * into o from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.company_id<>s.company_id or o.branch_id<>s.branch_id or o.payment_status='PAID' then raise exception 'ORDER_NOT_EDITABLE'; end if;
 if exists(select 1 from public.order_adjustments a left join public.promotions p on p.id=a.promotion_id left join public.vouchers v on v.id=a.voucher_id where a.order_id=o.id and a.status='APPLIED' and ((a.kind='PROMOTION' and not p.stackable_with_manual_discount) or (a.kind='VOUCHER' and not v.stackable_with_manual_discount))) then raise exception 'MANUAL_DISCOUNT_STACKING_CONFLICT'; end if;
 select l.* into limit_row from public.profiles profile join public.staff_discount_limits l on l.role_name=upper(profile.role_name) where profile.id=s.staff_id;
 if not found then raise exception 'MANUAL_DISCOUNT_NOT_AUTHORIZED'; end if;
 amount:=case when kind='PERCENTAGE' then round(o.subtotal*p_value/100,2) else least(o.subtotal,p_value) end;
 if (kind='PERCENTAGE' and p_value>limit_row.maximum_percentage) or (limit_row.maximum_amount is not null and amount>limit_row.maximum_amount) then raise exception 'MANAGER_APPROVAL_REQUIRED'; end if;
 delete from public.order_adjustments where order_id=o.id and kind='MANUAL' and status='APPLIED';
 insert into public.order_adjustments(order_id,kind,label,amount,reason,created_by,requested_by_staff_id,approved_by_staff_id,approved_at,status,discount_type,discount_value,snapshot)
 values(o.id,'MANUAL','Manual discount',amount,reason,s.staff_id,s.staff_id,s.staff_id,clock_timestamp(),'APPLIED',kind,p_value,jsonb_build_object('requestedBy',s.staff_id,'reason',reason,'actualAmount',amount));
 update public.orders set discount=round((select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status='APPLIED'),2) where id=o.id;
 perform public.recalculate_pos_order(o.id); perform public.write_pos_audit('MANUAL_DISCOUNT_APPLIED','ORDER',o.id,reason,jsonb_build_object('amount',amount,'discountType',kind,'discountValue',p_value,'requestedBy',s.staff_id));
 return (select jsonb_build_object('ok',true,'orderId',id,'discount',discount,'total',total) from public.orders where id=o.id);
end $$;

-- This function is deliberately not granted to authenticated users.  The
-- orders Edge Function first verifies the manager PIN using the server key,
-- then invokes this scoped approval; a manager id supplied by React alone can
-- never approve a cashier's discount.
create or replace function public.approve_manual_order_discount(p_order_id uuid,p_requested_by uuid,p_manager_id uuid,p_discount_type text,p_value numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; requester public.profiles%rowtype; manager public.profiles%rowtype; kind text:=upper(btrim(coalesce(p_discount_type,''))); reason text:=nullif(left(btrim(coalesce(p_reason,'')),500),''); amount numeric(12,2);
begin
 if current_setting('role',true)<>'service_role' then raise exception 'SERVER_APPROVAL_REQUIRED'; end if;
 if kind not in ('PERCENTAGE','FIXED_AMOUNT') or p_value is null or p_value<=0 or reason is null then raise exception 'INVALID_MANUAL_DISCOUNT'; end if;
 select * into o from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into requester from public.profiles where id=p_requested_by and status='ACTIVE'; select * into manager from public.profiles where id=p_manager_id and status='ACTIVE' and upper(role_name) in ('ADMIN','OWNER','MANAGER');
 if requester.id is null or requester.branch_id<>o.branch_id then raise exception 'REQUESTER_OUT_OF_SCOPE'; end if;
 if manager.id is null or not exists(select 1 from public.staff_branch_assignments a where a.staff_id=manager.id and a.branch_id=o.branch_id and a.status='ACTIVE') then raise exception 'MANAGER_UNAVAILABLE'; end if;
 if exists(select 1 from public.order_adjustments a left join public.promotions p on p.id=a.promotion_id left join public.vouchers v on v.id=a.voucher_id where a.order_id=o.id and a.status='APPLIED' and ((a.kind='PROMOTION' and not p.stackable_with_manual_discount) or (a.kind='VOUCHER' and not v.stackable_with_manual_discount))) then raise exception 'MANUAL_DISCOUNT_STACKING_CONFLICT'; end if;
 amount:=case when kind='PERCENTAGE' then round(o.subtotal*p_value/100,2) else least(o.subtotal,p_value) end;
 delete from public.order_adjustments where order_id=o.id and kind='MANUAL' and status='APPLIED';
 insert into public.order_adjustments(order_id,kind,label,amount,reason,created_by,requested_by_staff_id,approved_by_staff_id,approved_at,status,discount_type,discount_value,snapshot)
 values(o.id,'MANUAL','Manager-approved manual discount',amount,reason,p_requested_by,p_requested_by,p_manager_id,clock_timestamp(),'APPLIED',kind,p_value,jsonb_build_object('requestedBy',p_requested_by,'approvedBy',p_manager_id,'reason',reason,'actualAmount',amount));
 update public.orders set discount=round((select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status='APPLIED'),2) where id=o.id;
 perform public.recalculate_pos_order(o.id); perform public.write_pos_audit('MANUAL_DISCOUNT_APPROVED','ORDER',o.id,reason,jsonb_build_object('requestedBy',p_requested_by,'approvedBy',p_manager_id,'amount',amount,'discountType',kind,'discountValue',p_value));
 return (select jsonb_build_object('ok',true,'orderId',id,'discount',discount,'total',total,'requestedBy',p_requested_by,'approvedBy',p_manager_id) from public.orders where id=o.id);
end $$;

-- Promotion limits are consumed only when payment makes the order final.  The
-- conditional update is the concurrency gate: two terminals cannot consume
-- the last entitlement.
create or replace function public.finalize_order_promotion_redemptions()
returns trigger language plpgsql security definer set search_path=public as $$
declare adjustment public.order_adjustments%rowtype;
begin
 if new.payment_status<>'PAID' or old.payment_status='PAID' then return new; end if;
 for adjustment in select * from public.order_adjustments where order_id=new.id and kind='PROMOTION' and status='APPLIED' for update loop
   update public.promotions set usage_count=usage_count+1,updated_at=clock_timestamp()
   where id=adjustment.promotion_id and company_id=new.company_id and status='ACTIVE' and (usage_limit is null or usage_count<usage_limit);
   if not found then raise exception 'PROMOTION_REDEMPTION_UNAVAILABLE'; end if;
   update public.order_adjustments set status='REDEEMED' where id=adjustment.id;
   perform public.write_pos_audit('PROMOTION_REDEEMED','PROMOTION',adjustment.promotion_id,null,jsonb_build_object('orderId',new.id,'amount',adjustment.amount));
 end loop;
 return new;
end $$;
drop trigger if exists trg_finalize_order_promotion_redemptions on public.orders;
create trigger trg_finalize_order_promotion_redemptions after update of payment_status on public.orders for each row execute function public.finalize_order_promotion_redemptions();

-- Submission remains atomic, but now requires its own permission and reruns
-- the same authoritative evaluator immediately before creating a batch.
create or replace function public.submit_pos_order(p_order_id uuid,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.terminal_staff_sessions; key text; ord public.orders%rowtype; prior public.order_submissions%rowtype; submitted uuid[]; line record; grp record; c int; batch public.order_item_batches%rowtype; code text;
begin
 s:=public.require_terminal_staff_session(); if not public.has_pos_permission('order.submit') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
 key:=nullif(left(btrim(coalesce(p_idempotency_key,'')),128),''); if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(s.staff_id::text||':'||key,0)); select * into prior from public.order_submissions where user_id=s.staff_id and idempotency_key=key;
 if found then if prior.order_id<>p_order_id then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if; select * into ord from public.orders where id=p_order_id; select * into batch from public.order_item_batches where user_id=s.staff_id and idempotency_key=key; return jsonb_build_object('id',ord.id,'status',ord.status,'batchId',batch.id,'batchNo',batch.batch_no,'submittedItemIds',prior.submitted_item_ids); end if;
 select * into ord from public.orders where id=p_order_id for update; if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if ord.company_id<>s.company_id or ord.branch_id<>s.branch_id then raise exception 'ORDER_BRANCH_MISMATCH'; end if;
 if ord.payment_status<>'UNPAID' or ord.status not in ('DRAFT','CONFIRMED','PREPARING','READY','SERVED') then raise exception 'ORDER_NOT_EDITABLE'; end if;
 if (ord.dining_mode='dine-in' and (ord.restaurant_table_id is null or not exists(select 1 from public.restaurant_tables t where t.id=ord.restaurant_table_id and t.branch_id=ord.branch_id and t.is_active))) or (ord.dining_mode='takeaway' and ord.restaurant_table_id is not null) then raise exception 'INVALID_TABLE_ID'; end if;
 for line in select * from public.order_items where order_id=ord.id and item_status='DRAFT' for update loop
  perform public.resolve_branch_product(line.product_id,ord.branch_id);
  if exists(select 1 from public.order_item_options x join public.product_options po on po.id=x.product_option_id left join public.branch_product_options bp on bp.product_option_id=po.id and bp.branch_id=ord.branch_id where x.order_item_id=line.id and (not po.is_available or not coalesce(bp.available,true) or coalesce(bp.sold_out,false))) then raise exception 'OPTION_NOT_AVAILABLE'; end if;
  for grp in select * from public.product_option_groups where product_id=line.product_id loop select count(*) into c from public.order_item_options x join public.product_options po on po.id=x.product_option_id where x.order_item_id=line.id and po.option_group_id=grp.id; if c<grp.min_selection or c>grp.max_selection or (grp.is_required and c=0) then raise exception 'INVALID_OPTION_SELECTION_COUNT'; end if; end loop;
 end loop;
 select array_agg(id order by created_at) into submitted from public.order_items where order_id=ord.id and item_status='DRAFT'; if submitted is null then raise exception 'NO_DRAFT_ITEMS'; end if;
 select v.code into code from public.vouchers v where v.id=ord.voucher_id; perform public.evaluate_order_discounts(ord.id,code);
 insert into public.order_item_batches(order_id,user_id,idempotency_key,request_items,status) select ord.id,s.staff_id,key,jsonb_agg(jsonb_build_object('orderItemId',id) order by created_at),'PENDING' from public.order_items where id=any(submitted) returning * into batch;
 update public.order_items set item_status='SUBMITTED',sent_at=clock_timestamp(),batch_id=batch.id where id=any(submitted);
 update public.orders set status=case when status='DRAFT' then 'CONFIRMED' else status end,submitted_at=coalesce(submitted_at,clock_timestamp()) where id=ord.id returning * into ord;
 insert into public.order_submissions(order_id,user_id,idempotency_key,submitted_item_ids) values(ord.id,s.staff_id,key,submitted);
 perform public.write_pos_audit('ORDER_SUBMITTED','ORDER',ord.id,null,jsonb_build_object('batchId',batch.id,'batchNo',batch.batch_no,'itemIds',to_jsonb(submitted)));
 return jsonb_build_object('id',ord.id,'status',ord.status,'batchId',batch.id,'batchNo',batch.batch_no,'submittedItemIds',submitted);
end $$;
revoke all on function public.evaluate_order_discounts(uuid,text),public.apply_manual_order_discount(uuid,text,numeric,text),public.submit_pos_order(uuid,text) from public,anon;
revoke all on function public.approve_manual_order_discount(uuid,uuid,uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.evaluate_order_discounts(uuid,text),public.apply_manual_order_discount(uuid,text,numeric,text),public.submit_pos_order(uuid,text) to authenticated;
commit;
