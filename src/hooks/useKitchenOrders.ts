import { useCallback, useEffect, useState } from 'react';
import {
  getKitchenQueue,
  subscribeToKitchenQueue,
  type KitchenTicket,
} from '../services/kitchen.service';
import { createRealtimeRecoveryTracker } from '../services/realtime-recovery.service';

export function useKitchenOrders(enabled = true, pageSize = 25) {
  const [orders, setOrders] = useState<KitchenTicket[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refresh = useCallback(async (
    { signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {},
  ) => {
    if (!enabled) return;
    if (!silent) setIsLoading(true);
    const result = await getKitchenQueue({ signal, page, pageSize });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      setError(result.error?.message || 'Unable to load the kitchen queue.');
    } else {
      setOrders(result.data.rows);
      setTotal(result.data.total);
      setError('');
    }
    if (!silent) setIsLoading(false);
  }, [enabled, page, pageSize]);

  useEffect(() => {
    if (!enabled) {
      setOrders([]);
      setError('');
      setIsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;
    const trackRealtime = createRealtimeRecoveryTracker();
    void refresh({ signal: controller.signal });
    const unsubscribe = subscribeToKitchenQueue(
      () => { if (active) void refresh({ silent: true }); },
      (status) => {
        const realtime = trackRealtime(status);
        if (active && realtime.failed) {
          setError('Live kitchen updates are temporarily unavailable.');
        }
        if (active && realtime.shouldRefetch) void refresh({ silent: true });
      },
    );

    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [enabled, refresh]);

  return { orders, isLoading, error, refresh, page, setPage, pageSize, total };
}
