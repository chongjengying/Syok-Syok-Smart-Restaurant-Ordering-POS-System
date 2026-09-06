import { supabase } from '../../infrastructure/supabase/client';

export async function listVouchers(search = '') {
  let query = supabase.from('vouchers').select('*').order('created_at', { ascending: false });
  const normalizedSearch = search.trim().replace(/[^\p{L}\p{N}\s_-]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100);
  if (normalizedSearch) query = query.or(`code.ilike.%${normalizedSearch}%,name.ilike.%${normalizedSearch}%`);
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function listAvailableVouchers(orderId, search = '') {
  const { data, error } = await supabase.rpc('get_order_vouchers', {
    p_order_id: orderId,
    p_search: search.trim().slice(0, 100) || null,
  });
  return { data: data || [], error };
}

export async function saveVoucher(voucher) {
  const payload = { ...voucher, code: voucher.code.trim().toUpperCase(), updated_at: new Date().toISOString() };
  const result = voucher.id ? await supabase.from('vouchers').update(payload).eq('id', voucher.id).select().single() : await supabase.from('vouchers').insert(payload).select().single();
  return { data: result.data, error: result.error };
}

export async function setVoucherStatus(id, status) { return supabase.from('vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id); }
export async function deleteVoucher(id) { return supabase.rpc('delete_voucher_admin', { p_voucher_id: id }); }
