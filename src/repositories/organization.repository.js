import { supabase, accountSupabase } from '../infrastructure/supabase/client';
import { apiRequest } from '../infrastructure/supabase/functionsClient';
import { getDeviceDisplayName, getDeviceIdentifier } from '../services/terminal-context.service';
export const fetchCompanies = () => supabase.from('companies').select('*').order('created_at');
export const fetchBranches = () => supabase.from('branches').select('*,companies(name,code,currency_code,timezone)').order('code');
export const persistCompany = (payload) => supabase.rpc('save_company', { p_payload: payload });
export const persistBranch = (payload) => supabase.rpc('save_branch', { p_id: payload.id || null, p_payload: payload, p_expected_revision: payload.revision || null });
export const fetchBranchManagement = (id) => supabase.rpc('get_branch_management', { p_branch_id: id });
export const persistBranchConfiguration = (id, patch, revision) => supabase.rpc('save_branch_configuration', { p_branch_id: id, p_patch: patch, p_expected_revision: revision });
export const fetchTerminals = (branchId) => {
  let query = supabase.from('pos_terminals').select('id,company_id,branch_id,terminal_code,name,status,terminal_type,registration_status,lock_status,access_mode,allowed_roles,last_seen_at,registered_at,activated_at,authenticated_at,created_at,updated_at').order('terminal_code');
  if (branchId) query = query.eq('branch_id', branchId);
  return query;
};
export const subscribeToTerminalChanges = (branchId, onChange) => {
  const channel = supabase.channel(`admin-terminals-${branchId || 'all'}`).on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'pos_terminals',
    ...(branchId ? { filter: `branch_id=eq.${branchId}` } : {}),
  }, onChange).subscribe();
  return () => { void supabase.removeChannel(channel); };
};
export const persistTerminal = (form) => supabase.rpc('save_pos_terminal', { p_id: form.id || null, p_branch_id: form.branchId, p_code: form.code, p_name: form.name, p_type: form.type, p_status: 'CREATED', p_device_identifier: null });
export const changeTerminalType = (terminalId, terminalType) => supabase.rpc('change_terminal_type', { p_terminal_id: terminalId, p_terminal_type: terminalType });
export const transitionTerminal = (id, action, device) => supabase.rpc('transition_pos_terminal', { p_terminal_id: id, p_action: action, p_device_identifier: device || null });
export const resetPosDevice = (id) => supabase.rpc('reset_pos_device', { p_terminal_id: id });
export const manageTerminalDevice = (id, action, reason) => supabase.rpc('manage_terminal_device', { p_terminal_id: id, p_action: action, p_reason: reason || null });
export const forceTerminalStaffLogout = (id) => supabase.rpc('force_terminal_staff_logout', { p_terminal_id: id });
export const reassignTerminal = (id, branchId) => supabase.rpc('reassign_pos_terminal', { p_terminal_id: id, p_branch_id: branchId });
export const bindTerminalAccount = (terminalId, email) => apiRequest('terminal-account-binding', { method: 'POST', body: { terminalId, email } });
export const createTerminalActivationCode = (terminalId, forceNew = false) => supabase.rpc('create_terminal_activation_code', { p_terminal_id: terminalId, p_force_new: forceNew });
export const fetchTerminalAccessConfiguration = (terminalId) => supabase.rpc('get_terminal_access_configuration', { p_terminal_id: terminalId });
export const fetchBranchTerminalStaff = (branchId) => supabase.rpc('list_branch_terminal_staff', { p_branch_id: branchId });
export const persistTerminalWithAccess = (form) => supabase.rpc('save_terminal_with_access', { p_id: form.id || null, p_branch_id: form.branchId, p_code: form.code, p_name: form.name, p_type: form.type, p_access_mode: form.staffAccess.accessMode, p_staff_ids: form.staffAccess.staffIds });
export const fetchTerminalDeviceAssignmentHistory = (terminalId) => supabase.rpc('get_terminal_device_assignment_history', { p_terminal_id: terminalId });
export const fetchTerminalAudit = (terminalId) => supabase.from('audit_logs').select('id,action,metadata,created_at,actor_id,actor_auth_user_id').eq('terminal_id', terminalId).order('created_at', { ascending: false }).limit(12);
export const fetchTerminalStaffSession = (terminalId) => supabase.from('terminal_staff_sessions').select('staff_id,status,started_at,last_activity_at,profiles!terminal_staff_sessions_staff_id_fkey(name)').eq('terminal_id', terminalId).in('status', ['ACTIVE', 'LOCKED']).maybeSingle();
export const saveTerminalAccessConfiguration = (terminalId, accessMode, roles, staffIds = []) => supabase.rpc('save_terminal_access', { p_terminal_id: terminalId, p_access_mode: accessMode, p_allowed_roles: roles, p_staff_ids: staffIds });
export const activateTerminalWithCode = async (code, deviceIdentifier) => {
  const current = await accountSupabase.auth.getSession();
  if (current.error) return current;
  if (!current.data.session) {
    const anonymous = await accountSupabase.auth.signInAnonymously();
    if (anonymous.error) return anonymous;
  }
  const normalizedDeviceIdentifier = typeof deviceIdentifier === 'string' && deviceIdentifier.length >= 32
    ? deviceIdentifier
    : getDeviceIdentifier();
  return supabase.rpc('activate_terminal_with_code', {
    p_code: String(code || '').replace(/\D/g, '').slice(0, 6),
    p_device_identifier: normalizedDeviceIdentifier,
    p_device_name: getDeviceDisplayName(),
  });
};
export const fetchCurrentCashierShift = () => supabase.rpc('current_terminal_cash_shift');
export const openCashierShift = (openingFloat) => supabase.rpc('open_cashier_shift', { p_opening_float: openingFloat });
export const fetchCashierShiftSummary = (id) => supabase.rpc('cashier_shift_summary', { p_shift_id: id });
export const closeCashierShift = (id, actualCash, force = false, reason = null) => supabase.rpc('close_cashier_shift', { p_shift_id: id, p_actual_cash: actualCash, p_force: force, p_reason: reason });
export const forceCloseCashierShift = (id, actualCash, reason) => supabase.rpc('force_close_cashier_shift', { p_shift_id: id, p_actual_cash: actualCash, p_reason: reason });
export const createCashMovement = (id, type, amount, reason, requestKey) => supabase.rpc('record_cash_movement', { p_shift_id: id, p_type: type, p_amount: amount, p_reason: reason, p_idempotency_key: requestKey });
export const fetchCashierShifts = (shiftId, filters = {}) => supabase.rpc('list_cashier_shift_history', { p_filters: { ...filters, ...(shiftId ? { shiftId } : {}) } });
export const assignBranchStaff = (userId, branchId, isPrimary = false) => supabase.rpc('assign_user_branch', { p_user_id: userId, p_branch_id: branchId, p_is_primary: isPrimary });
export const setStaffAssignmentStatus = (assignmentId, status) => supabase.rpc('set_staff_branch_assignment_status', { p_assignment_id: assignmentId, p_status: status });
export const setPrimaryStaffBranch = (assignmentId) => supabase.rpc('set_primary_staff_branch', { p_assignment_id: assignmentId });

export const verifyTerminalPin = (pin) => supabase.rpc('verify_own_terminal_lock_pin', { p_pin: pin });
export const fetchDiscountActivity = () => supabase.from('order_adjustments').select('id,kind,label,amount,status,created_at,order:orders(order_number),promotion:promotions(name),voucher:vouchers(code)').order('created_at',{ascending:false}).limit(100);
