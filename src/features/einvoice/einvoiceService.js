import { supabase } from '../../infrastructure/supabase/client';

export async function createBuyerTaxProfile(input) {
  const { data, error } = await supabase.from('customer_tax_profiles').upsert({ ...input, tin_validated: false, updated_at: new Date().toISOString() }, { onConflict: 'tin,id_type,id_number' }).select().single();
  return { data, error };
}
export async function requestEinvoice(orderId, profileId, taxProfileId) {
  const { data, error } = await supabase.from('einvoice_requests').insert({ order_id: orderId, profile_id: profileId, tax_profile_id: taxProfileId }).select().single();
  return { data, error };
}
export async function getEinvoiceFeatureForBranch(branchId) {
  const { data } = await supabase.from('company_einvoice_branch_mappings').select('profile:company_einvoice_profiles(*)').eq('branch_id', branchId).maybeSingle();
  return data?.profile?.status === 'ACTIVE' ? data.profile : null;
}
