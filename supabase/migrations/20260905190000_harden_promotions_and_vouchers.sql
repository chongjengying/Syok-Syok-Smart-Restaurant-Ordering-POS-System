-- Central, server-authoritative promotion and voucher evaluation.
-- Client applications may request a voucher code, but never an amount.

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text,
  customer_description text,
  promotion_type text not null check (promotion_type in ('PERCENTAGE_DISCOUNT','FIXED_AMOUNT_DISCOUNT','ITEM_PERCENTAGE_DISCOUNT','ITEM_FIXED_DISCOUNT','CATEGORY_PERCENTAGE_DISCOUNT','BUY_X_GET_Y','MINIMUM_SPEND_DISCOUNT','HAPPY_HOUR')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  max_discount numeric(12,2) check (max_discount is null or max_discount >= 0),
  minimum_spend numeric(12,2) not null default 0 check (minimum_spend >= 0),
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','SCHEDULED','ACTIVE','EXPIRED','DISABLED','ARCHIVED')),
  starts_at timestamptz,
  ends_at timestamptz,
  start_time time,
  end_time time,
  days_of_week smallint[] not null default '{}',
  order_type text check (order_type in ('DINE_IN','TAKEAWAY')),
  priority integer not null default 0,
  stackable_with_promotions boolean not null default false,
  stackable_with_vouchers boolean not null default false,
  stackable_with_manual_discount boolean not null default false,
  exclusive boolean not null default false,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  branch_id uuid references public.branches(id) on delete restrict,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (coalesce(array_length(days_of_week, 1), 0) = 0 or days_of_week <@ array[0,1,2,3,4,5,6]::smallint[])
);
create index if not exists promotions_active_schedule_idx on public.promotions(status, starts_at, ends_at, priority desc);

create table if not exists public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete restrict,
  target_type text not null check (target_type in ('ORDER','PRODUCT','CATEGORY','BUY_PRODUCT','GET_PRODUCT')),
  product_id uuid references public.products(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  required_quantity integer not null default 1 check (required_quantity > 0),
  created_at timestamptz not null default now(),
  check ((target_type in ('PRODUCT','BUY_PRODUCT','GET_PRODUCT') and product_id is not null and category_id is null) or (target_type='CATEGORY' and category_id is not null and product_id is null) or (target_type='ORDER' and product_id is null and category_id is null))
);
create index if not exists promotion_targets_promotion_idx on public.promotion_targets(promotion_id);

alter table public.vouchers drop constraint if exists vouchers_voucher_type_check;
alter table public.vouchers add constraint vouchers_voucher_type_check check (voucher_type in ('FIXED','PERCENTAGE','FREE_ITEM','PROMO_CODE','ITEM_SPECIFIC','CATEGORY_SPECIFIC'));
alter table public.vouchers add column if not exists stackable_with_promotions boolean not null default false;
alter table public.vouchers add column if not exists stackable_with_manual_discount boolean not null default false;
alter table public.vouchers add column if not exists max_usage_per_order integer not null default 1 check (max_usage_per_order = 1);
alter table public.vouchers add column if not exists customer_description text;

alter table public.voucher_redemptions add column if not exists status text not null default 'REDEEMED' check (status in ('APPLIED','REDEEMED','REVERSED'));
alter table public.voucher_redemptions add column if not exists snapshot jsonb not null default '{}'::jsonb;
alter table public.voucher_redemptions add column if not exists finalized_at timestamptz;
alter table public.order_adjustments add column if not exists promotion_id uuid references public.promotions(id) on delete restrict;
alter table public.order_adjustments add column if not exists status text not null default 'APPLIED' check (status in ('APPLIED','REDEEMED','REVERSED','INVALID'));
alter table public.order_adjustments add column if not exists snapshot jsonb not null default '{}'::jsonb;
create index if not exists voucher_redemptions_voucher_status_idx on public.voucher_redemptions(voucher_id, status);
create index if not exists voucher_redemptions_order_idx on public.voucher_redemptions(order_id);
create index if not exists order_adjustments_order_idx on public.order_adjustments(order_id, status);

insert into public.permissions(code,module,description) values
  ('promotion.view','promotion','View promotions'),
  ('promotion.manage','promotion','Create, edit, enable and disable promotions'),
  ('voucher.activity.view','voucher','View promotion and voucher activity')
on conflict(code) do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where upper(r.name) in ('ADMIN','OWNER','MANAGER') and p.code in ('promotion.view','promotion.manage','voucher.activity.view')
on conflict do nothing;

alter table public.promotions enable row level security;
alter table public.promotion_targets enable row level security;
create policy promotion_view on public.promotions for select to authenticated using(public.has_pos_permission('promotion.view'));
create policy promotion_manage on public.promotions for all to authenticated using(public.has_pos_permission('promotion.manage')) with check(public.has_pos_permission('promotion.manage'));
create policy promotion_target_view on public.promotion_targets for select to authenticated using(public.has_pos_permission('promotion.view'));
create policy promotion_target_manage on public.promotion_targets for all to authenticated using(public.has_pos_permission('promotion.manage')) with check(public.has_pos_permission('promotion.manage'));

create or replace function public.normalize_voucher_code()
returns trigger language plpgsql as $$ begin new.code := upper(btrim(new.code)); return new; end $$;
drop trigger if exists trg_normalize_voucher_code on public.vouchers;
create trigger trg_normalize_voucher_code before insert or update of code on public.vouchers for each row execute function public.normalize_voucher_code();

create or replace function public.evaluate_order_discounts(p_order_id uuid, p_voucher_code text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  o public.orders%rowtype; v public.vouchers%rowtype; p public.promotions%rowtype;
  v_discount numeric(12,2) := 0; p_discount numeric(12,2) := 0; existing_promotion boolean := false;
  item_subtotal numeric(12,2); eligible_subtotal numeric(12,2); target_count integer; now_local time; order_type_value text;
  p_rows jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not public.has_pos_permission('voucher.apply') then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status='PAID' or o.status in ('COMPLETED','CANCELLED') then raise exception 'ORDER_NOT_EDITABLE'; end if;
  now_local := localtime;
  order_type_value := case when o.dining_mode='dine-in' then 'DINE_IN' else 'TAKEAWAY' end;

  delete from public.order_adjustments where order_id=o.id and status='APPLIED' and kind in ('VOUCHER','PROMOTION');

  for p in
    select * from public.promotions
    where status='ACTIVE' and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())
      and (branch_id is null or branch_id=o.branch_id)
      and (order_type is null or order_type=order_type_value)
      and (coalesce(array_length(days_of_week,1),0)=0 or extract(dow from now())::smallint=any(days_of_week))
      and (start_time is null or start_time<=now_local) and (end_time is null or now_local<end_time)
    order by priority desc, created_at asc
  loop
    exit when existing_promotion and (p.exclusive or not p.stackable_with_promotions);
    select coalesce(sum(oi.subtotal),0) into eligible_subtotal
    from public.order_items oi
    where oi.order_id=o.id and not exists (select 1 from public.promotion_targets pt where pt.promotion_id=p.id)
       or (oi.order_id=o.id and exists (select 1 from public.promotion_targets pt left join public.products pr on pr.id=oi.product_id where pt.promotion_id=p.id and ((pt.target_type='PRODUCT' and pt.product_id=oi.product_id) or (pt.target_type='CATEGORY' and pt.category_id=pr.category_id) or pt.target_type='ORDER')));
    if eligible_subtotal < p.minimum_spend then continue; end if;
    if p.promotion_type in ('PERCENTAGE_DISCOUNT','ITEM_PERCENTAGE_DISCOUNT','CATEGORY_PERCENTAGE_DISCOUNT','HAPPY_HOUR') then p_discount:=round(eligible_subtotal*p.discount_value/100,2); else p_discount:=least(eligible_subtotal,p.discount_value); end if;
    if p.max_discount is not null then p_discount:=least(p_discount,p.max_discount); end if;
    if p_discount<=0 then continue; end if;
    insert into public.order_adjustments(order_id,kind,promotion_id,label,amount,created_by,status,snapshot)
    values(o.id,'PROMOTION',p.id,p.name,p_discount,auth.uid(),'APPLIED',jsonb_build_object('promotionType',p.promotion_type,'discountValue',p.discount_value,'actualAmount',p_discount));
    p_rows:=p_rows || jsonb_build_array(jsonb_build_object('promotionId',p.id,'name',p.name,'discount',p_discount));
    existing_promotion:=true;
    exit when p.exclusive or not p.stackable_with_promotions;
  end loop;

  if nullif(btrim(coalesce(p_voucher_code,'')),'') is not null then
    select * into v from public.vouchers where code=upper(btrim(p_voucher_code)) for update;
    if not found then raise exception 'VOUCHER_NOT_FOUND'; end if;
    if v.status <> 'ACTIVE' then raise exception 'VOUCHER_INACTIVE'; end if;
    if now()<v.starts_at then raise exception 'VOUCHER_NOT_ACTIVE_YET'; end if;
    if now()>=v.expires_at then raise exception 'VOUCHER_EXPIRED'; end if;
    if v.branch_id is not null and v.branch_id<>o.branch_id then raise exception 'VOUCHER_BRANCH'; end if;
    if o.subtotal<v.min_spend then raise exception 'VOUCHER_MINIMUM_SPEND'; end if;
    if v.order_type is not null and v.order_type<>order_type_value then raise exception 'VOUCHER_ORDER_TYPE'; end if;
    if v.usage_limit is not null and v.usage_count>=v.usage_limit then raise exception 'VOUCHER_USAGE_LIMIT'; end if;
    if existing_promotion and (not v.stackable_with_promotions or exists(select 1 from public.promotions where id in (select promotion_id from public.order_adjustments where order_id=o.id and status='APPLIED') and not stackable_with_vouchers)) then raise exception 'VOUCHER_STACKING_CONFLICT'; end if;
    if v.voucher_type='PERCENTAGE' then v_discount:=round(o.subtotal*v.value/100,2); else v_discount:=least(o.subtotal,v.value); end if;
    if v.max_discount is not null then v_discount:=least(v_discount,v.max_discount); end if;
    if v_discount<=0 then raise exception 'VOUCHER_NO_ELIGIBLE_ITEMS'; end if;
    insert into public.order_adjustments(order_id,kind,voucher_id,label,amount,created_by,status,snapshot)
    values(o.id,'VOUCHER',v.id,v.code,v_discount,auth.uid(),'APPLIED',jsonb_build_object('code',v.code,'voucherType',v.voucher_type,'value',v.value,'actualAmount',v_discount));
    update public.orders set voucher_id=v.id, adjustment_metadata=jsonb_build_object('promotions',p_rows,'voucher',jsonb_build_object('id',v.id,'code',v.code,'discount',v_discount)), discount=round((select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status='APPLIED'),2) where id=o.id;
  else
    update public.orders set voucher_id=null, adjustment_metadata=jsonb_build_object('promotions',p_rows), discount=round((select coalesce(sum(amount),0) from public.order_adjustments where order_id=o.id and status='APPLIED'),2) where id=o.id;
  end if;
  return (select jsonb_build_object('orderId',o.id,'subtotal',subtotal,'discount',discount,'total',total,'adjustments',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'label',label,'amount',amount) order by created_at) from public.order_adjustments where order_id=o.id and status='APPLIED'),'[]'::jsonb)) from public.orders where id=o.id);
end $$;

create or replace function public.apply_voucher_to_order(p_order_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$ begin return public.evaluate_order_discounts(p_order_id,p_code); end $$;
create or replace function public.remove_voucher_from_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$ begin return public.evaluate_order_discounts(p_order_id,null); end $$;

-- Keep the legacy RPC name callable only as a safe failure. Its old contract
-- accepted p_amount from a browser, which could be manipulated.
create or replace function public.redeem_voucher(p_voucher_id uuid,p_order_id uuid,p_amount numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'VOUCHER_REDEMPTION_AT_PAYMENT_ONLY';
end $$;

create or replace function public.finalize_order_voucher_redemption()
returns trigger language plpgsql security definer set search_path=public as $$
declare v public.vouchers%rowtype; a public.order_adjustments%rowtype;
begin
  if new.payment_status<>'PAID' or old.payment_status='PAID' or new.voucher_id is null then return new; end if;
  select * into v from public.vouchers where id=new.voucher_id for update;
  select * into a from public.order_adjustments where order_id=new.id and voucher_id=new.voucher_id and status='APPLIED' order by created_at desc limit 1;
  if not found or v.status<>'ACTIVE' or (v.usage_limit is not null and v.usage_count>=v.usage_limit) then raise exception 'VOUCHER_REDEMPTION_UNAVAILABLE'; end if;
  update public.vouchers set usage_count=usage_count+1,status=case when usage_limit is not null and usage_count+1>=usage_limit then 'REDEEMED' else status end,updated_at=now() where id=v.id;
  insert into public.voucher_redemptions(voucher_id,order_id,staff_id,amount,idempotency_key,status,snapshot,finalized_at)
  values(v.id,new.id,auth.uid(),a.amount,'final:'||new.id,'REDEEMED',a.snapshot,now()) on conflict(voucher_id,order_id) do nothing;
  update public.order_adjustments set status='REDEEMED' where id=a.id;
  perform public.write_pos_audit_diff('VOUCHER_REDEEMED','VOUCHER',v.id,null,null,jsonb_build_object('orderId',new.id,'amount',a.amount));
  return new;
end $$;
drop trigger if exists trg_finalize_order_voucher_redemption on public.orders;
create trigger trg_finalize_order_voucher_redemption after update of payment_status on public.orders for each row execute function public.finalize_order_voucher_redemption();

revoke all on function public.evaluate_order_discounts(uuid,text) from public, anon;
revoke all on function public.apply_voucher_to_order(uuid,text) from public, anon;
revoke all on function public.remove_voucher_from_order(uuid) from public, anon;
grant execute on function public.evaluate_order_discounts(uuid,text), public.apply_voucher_to_order(uuid,text), public.remove_voucher_from_order(uuid) to authenticated;
