import * as repository from '../repositories/organization.repository';
import { supabase } from '../infrastructure/supabase/client';
export const listCompanies = repository.fetchCompanies;
export const listBranches = repository.fetchBranches;
export const getBranchManagement = repository.fetchBranchManagement;
export const saveBranchConfiguration = repository.persistBranchConfiguration;
export const listTerminals = repository.fetchTerminals;
export const subscribeToTerminalChanges = repository.subscribeToTerminalChanges;
export const changeTerminalStatus = repository.transitionTerminal;
export const resetPosDevice = repository.resetPosDevice;
export const manageTerminalDevice = repository.manageTerminalDevice;
export const forceTerminalStaffLogout = repository.forceTerminalStaffLogout;
export const changeTerminalType = repository.changeTerminalType;
export const reassignTerminal = repository.reassignTerminal;
export const bindTerminalAccount = repository.bindTerminalAccount;
export const createTerminalActivationCode = repository.createTerminalActivationCode;
export const fetchTerminalAccessConfiguration = repository.fetchTerminalAccessConfiguration;
export const listBranchTerminalStaff = repository.fetchBranchTerminalStaff;
export const saveTerminalWithAccess = repository.persistTerminalWithAccess;
export const saveTerminalAccessConfiguration = repository.saveTerminalAccessConfiguration;
export const getTerminalDeviceAssignmentHistory = repository.fetchTerminalDeviceAssignmentHistory;
export const getTerminalAudit = repository.fetchTerminalAudit;
export const getTerminalStaffSession = repository.fetchTerminalStaffSession;
export const activateTerminalWithCode = repository.activateTerminalWithCode;
export const getCurrentCashierShift = repository.fetchCurrentCashierShift;
export const openCashierShift = repository.openCashierShift;
export const getCashierShiftSummary = repository.fetchCashierShiftSummary;
export const closeCashierShift = repository.closeCashierShift;
export const forceCloseCashierShift = repository.forceCloseCashierShift;
export const recordCashMovement = repository.createCashMovement;
export const listCashierShifts = repository.fetchCashierShifts;
export const saveTerminalAccess = (terminalId, accessMode, roles, staffIds = []) => supabase.rpc('save_terminal_access', { p_terminal_id: terminalId, p_access_mode: accessMode, p_allowed_roles: roles, p_staff_ids: staffIds });
export const assignStaffBranch = repository.assignBranchStaff;
export const setStaffAssignmentStatus = repository.setStaffAssignmentStatus;
export const setPrimaryStaffBranch = repository.setPrimaryStaffBranch;
export function saveOrganization(mode, form) {
  const payload = { ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() };
  if (!payload.name || !/^[A-Z0-9_-]{2,30}$/.test(payload.code)) return Promise.resolve({ error: new Error('Enter a name and a code using 2–30 letters, numbers, underscores or hyphens.') });
  return mode === 'company' ? repository.persistCompany(payload) : repository.persistBranch(payload);
}
export function saveTerminal(form) {
  if (!form.branchId || !form.name.trim() || !/^[A-Z0-9_-]{2,40}$/.test(form.code.trim().toUpperCase())) return Promise.resolve({ error: new Error('A branch, terminal code and name are required.') });
  return repository.persistTerminal({ ...form, name: form.name.trim(), code: form.code.trim().toUpperCase() });
}

export const verifyTerminalPin = repository.verifyTerminalPin;
export const listDiscountActivity = repository.fetchDiscountActivity;
