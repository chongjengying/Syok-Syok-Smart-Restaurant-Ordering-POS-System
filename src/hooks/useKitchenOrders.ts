import { useCallback, useEffect, useState } from 'react';
import {
  getKitchenQueue,
  subscribeToKitchenQueue,
  type KitchenTicket,
} from '../services/kitchen.service';

export function useKitchenOrders(enabled = true) {
  const [orders, setOrders] = useState<KitchenTicket[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refresh = useCallback(async (
    { signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {},
  ) => {
    if (!enabled) return;
    if (!silent) setIsLoading(true);
    const result = await getKitchenQueue({ signal });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      setError(result.error?.message || 'Unable to load the kitchen queue.');
    } else {
      setOrders(result.data);
      setError('');
    }
    if (!silent) setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setOrders([]);
      setError('');
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    void refresh({ signal: controller.signal });
    const unsubscribe = subscribeToKitchenQueue(
      () => { if (active) void refresh({ silent: true }); },
      (status) => {
        if (active && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          setError('Live kitchen updates are temporarily unavailable.');
        }
      },
    );

    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [enabled, refresh]);

  return { orders, isLoading, error, refresh };
}
