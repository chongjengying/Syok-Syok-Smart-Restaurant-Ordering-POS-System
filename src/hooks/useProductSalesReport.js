import { useCallback, useEffect, useState } from 'react';
import { getProductSalesReport } from '../services/payment.service';

export function useProductSalesReport(enabled, filters) {
  const { dateFrom, dateTo } = filters;
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refetch = useCallback(async ({ signal } = {}) => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getProductSalesReport({ dateFrom, dateTo }, { signal });
    if (signal?.aborted) return;
    if (result.error) {
      setRows([]);
      setError(result.error.message || 'Unable to load the product sales report.');
    } else {
      setRows(Array.isArray(result.data) ? result.data : []);
      setError('');
    }
    setIsLoading(false);
  }, [dateFrom, dateTo, enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void refetch({ signal: controller.signal });
    return () => controller.abort();
  }, [refetch]);

  return { rows, isLoading, error, refetch };
}
