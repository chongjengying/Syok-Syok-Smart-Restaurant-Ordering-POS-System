import { supabase } from '../infrastructure/supabase/client';

export const DISCOUNT_KINDS = Object.freeze(['VOUCHER', 'PROMOTION', 'MANUAL', 'MEMBER', 'STAFF', 'ITEM', 'CATEGORY']);

export function calculateDiscount({ subtotal, type, value, maximum }) {
  const base = Math.max(0, Number(subtotal) || 0);
  const raw = String(type).toUpperCase() === 'PERCENTAGE' ? base * (Number(value) || 0) / 100 : Number(value) || 0;
  return Math.round(Math.min(base, Math.max(0, maximum == null ? raw : Math.min(raw, Number(maximum)))) * 100) / 100;
}

function friendly(error) { return error?.message || 'Unable to process voucher'; }

export async function validateVoucher(code, subtotal, orderType) {
  const { data, error } = await supabase.rpc('validate_voucher', { p_code: code, p_subtotal: subtotal, p_order_type: orderType || null });
  return error ? { data: null, error: new Error(friendly(error)) } : { data, error: null };
}

export async function redeemVoucher(voucherId, orderId, amount, idempotencyKey = crypto.randomUUID()) {
  const { data, error } = await supabase.rpc('redeem_voucher', { p_voucher_id: voucherId, p_order_id: orderId, p_amount: amount, p_idempotency_key: idempotencyKey });
  return error ? { data: null, error: new Error(friendly(error)) } : { data, error: null };
}
