import { fetchAdminUsers, inviteAdminUser, requireStaffPinSetup, updateAdminUser } from '../repositories/admin.repository';
export const getAdminUsers = (search = '', page = 1) => fetchAdminUsers(search, page);
export const createStaffInvitation = (input: Record<string, unknown>) => inviteAdminUser(input);
export const editStaffAccount = (input: Record<string, unknown>) => updateAdminUser(input);
export const requestStaffPasswordReset = (userId: string) => updateAdminUser({ userId, action: 'reset-password' });
export const requestStaffPinSetup = (userId: string) => requireStaffPinSetup(userId);
