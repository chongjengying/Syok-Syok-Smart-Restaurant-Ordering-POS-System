import { supabase } from '../../infrastructure/supabase/client';

export async function listVouchers(search = '') {
  let query = supabase.from('vouchers').select('*').order('created_at', { ascending: false });
  if (search.trim()) query = query.or(`code.ilike.%${search.trim()}%,name.ilike.%${search.trim()}%`);
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function saveVoucher(voucher) {
  const payload = { ...voucher, code: voucher.code.trim().toUpperCase(), updated_at: new Date().toISOString() };
  const result = voucher.id ? await supabase.from('vouchers').update(payload).eq('id', voucher.id).select().single() : await supabase.from('vouchers').insert(payload).select().single();
  return { data: result.data, error: result.error };
}

export async function setVoucherStatus(id, status) { return supabase.from('vouchers').update({ status, updated_at: new Date().toISOString() }).eq('id', id); }
