import { useCallback, useEffect, useState } from 'react';
import { getCategories, subscribeToCatalog } from '../services/catalog.service';
import type { Category } from '../types/category';
import { createRealtimeRecoveryTracker } from '../services/realtime-recovery.service';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async ({ signal, silent = false }: { signal?: AbortSignal; silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true);
    const result = await getCategories({ signal });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      if (!silent) setCategories([]);
      setError(result.error?.message || 'Unable to load categories.');
    } else {
      setCategories(result.data);
      setError('');
    }
    if (!silent) setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refetch({ signal: controller.signal });
    const trackRealtime = createRealtimeRecoveryTracker();
    const unsubscribe = subscribeToCatalog(
      () => { void refetch({ silent: true }); },
      (status) => {
        const realtime = trackRealtime(status);
        if (realtime.failed) setError('Live category updates are temporarily unavailable.');
        if (realtime.shouldRefetch) void refetch({ silent: true });
      },
    );
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [refetch]);

  return { categories, isLoading, error, refetch };
}
