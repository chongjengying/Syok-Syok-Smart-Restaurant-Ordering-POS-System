import { useCallback, useEffect, useState } from 'react';
import { getTables, subscribeToTables } from '../services/table.service';
import type { RestaurantTable } from '../types/table';
import { createRealtimeRecoveryTracker } from '../services/realtime-recovery.service';

interface TableHookOptions {
  includeInactive?: boolean;
}

export function useTables(enabled = true, { includeInactive = false }: TableHookOptions = {}) {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async ({ signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {}) => {
    if (!enabled) return;
    if (!silent) setIsLoading(true);
    const result = await getTables({ signal, includeInactive });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      setError(result.error?.message || 'Unable to load restaurant tables.');
    } else {
      setTables(result.data);
      setError('');
    }
    if (!silent) setIsLoading(false);
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
    const trackRealtime = createRealtimeRecoveryTracker();
    const load = (silent = false) => active && refresh({ signal: controller.signal, silent });
    void load();
    const unsubscribe = subscribeToTables(
      () => { void load(true); },
      (status) => {
        const realtime = trackRealtime(status);
        if (active && realtime.failed) {
          setError('Live table updates are temporarily unavailable.');
        }
        if (active && realtime.shouldRefetch) void load(true);
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
