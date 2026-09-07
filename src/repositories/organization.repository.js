import { supabase } from '../infrastructure/supabase/client';
export const fetchCompanies = () => supabase.from('companies').select('*').order('created_at');
export const fetchBranches = () => supabase.from('branches').select('*,companies(name,code,currency_code,timezone)').order('code');
export const persistCompany = (payload) => supabase.rpc('save_company', { p_payload: payload });
export const persistBranch = (payload) => supabase.rpc('save_branch', { p_id: payload.id || null, p_payload: payload, p_expected_revision: payload.revision || null });
export const fetchBranchManagement = (id) => supabase.rpc('get_branch_management', { p_branch_id: id });
export const persistBranchConfiguration = (id, patch, revision) => supabase.rpc('save_branch_configuration', { p_branch_id: id, p_patch: patch, p_expected_revision: revision });
export const fetchTerminals = (branchId) => {
  let query = supabase.from('pos_terminals').select('id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status,lock_status,access_mode,allowed_roles,last_seen_at,created_at,updated_at').order('terminal_code');
  if (branchId) query = query.eq('branch_id', branchId);
  return query;
};
export const persistTerminal = (form) => supabase.rpc('save_pos_terminal', { p_id: form.id || null, p_branch_id: form.branchId, p_code: form.code, p_name: form.name, p_type: form.type, p_status: 'CREATED', p_device_identifier: null });
export const transitionTerminal = (id, action, device) => supabase.rpc('transition_pos_terminal', { p_terminal_id: id, p_action: action, p_device_identifier: device || null });
export const reassignTerminal = (id, branchId) => supabase.rpc('reassign_pos_terminal', { p_terminal_id: id, p_branch_id: branchId });
export const assignBranchStaff = (userId, branchId, isPrimary = false) => supabase.rpc('assign_user_branch', { p_user_id: userId, p_branch_id: branchId, p_is_primary: isPrimary });
export const setStaffAssignmentStatus = (assignmentId, status) => supabase.rpc('set_staff_branch_assignment_status', { p_assignment_id: assignmentId, p_status: status });
export const setPrimaryStaffBranch = (assignmentId) => supabase.rpc('set_primary_staff_branch', { p_assignment_id: assignmentId });

export const verifyTerminalPin = (pin) => supabase.rpc('verify_own_terminal_lock_pin', { p_pin: pin });
export const fetchDiscountActivity = () => supabase.from('order_adjustments').select('id,kind,label,amount,status,created_at,order:orders(order_number),promotion:promotions(name),voucher:vouchers(code)').order('created_at',{ascending:false}).limit(100);
