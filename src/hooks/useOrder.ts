import { useEffect, useState } from 'react';
import { getOrder, subscribeToOrder } from '../services/order.service';
import type { Order } from '../types/order';
import { createRealtimeRecoveryTracker } from '../services/realtime-recovery.service';

export function useOrder(orderId: string | null | undefined, enabled = true) {
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled && orderId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled || !orderId) {
      setOrder(null);
      setError('');
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    const load = async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setIsLoading(true);
      const result = await getOrder(orderId);
      if (!active) return;
      if (result.error || !result.data) {
        setError(result.error?.message || 'Unable to load order details.');
      } else {
        setOrder(result.data);
        setError('');
      }
      if (!silent) setIsLoading(false);
    };

    void load();
    const trackRealtime = createRealtimeRecoveryTracker();
    const unsubscribe = subscribeToOrder(
      orderId,
      () => { void load({ silent: true }); },
      (status) => {
        const realtime = trackRealtime(status);
        if (active && realtime.failed) setError('Live order updates are temporarily unavailable.');
        if (active && realtime.shouldRefetch) void load({ silent: true });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [enabled, orderId]);

  return { order, isLoading, error };
}

export const useOrderDetails = useOrder;
