-- P0/P1 voucher foundation. Orders remain authoritative; this migration only
-- adds adjustment metadata and transactional voucher operations.
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  voucher_type text not null check (voucher_type in ('FIXED','PERCENTAGE','FREE_ITEM','PROMO_CODE')),
  value numeric(12,2) not null default 0 check (value >= 0),
  max_discount numeric(12,2) check (max_discount is null or max_discount >= 0),
  min_spend numeric(12,2) not null default 0 check (min_spend >= 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','REDEEMED','EXPIRED','DISABLED')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer is null or usage_limit_per_customer > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  stackable boolean not null default false,
  eligible_product_ids uuid[] not null default '{}',
  eligible_category_ids uuid[] not null default '{}',
  branch_id uuid,
  order_type text check (order_type in ('DINE_IN','TAKEAWAY')),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at)
);
create index if not exists vouchers_code_status_idx on public.vouchers (lower(code), status);
create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(), voucher_id uuid not null references public.vouchers(id),
  order_id uuid not null references public.orders(id), customer_id uuid references auth.users(id),
  staff_id uuid references auth.users(id), amount numeric(12,2) not null check (amount >= 0),
  idempotency_key text not null unique, redeemed_at timestamptz not null default now(),
  unique(voucher_id, order_id)
);
create table if not exists public.order_adjustments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  kind text not null check (kind in ('VOUCHER','PROMOTION','MANUAL','MEMBER','STAFF','ITEM','CATEGORY')),
  voucher_id uuid references public.vouchers(id), label text not null, amount numeric(12,2) not null check (amount >= 0),
  reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
alter table public.orders add column if not exists voucher_id uuid references public.vouchers(id);
alter table public.orders add column if not exists adjustment_metadata jsonb not null default '{}'::jsonb;

create or replace function public.validate_voucher(p_code text, p_subtotal numeric, p_order_type text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v vouchers; d numeric;
begin
 select * into v from vouchers where lower(code)=lower(trim(p_code)) for update;
 if not found then raise exception 'Voucher not found'; end if;
 if v.status <> 'ACTIVE' then raise exception 'Voucher inactive'; end if;
 if now() < v.starts_at or now() >= v.expires_at then raise exception 'Voucher expired'; end if;
 if p_subtotal < v.min_spend then raise exception 'Minimum spend not reached'; end if;
 if v.order_type is not null and upper(coalesce(p_order_type,'')) <> v.order_type then raise exception 'Voucher not applicable to this order'; end if;
 if v.usage_limit is not null and v.usage_count >= v.usage_limit then raise exception 'Voucher usage limit reached'; end if;
 d := case when v.voucher_type='PERCENTAGE' then p_subtotal*v.value/100 else least(v.value,p_subtotal) end;
 if v.max_discount is not null then d := least(d,v.max_discount); end if;
 return jsonb_build_object('voucherId',v.id,'code',v.code,'name',v.name,'discount',round(greatest(d,0),2),'stackable',v.stackable);
end $$;

create or replace function public.redeem_voucher(p_voucher_id uuid,p_order_id uuid,p_amount numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r voucher_redemptions;
begin
 select * into r from voucher_redemptions where idempotency_key=p_idempotency_key;
 if found then return to_jsonb(r); end if;
 update vouchers set usage_count=usage_count+1, status=case when usage_limit is not null and usage_count+1>=usage_limit then 'REDEEMED' else status end, updated_at=now()
 where id=p_voucher_id and status='ACTIVE' and (usage_limit is null or usage_count<usage_limit);
 if not found then raise exception 'Voucher usage limit reached'; end if;
 insert into voucher_redemptions(voucher_id,order_id,staff_id,amount,idempotency_key) values(p_voucher_id,p_order_id,auth.uid(),round(greatest(p_amount,0),2),p_idempotency_key) returning * into r;
 return to_jsonb(r);
end $$;
grant execute on function public.validate_voucher(text,numeric,text) to authenticated;
grant execute on function public.redeem_voucher(uuid,uuid,numeric,text) to authenticated;
