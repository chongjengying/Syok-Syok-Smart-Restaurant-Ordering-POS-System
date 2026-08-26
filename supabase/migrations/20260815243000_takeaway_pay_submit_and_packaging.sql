alter table public.orders
add column if not exists takeaway_packaging text[] not null default '{}'::text[];

alter table public.orders drop constraint if exists orders_takeaway_packaging_allowed;
alter table public.orders add constraint orders_takeaway_packaging_allowed check (
  takeaway_packaging <@ array[
    'CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN'
  ]::text[]
);

create or replace function public.set_takeaway_packaging(
  p_order_id uuid,
  p_packaging text[]
) returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  normalized text[];
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (
    select 1 from public.profiles where id = auth.uid() and status = 'ACTIVE'
      and role_name in ('ADMIN', 'MANAGER', 'WAITER', 'CASHIER')
  ) then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  select coalesce(array_agg(distinct upper(value) order by upper(value)), '{}'::text[])
  into normalized from unnest(coalesce(p_packaging, '{}'::text[])) value;
  if not normalized <@ array[
    'CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN'
  ]::text[] then raise exception 'INVALID_TAKEAWAY_PACKAGING'; end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.dining_mode <> 'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
  if ord.status <> 'DRAFT' or ord.payment_status <> 'UNPAID' then raise exception 'ORDER_NOT_EDITABLE'; end if;
  update public.orders set takeaway_packaging = normalized where id = p_order_id returning * into ord;
  return ord;
end;
$$;

create or replace function public.complete_takeaway_payment_and_submit(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_idempotency_key text,
  p_provider text,
  p_transaction_reference text,
  p_received_amount numeric
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 110), '');
begin
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if exists (
    select 1 from public.payments where idempotency_key = normalized_key and order_id = p_order_id and status = 'PAID'
  ) then
    return public.complete_payment(
      p_order_id, p_payment_method, p_final_amount, normalized_key,
      p_provider, p_transaction_reference, p_received_amount
    );
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if ord.dining_mode <> 'takeaway' then raise exception 'ORDER_NOT_TAKEAWAY'; end if;
  if ord.status <> 'DRAFT' or ord.payment_status <> 'UNPAID' then raise exception 'ORDER_NOT_PAYABLE'; end if;

  perform public.submit_pos_order(p_order_id, normalized_key || ':submit');
  select * into ord from public.orders where id = p_order_id;
  if round(coalesce(ord.total, 0), 2) <> round(coalesce(p_final_amount, -1), 2)
  then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  return public.complete_payment(
    p_order_id, p_payment_method, p_final_amount, normalized_key,
    p_provider, p_transaction_reference, p_received_amount
  );
end;
$$;

revoke all on function public.set_takeaway_packaging(uuid, text[]) from public, anon;
grant execute on function public.set_takeaway_packaging(uuid, text[]) to authenticated;
revoke all on function public.complete_takeaway_payment_and_submit(uuid, text, numeric, text, text, text, numeric) from public, anon;
grant execute on function public.complete_takeaway_payment_and_submit(uuid, text, numeric, text, text, text, numeric) to authenticated;
