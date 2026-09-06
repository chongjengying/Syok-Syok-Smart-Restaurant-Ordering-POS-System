import { supabase } from '../infrastructure/supabase/client';

export const DISCOUNT_KINDS = Object.freeze(['VOUCHER', 'PROMOTION', 'MANUAL', 'MEMBER', 'STAFF', 'ITEM', 'CATEGORY']);

export function calculateDiscount({ subtotal, type, value, maximum }) {
  const base = Math.max(0, Number(subtotal) || 0);
  const raw = String(type).toUpperCase() === 'PERCENTAGE' ? base * (Number(value) || 0) / 100 : Number(value) || 0;
  return Math.round(Math.min(base, Math.max(0, maximum == null ? raw : Math.min(raw, Number(maximum)))) * 100) / 100;
}

function friendly(error) {
  const message = String(error?.message || '');
  const messages = {
    VOUCHER_NOT_FOUND: 'Voucher code not found.', VOUCHER_INACTIVE: 'This voucher is inactive.',
    VOUCHER_NOT_ACTIVE_YET: 'This voucher is not active yet.', VOUCHER_EXPIRED: 'This voucher has expired.',
    VOUCHER_MINIMUM_SPEND: 'The order does not meet this voucher’s minimum spend.',
    VOUCHER_ORDER_TYPE: 'This voucher cannot be used for this order type.',
    VOUCHER_USAGE_LIMIT: 'This voucher has reached its usage limit.',
    VOUCHER_STACKING_CONFLICT: 'This voucher cannot be combined with the current promotion.',
    VOUCHER_NO_ELIGIBLE_ITEMS: 'This voucher has no eligible items in this order.',
    ORDER_NOT_EDITABLE: 'This order has already been paid or completed and cannot be changed.',
    INSUFFICIENT_PERMISSION: 'You do not have permission to apply vouchers.',
  };
  return Object.entries(messages).find(([code]) => message.includes(code))?.[1] || message || 'Unable to process voucher.';
}

export async function applyVoucherToOrder(orderId, code) {
  const { data, error } = await supabase.rpc('apply_voucher_to_order', {
    p_order_id: orderId,
    p_code: String(code || '').trim().toUpperCase(),
  });
  if (error) return { data: null, error: new Error(friendly(error)) };
  if (data?.ok === false) return { data: null, error: new Error(friendly({ message: data.code })) };
  return { data, error: null };
}

export async function removeVoucherFromOrder(orderId) {
  const { data, error } = await supabase.rpc('remove_voucher_from_order', { p_order_id: orderId });
  return error ? { data: null, error: new Error(friendly(error)) } : { data, error: null };
}
