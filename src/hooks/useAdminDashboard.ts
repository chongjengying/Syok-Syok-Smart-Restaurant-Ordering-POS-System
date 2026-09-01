import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ADMIN_DASHBOARD_CONFIG, type DashboardPreset } from '../config/admin-dashboard';
import { subscribeAdminDashboard } from '../repositories/admin.repository';
import { createDefaultDashboardFilters, getAdminDashboard, getPresetDateRange } from '../services/admin-dashboard.service';
import type { DashboardData, DashboardFilters } from '../types/admin-dashboard';

export function useAdminDashboard(enabled = true) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(createDefaultDashboardFilters);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(true);
  const hasData = useRef(false);
  const requestSequence = useRef(0);
  const realtimeTimer = useRef<number | undefined>(undefined);
  const { dateFrom, dateTo, diningMode, paymentMethod, paymentProviderId, staffId, branchId, granularity } = filters;
  const queryFilters = useMemo<DashboardFilters>(() => ({
    preset: 'custom', metric: 'revenue', dateFrom, dateTo, diningMode, paymentMethod, paymentProviderId, staffId, branchId, granularity,
  }), [dateFrom, dateTo, diningMode, paymentMethod, paymentProviderId, staffId, branchId, granularity]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestSequence.current;
    if (hasData.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await getAdminDashboard(queryFilters);
      if (!mounted.current || requestId !== requestSequence.current) return;
      if (result.error) {
        setError(result.error.message || 'Unable to load the dashboard.');
        return;
      }
      setData(result.data);
      hasData.current = true;
      setLastUpdated(new Date());
      setError('');
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Unable to load the dashboard.');
    } finally {
      if (mounted.current && requestId === requestSequence.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled, queryFilters]);

  const setFilter = useCallback(<Key extends keyof DashboardFilters>(key: Key, value: DashboardFilters[Key]) => {
    setFilters(current => ({ ...current, [key]: value }));
  }, []);

  const setPreset = useCallback((preset: DashboardPreset) => {
    if (preset === 'custom') {
      setFilters(current => ({ ...current, preset }));
      return;
    }
    setFilters(current => ({ ...current, preset, ...getPresetDateRange(preset) }));
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, ADMIN_DASHBOARD_CONFIG.analyticsRefreshMs);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeAdminDashboard(() => {
      window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, ADMIN_DASHBOARD_CONFIG.realtimeDebounceMs);
    });
  }, [enabled, refresh]);

  useEffect(() => () => window.clearTimeout(realtimeTimer.current), []);

  return { data, filters, setFilter, setPreset, isLoading, isRefreshing, error, lastUpdated, refresh };
}
