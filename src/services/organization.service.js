import * as repository from '../repositories/organization.repository';
import { supabase } from '../infrastructure/supabase/client';
export const listCompanies = repository.fetchCompanies;
export const listBranches = repository.fetchBranches;
export const getBranchManagement = repository.fetchBranchManagement;
export const saveBranchConfiguration = repository.persistBranchConfiguration;
export const listTerminals = repository.fetchTerminals;
export const changeTerminalStatus = repository.transitionTerminal;
export const reassignTerminal = repository.reassignTerminal;
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
