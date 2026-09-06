-- Apply the post-foundation hardening to already-migrated local environments.
create or replace function public.redeem_voucher(p_voucher_id uuid,p_order_id uuid,p_amount numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  raise exception 'VOUCHER_REDEMPTION_AT_PAYMENT_ONLY';
end $$;
