import { useCallback, useEffect, useState } from 'react';
import { getTables, subscribeToTables } from '../services/table.service';
import type { RestaurantTable } from '../types/table';

interface TableHookOptions {
  includeInactive?: boolean;
}

export function useTables(enabled = true, { includeInactive = false }: TableHookOptions = {}) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ signal }: { signal?: AbortSignal } = {}) => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getTables({ signal, includeInactive });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      setError(result.error?.message || 'Unable to load restaurant tables.');
    } else {
      setTables(result.data);
      setError('');
    }
    setIsLoading(false);
  }, [enabled, includeInactive]);

  useEffect(() => {
    if (!enabled) {
      setTables([]);
      setError('');
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const load = () => active && refresh({ signal: controller.signal });
    void load();
    const unsubscribe = subscribeToTables(
      () => { void load(); },
      (status) => {
        if (active && ['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
          setError('Live table updates are temporarily unavailable.');
        } else if (active && status === 'SUBSCRIBED') {
          void load();
        }
      },
    );

    return () => {
      active = false;
      controller.abort();
      unsubscribe();
    };
  }, [enabled, refresh]);

  return { tables, isLoading, error, refresh };
}

export const useRestaurantTables = useTables;

