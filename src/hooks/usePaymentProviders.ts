import { useCallback, useEffect, useState } from 'react';
import { getPaymentProviders } from '../services/payment.service';
import type { PaymentProvider } from '../types/payment';

export function usePaymentProviders(enabled = true) {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ signal } = {}) => {
    if (!enabled) return { data: null, error: null };
    setIsLoading(true);
    const result = await getPaymentProviders({ signal });
    if (!signal?.aborted) {
      setProviders(Array.isArray(result.data) ? result.data : []);
      setError(result.error?.message || '');
      setIsLoading(false);
    }
    return result;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setProviders([]);
      setError('');
      setIsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    void refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [enabled, refresh]);

  return { providers, isLoading, error, refresh };
}
