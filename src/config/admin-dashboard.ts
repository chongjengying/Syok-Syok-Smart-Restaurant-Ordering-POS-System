export const ADMIN_DASHBOARD_CONFIG = {
  timezone: 'Asia/Kuala_Lumpur',
  currency: 'MYR',
  analyticsRefreshMs: 60_000,
  realtimeDebounceMs: 750,
  delayedOrderMinutes: 20,
  recentOrderLimit: 8,
  topProductLimit: 5,
} as const;

export type DashboardPreset = 'today' | 'yesterday' | 'last7days' | 'month' | 'custom';
export type DashboardGranularity = 'day' | 'week' | 'month';
export type DashboardMetric = 'revenue' | 'orders' | 'averageOrderValue';
