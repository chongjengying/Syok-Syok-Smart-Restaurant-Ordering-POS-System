import { fetchAdminDashboard } from '../repositories/admin.repository';
import { ADMIN_DASHBOARD_CONFIG, type DashboardPreset } from '../config/admin-dashboard';
import type { DashboardFilters } from '../types/admin-dashboard';

export async function getAdminDashboard(filters: DashboardFilters) {
  const result = await fetchAdminDashboard(filters);
  return { data: result.data, error: result.error };
}

const isoDateInRestaurantTimezone = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_DASHBOARD_CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const shiftDate = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function getPresetDateRange(preset: DashboardPreset) {
  const today = isoDateInRestaurantTimezone();
  if (preset === 'yesterday') return { dateFrom: shiftDate(today, -1), dateTo: shiftDate(today, -1) };
  if (preset === 'last7days') return { dateFrom: shiftDate(today, -6), dateTo: today };
  if (preset === 'month') return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
  return { dateFrom: today, dateTo: today };
}

export function createDefaultDashboardFilters(): DashboardFilters {
  return {
    preset: 'today', ...getPresetDateRange('today'), diningMode: '', paymentMethod: '', paymentProviderId: '', staffId: '', branchId: '',
    granularity: 'day', metric: 'revenue',
  };
}
