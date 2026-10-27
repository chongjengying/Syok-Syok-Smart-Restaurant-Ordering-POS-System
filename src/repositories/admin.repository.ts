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
    supabase.rpc('list_admin_roles_with_counts'),
    supabase.from('permissions').select('id,code,module,description,scope,is_active').eq('scope', 'COMPANY_ASSIGNABLE').eq('is_active', true).order('module').order('code'),
    supabase.from('role_permissions').select('role_id,permission_id'),
  ]);
}

export const persistRolePermissions = (roleId: string, codes: string[]) => supabase.rpc('set_role_permissions', {
  p_role_id: roleId, p_permission_codes: codes,
}) as unknown as Promise<ApiResult<string[]>>;

export const insertAdminRole = (name: string, description: string) => supabase.rpc('create_admin_role', {
  p_name: name, p_description: description || null,
}) as unknown as Promise<ApiResult<Record<string, unknown>>>;
export const setAdminRoleStatus = (roleId: string, active: boolean) => supabase.rpc(active ? 'activate_admin_role' : 'deactivate_admin_role', {
  p_role_id: roleId,
}) as unknown as Promise<ApiResult<Record<string, unknown>>>;

export function fetchAdminUsers(search = '', page = 1) {
  return apiRequest('admin-users', { query: { search, page: String(page), pageSize: '25' } }) as Promise<ApiResult<Record<string, unknown>>>;
}
export const fetchAdminStaffDetail = (staffId: string) => supabase.rpc('get_admin_staff_detail', { p_staff_id: staffId });
export function inviteAdminUser(input: Record<string, unknown>) {
  return apiRequest('admin-users', { method: 'POST', body: input }) as Promise<ApiResult<Record<string, unknown>>>;
}
export function updateAdminUser(input: Record<string, unknown>) {
  return supabase.rpc('admin_update_staff_record', {
    p_staff_id: input.userId,
    p_name: input.name,
    p_role: input.role,
    p_branch_id: input.branchId,
    p_active: input.active,
    p_additional_branch_ids: input.additionalBranchIds || [],
  }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
}
export const requireStaffPinSetup = (staffId: string) => supabase.rpc('admin_reset_staff_pin', {
  p_staff_id: staffId,
}) as unknown as Promise<ApiResult<{ temporaryPin: string }>>;

export const fetchAuditLogs = (filters: Record<string, unknown> = {}) =>
  supabase.rpc('list_pos_audit_events', { p_filters: { ...filters, limit: 100 } }) as unknown as Promise<ApiResult<Record<string, unknown>[]>>;

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

export function fetchAdminRefunds(filters: Record<string, unknown> = {}) {
  return supabase.rpc('list_admin_refunds', {
    p_search: filters.search || null,
    p_status: filters.refundStatus || null,
    p_refund_type: filters.refundType || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_limit: 25,
    p_offset: (Number(filters.page || 1) - 1) * 25,
  }) as unknown as Promise<ApiResult<Record<string, unknown>[]>>;
}

export function fetchAdminReceipts(filters: Record<string, unknown> = {}) {
  return supabase.rpc('list_admin_receipts', {
    p_search: filters.search || null,
    p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null,
    p_branch_id: filters.branchId || null,
    p_terminal_id: filters.terminalId || null,
    p_cashier_id: filters.cashierId || null,
    p_payment_method: filters.paymentMethod || null,
    p_limit: 25,
    p_offset: (Number(filters.page || 1) - 1) * 25,
  }) as unknown as Promise<ApiResult<Record<string, unknown>[]>>;
}

export const fetchPosReceipt = (orderId: string) => supabase.rpc('get_pos_receipt', { p_order_id: orderId }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
export const requestReceiptPrint = (receiptId: string, printerId: string | null, reason: string | null) => supabase.rpc('request_receipt_print', { p_receipt_id: receiptId, p_printer_id: printerId, p_reason: reason }) as unknown as Promise<ApiResult<Record<string, unknown>>>;

export const fetchAdminReport = (reportType: string, dateFrom: string, dateTo: string) => supabase.rpc('get_admin_report', {
  p_report_type: reportType, p_date_from: dateFrom, p_date_to: dateTo,
}) as unknown as Promise<ApiResult<Record<string, unknown>[]>>;
