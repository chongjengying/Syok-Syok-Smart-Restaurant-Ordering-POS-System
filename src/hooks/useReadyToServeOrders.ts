import { useCallback, useEffect, useState } from 'react';
import { subscribeToKitchenQueue } from '../services/kitchen.service';
import { getReadyToServeOrders } from '../services/serving.service';
import type { KitchenOrder } from '../types/kitchen';
import { createRealtimeRecoveryTracker } from '../services/realtime-recovery.service';

export function useReadyToServeOrders(enabled = true) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!enabled) return;
    if (!silent) setIsLoading(true);
    const result = await getReadyToServeOrders();
    if (result.error || !result.data) setError(result.error?.message || 'Unable to load ready orders.');
    else {
      setOrders(result.data);
      setError('');
    }
    if (!silent) setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    const trackRealtime = createRealtimeRecoveryTracker();
    return subscribeToKitchenQueue(
      () => { void refresh({ silent: true }); },
      (status) => {
        const realtime = trackRealtime(status);
        if (realtime.failed) setError('Live ready-order updates are temporarily unavailable.');
        if (realtime.shouldRefetch) void refresh({ silent: true });
      },
    );
  }, [enabled, refresh]);

  return { orders, isLoading, error, refresh };
}
