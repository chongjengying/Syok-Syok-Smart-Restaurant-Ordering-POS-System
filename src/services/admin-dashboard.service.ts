import { fetchAdminDashboard } from '../repositories/admin.repository';
export async function getAdminDashboard() {
  const result = await fetchAdminDashboard();
  return { data: result.data, error: result.error };
}
