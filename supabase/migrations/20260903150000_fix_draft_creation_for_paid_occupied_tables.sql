-- Allow a new bill on an occupied table only when the existing bills are paid.
-- Unpaid, partially paid, and draft orders continue to block a new draft.
create or replace function public.create_pos_draft(
  p_dining_mode text, p_table_id uuid default null, p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); key text; existing public.orders%rowtype;
  new_order public.orders%rowtype; new_payment public.payments%rowtype; number_value text; draft_branch_id uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from public.profiles where id=uid and status='ACTIVE' and role_name in ('ADMIN','MANAGER','WAITER','CASHIER'))
    then raise exception 'INSUFFICIENT_PERMISSION'; end if;
  if p_dining_mode not in ('dine-in','takeaway') then raise exception 'INVALID_DINING_MODE'; end if;
  if (p_dining_mode='dine-in' and p_table_id is null) or (p_dining_mode='takeaway' and p_table_id is not null)
    then raise exception 'INVALID_TABLE_ID'; end if;
  key := nullif(left(btrim(coalesce(p_idempotency_key,'')),128),'');
  if key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || key, 0));
  select * into existing from public.orders where user_id=uid and idempotency_key=key;
  if found then
    if existing.dining_mode <> p_dining_mode or existing.restaurant_table_id is distinct from p_table_id
      then raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'; end if;
    return jsonb_build_object('id',existing.id,'payment_id',(select id from public.payments where order_id=existing.id order by created_at desc limit 1));
  end if;
  if p_table_id is not null then
    perform 1 from public.restaurant_tables where id=p_table_id and is_active and status in ('AVAILABLE','RESERVED','OCCUPIED') for update;
    if not found then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.orders where restaurant_table_id=p_table_id
      and status in ('DRAFT','PLACED','CONFIRMED','PREPARING','READY','SERVED','COLLECTED')
      and payment_status in ('PENDING','UNPAID','PARTIALLY_PAID'))
      then raise exception 'ACTIVE_ORDER_EXISTS'; end if;
  end if;
  select coalesce(
    (select branch_id from public.restaurant_tables where id = p_table_id),
    (select branch_id from public.profiles where id = uid),
    (select id from public.branches where code = 'MAIN')
  ) into draft_branch_id;
  if draft_branch_id is null then raise exception 'BRANCH_REQUIRED'; end if;
  number_value := 'POS-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || upper(substr(md5(random()::text),1,8));
  perform set_config('app.order_idempotency_fingerprint', md5(p_dining_mode || '|' || coalesce(p_table_id::text,'')), true);
  insert into public.orders(order_number,user_id,branch_id,subtotal,discount,tax,service_charge,total,status,payment_status,dining_mode,table_id,restaurant_table_id,idempotency_key)
  values(number_value,uid,draft_branch_id,0,0,0,0,0,'DRAFT','PENDING',p_dining_mode,p_table_id::text,p_table_id,key) returning * into new_order;
  insert into public.payments(order_id,user_id,payment_method,amount,reference,status,paid_at)
  values(new_order.id,uid,'CASH',0,number_value,'PENDING',null) returning * into new_payment;
  return jsonb_build_object('id',new_order.id,'payment_id',new_payment.id);
end;
$$;

revoke all on function public.create_pos_draft(text,uuid,text) from public, anon;
grant execute on function public.create_pos_draft(text,uuid,text) to authenticated;
