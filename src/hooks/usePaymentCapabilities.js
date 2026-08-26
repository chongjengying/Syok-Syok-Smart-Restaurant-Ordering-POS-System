import { useCallback, useEffect, useState } from 'react';
import { getPaymentCapabilities } from '../services/payment.service';

export function usePaymentCapabilities(enabled = true) {
  const [methods, setMethods] = useState([]);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ signal } = {}) => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getPaymentCapabilities({ signal });
    if (signal?.aborted) return;
    if (result.error) {
      setMethods([]);
      setError(result.error.message || 'Provider availability could not be loaded.');
    } else {
      setMethods(result.data);
      setError('');
    }
    setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setMethods([]);
      setError('');
      setIsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    refresh({ signal: controller.signal });
    return () => controller.abort();
  }, [enabled, refresh]);

  return { methods, isLoading, error, refresh };
}
