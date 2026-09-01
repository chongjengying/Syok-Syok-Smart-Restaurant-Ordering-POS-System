import { supabase } from '../infrastructure/supabase/client';
import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult } from '../types/api';
import type { DashboardData, DashboardFilters } from '../types/admin-dashboard';

export const fetchMyPermissions = () => supabase.rpc('get_my_permissions') as unknown as Promise<ApiResult<string[]>>;
export const fetchAdminDashboard = (filters: DashboardFilters) => supabase.rpc('get_admin_dashboard', {
  p_date_from: filters.dateFrom,
  p_date_to: filters.dateTo,
  p_dining_mode: filters.diningMode || null,
  p_payment_method: filters.paymentMethod || null,
  p_payment_provider_id: filters.paymentProviderId || null,
  p_staff_id: filters.staffId || null,
  p_branch_id: filters.branchId || null,
  p_granularity: filters.granularity.toUpperCase(),
}) as unknown as Promise<ApiResult<DashboardData>>;

export function subscribeAdminDashboard(onChange: () => void) {
  const channel = supabase.channel(`admin-dashboard-${crypto.randomUUID()}`);
  ['orders', 'payments', 'restaurant_tables', 'order_item_batches'].forEach(table => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
  });
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function fetchRolesAndPermissions() {
  return Promise.all([
    supabase.from('roles').select('id,name,description').order('name'),
    supabase.from('permissions').select('id,code,module,description').order('module').order('code'),
    supabase.from('role_permissions').select('role_id,permission_id'),
  ]);
}

export const persistRolePermissions = (roleId: string, codes: string[]) => supabase.rpc('set_role_permissions', {
  p_role_id: roleId, p_permission_codes: codes,
}) as unknown as Promise<ApiResult<string[]>>;

export const insertAdminRole = (name: string, description: string) => supabase.rpc('create_admin_role', {
  p_name: name, p_description: description || null,
}) as unknown as Promise<ApiResult<Record<string, unknown>>>;

export function fetchAdminUsers(search = '', page = 1) {
  return apiRequest('admin-users', { query: { search, page: String(page), pageSize: '25' } }) as Promise<ApiResult<Record<string, unknown>>>;
}
export function inviteAdminUser(input: Record<string, unknown>) {
  return apiRequest('admin-users', { method: 'POST', body: input }) as Promise<ApiResult<Record<string, unknown>>>;
}
export function updateAdminUser(input: Record<string, unknown>) {
  return apiRequest('admin-users', { method: 'PATCH', body: input }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function fetchAuditLogs(search = '', limit = 100) {
  let query = supabase.from('audit_logs').select('id,actor_id,action,entity_type,entity_id,reason,metadata,old_value,new_value,request_id,created_at').order('created_at', { ascending: false }).limit(limit);
  if (search.trim()) query = query.or(`action.ilike.%${search.trim().replaceAll('%', '')}%,entity_type.ilike.%${search.trim().replaceAll('%', '')}%`);
  return query as unknown as Promise<ApiResult<Record<string, unknown>[]>>;
}

export function fetchAdminOrders(filters: Record<string, unknown> = {}) {
  return supabase.rpc('list_admin_orders', {
    p_search: filters.search || null, p_status: filters.status || null, p_payment_status: filters.paymentStatus || null,
    p_dining_mode: filters.diningMode || null, p_date_from: filters.dateFrom || null, p_date_to: filters.dateTo || null,
    p_limit: 25, p_offset: (Number(filters.page || 1) - 1) * 25,
  }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
}

export function fetchAdminPayments(filters: Record<string, unknown> = {}) {
  return supabase.rpc('list_admin_payments', {
    p_search: filters.search || null, p_method: filters.method || null, p_status: filters.status || null,
    p_provider_id: filters.provider || null,
    p_date_from: filters.dateFrom || null, p_date_to: filters.dateTo || null, p_limit: 25,
    p_offset: (Number(filters.page || 1) - 1) * 25,
  }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
}

export const fetchAdminReport = (reportType: string, dateFrom: string, dateTo: string) => supabase.rpc('get_admin_report', {
  p_report_type: reportType, p_date_from: dateFrom, p_date_to: dateTo,
}) as unknown as Promise<ApiResult<Record<string, unknown>[]>>;
