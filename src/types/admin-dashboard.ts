import type { DashboardGranularity, DashboardMetric, DashboardPreset } from '../config/admin-dashboard';

export interface DashboardFilters {
  preset: DashboardPreset;
  dateFrom: string;
  dateTo: string;
  diningMode: string;
  paymentMethod: string;
  paymentProviderId: string;
  staffId: string;
  branchId: string;
  granularity: DashboardGranularity;
  metric: DashboardMetric;
}

export interface DashboardAccess {
  reports: boolean;
  orders: boolean;
  payments: boolean;
  tables: boolean;
  audit: boolean;
  staffPerformance: boolean;
}

export interface DashboardData {
  generatedAt: string;
  timezone: string;
  businessName: string;
  branchName: string;
  delayedOrderMinutes: number;
  access: DashboardAccess;
  sales: Record<string, number>;
  comparison: Record<string, number | null>;
  orders: Record<string, number>;
  orderStatus: Record<string, number>;
  orderTypes: Record<string, number>;
  payments: { methods: Array<Record<string, unknown>>; refunds: Record<string, number>; failed: Record<string, number>; unpaidOrders: number };
  live: { tables: Record<string, number>; kitchen: Record<string, number> };
  topProducts: Array<Record<string, unknown>>;
  topCategory: Record<string, unknown> | null;
  salesPerformance: Array<Record<string, unknown>>;
  previousPerformance: Array<Record<string, unknown>>;
  recentOrders: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  staffPerformance: Array<Record<string, unknown>>;
  recentActivities: Array<Record<string, unknown>>;
  filterOptions: { branches: Array<Record<string, unknown>>; staff: Array<Record<string, unknown>>; paymentProviders?: Array<Record<string, unknown>> };
}
