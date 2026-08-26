import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminDashboard } from '../services/admin-dashboard.service';

export function useAdminDashboard(enabled = true) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(true);
  const hasData = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (hasData.current) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const result = await getAdminDashboard();
      if (!mounted.current) return;
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
      if (mounted.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  return { data, isLoading, isRefreshing, error, lastUpdated, refresh };
}
