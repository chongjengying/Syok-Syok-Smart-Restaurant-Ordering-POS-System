export function staffPosStatus(user) {
  if (user.status !== 'ACTIVE') return 'Inactive';
  if (user.pinLocked || user.pin_status === 'LOCKED') return 'PIN Locked';
  if (user.pin_status === 'TEMPORARY_RESET') return 'PIN Change Required';
  if (user.pin_status !== 'ACTIVE') return 'PIN Required';
  if (user.roleActive === false) return 'Role Inactive';
  if (!(user.assignedBranchIds || user.branches?.map(branch => branch.branch_id) || []).length) return 'Branch Required';
  if (user.pos_status) return user.pos_status;
  if (user.terminals && !user.terminals.some(terminal => terminal.allowed)) return 'No Eligible Terminal';
  return 'POS Ready';
}

export function hasStaffBranch(user, branchId) {
  return (user.assignedBranchIds || user.branches?.map(branch => branch.branch_id) || []).includes(branchId);
}

export const friendlyRole = value => String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
