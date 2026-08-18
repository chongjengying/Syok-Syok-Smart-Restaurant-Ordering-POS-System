import { useCallback, useEffect, useState } from 'react';
import { getUnpaidOrders } from '../services/order.service';
import { subscribeToKitchenQueue } from '../services/kitchen.service';
import type { Order } from '../types/order';

export function useUnpaidOrders(enabled = true) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!enabled) return;
    if (!silent) setIsLoading(true);
    const result = await getUnpaidOrders();
    if (result.error || !result.data) setError(result.error?.message || 'Unable to load unpaid orders.');
    else {
      setOrders(result.data);
      setError('');
    }
    if (!silent) setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    void refresh();
    return subscribeToKitchenQueue(() => { void refresh({ silent: true }); });
  }, [enabled, refresh]);

  return { orders, isLoading, error, refresh };
}
