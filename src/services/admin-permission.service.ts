import { fetchMyPermissions, fetchRolesAndPermissions, insertAdminRole, persistRolePermissions } from '../repositories/admin.repository';

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
export function createRole(name: string, description: string) {
  const normalizedName = name.trim().toUpperCase();
  const normalizedDescription = description.trim();
  if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(normalizedName)) return Promise.resolve({ data: null, error: new Error('Role name must be 2–50 characters using uppercase letters, numbers, or underscores.') });
  if (normalizedDescription.length > 500) return Promise.resolve({ data: null, error: new Error('Description must not exceed 500 characters.') });
  return insertAdminRole(normalizedName, normalizedDescription);
}
