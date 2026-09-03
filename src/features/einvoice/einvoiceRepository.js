import { supabase } from '../../infrastructure/supabase/client';

export const listEinvoiceProfiles = () => supabase.from('company_einvoice_profiles').select('*').order('created_at', { ascending: false });
export const setEinvoiceProfileStatus = (id, status) => supabase.rpc('einvoice_profile_set_status', { p_id: id, p_status: status });
export const testEinvoiceConnection = (profileId) => supabase.functions.invoke('einvoice-submit', { body: { action: 'testConnection', profileId } });
export const listEinvoiceDocuments = (filters = {}) => {
  let query = supabase.from('einvoice_documents').select('*').order('created_at', { ascending: false });
  if (filters.status) query = query.eq('internal_status', filters.status);
  if (filters.branchId) query = query.eq('branch_id', filters.branchId);
  return query;
};
