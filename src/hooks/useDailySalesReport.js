import { useCallback, useEffect, useState } from 'react';
import { getDailySalesReport } from '../services/payment.service';

export function useDailySalesReport(enabled, filters = {}) {
  const { dateFrom, dateTo } = filters;
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refetch = useCallback(async ({ signal } = {}) => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getDailySalesReport({ dateFrom, dateTo }, { signal });
    if (signal?.aborted) return;
    if (result.error) {
      setRows([]);
      setError(result.error.message || 'Unable to load the daily sales report.');
    } else {
      setRows(Array.isArray(result.data) ? result.data : []);
      setError('');
    }
    setIsLoading(false);
  }, [dateFrom, dateTo, enabled]);

  useEffect(() => {
    const controller = new AbortController();
    refetch({ signal: controller.signal });
    return () => controller.abort();
  }, [refetch]);

  return { rows, isLoading, error, refetch };
}
