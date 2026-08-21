begin;

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
  staff_role text;
  ord public.orders%rowtype;
  paid_payment public.payments%rowtype;
  existing_refund public.refunds%rowtype;
  created_refund public.refunds%rowtype;
  normalized_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  normalized_key text := nullif(left(btrim(coalesce(p_idempotency_key, '')), 128), '');
  fingerprint text;
begin
  select p.role_name into staff_role from public.profiles p
  where p.id = caller_id and p.status = 'ACTIVE';
  if coalesce(staff_role, '') not in ('ADMIN', 'MANAGER') then
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

commit;
