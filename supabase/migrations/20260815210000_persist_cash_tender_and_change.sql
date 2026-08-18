-- Persist cash tender/change for receipt and audit purposes. The billed amount
-- remains authoritative and is still validated by complete_payment().
alter table public.payments
  add column if not exists received_amount numeric(12, 2),
  add column if not exists change_amount numeric(12, 2);

alter table public.payments drop constraint if exists payments_received_amount_check;
alter table public.payments add constraint payments_received_amount_check
  check (received_amount is null or received_amount >= amount);

alter table public.payments drop constraint if exists payments_change_amount_check;
alter table public.payments add constraint payments_change_amount_check
  check (change_amount is null or change_amount >= 0);

create or replace function public.complete_payment(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_idempotency_key text,
  p_provider text,
  p_transaction_reference text,
  p_received_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_method text := upper(btrim(coalesce(p_payment_method, '')));
  normalized_received numeric(12, 2);
  calculated_change numeric(12, 2);
  result jsonb;
  paid_payment public.payments%rowtype;
begin
  if normalized_method = 'E_WALLET' then normalized_method := 'EWALLET'; end if;
  if normalized_method = 'CASH' then
    if p_received_amount is null or p_received_amount < p_final_amount then
      raise exception 'INSUFFICIENT_CASH_RECEIVED';
    end if;
    normalized_received := round(p_received_amount, 2);
    calculated_change := round(normalized_received - round(p_final_amount, 2), 2);
  else
    normalized_received := round(p_final_amount, 2);
    calculated_change := 0;
  end if;

  result := public.complete_payment(
    p_order_id,
    normalized_method,
    p_final_amount,
    p_idempotency_key,
    p_provider,
    p_transaction_reference
  );

  select * into paid_payment
  from public.payments
  where id = (result->'payment'->>'id')::uuid
  for update;

  if paid_payment.received_amount is not null
    and (paid_payment.received_amount <> normalized_received
      or paid_payment.change_amount <> calculated_change)
  then
    raise exception 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_TENDER';
  end if;

  update public.payments
  set received_amount = normalized_received,
      change_amount = calculated_change
  where id = paid_payment.id
  returning * into paid_payment;

  return jsonb_set(result, '{payment}', to_jsonb(paid_payment), true);
end;
$$;

revoke all on function public.complete_payment(uuid, text, numeric, text, text, text, numeric)
from public, anon;
grant execute on function public.complete_payment(uuid, text, numeric, text, text, text, numeric)
to authenticated;

