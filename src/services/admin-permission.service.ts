import { fetchMyPermissions, fetchRolesAndPermissions, persistRolePermissions } from '../repositories/admin.repository';

export async function getMyPermissions() {
  const result = await fetchMyPermissions();
  return { data: result.data || [], error: result.error };
}
export async function getRolePermissionMatrix() {
  const [roles, permissions, assignments] = await fetchRolesAndPermissions();
  const error = roles.error || permissions.error || assignments.error;
  if (error) return { data: null, error };
  return { data: { roles: roles.data || [], permissions: permissions.data || [], assignments: assignments.data || [] }, error: null };
}
export const saveRolePermissions = (roleId: string, codes: string[]) => persistRolePermissions(roleId, codes);
