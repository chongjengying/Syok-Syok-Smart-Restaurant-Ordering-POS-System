import { useCallback, useEffect, useState } from 'react';
import { getPaymentSummary } from '../services/payment.service';
import type { PaymentSummary } from '../types/payment';

export function usePaymentSummary(orderId: string | null | undefined, enabled = true, refreshKey = '') {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled && orderId));
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!enabled || !orderId) return { data: null, error: null };
    setIsLoading(true);
    const result = await getPaymentSummary(orderId);
    if (result.error || !result.data) {
      setError(result.error?.message || 'Unable to load the payment summary.');
    } else {
      setSummary(result.data);
      setError('');
    }
    setIsLoading(false);
    return result;
  }, [enabled, orderId]);

  useEffect(() => { void refetch(); }, [refetch, refreshKey]);

  return { summary, isLoading, error, refetch };
}
