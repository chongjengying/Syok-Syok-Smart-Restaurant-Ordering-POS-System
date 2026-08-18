import { useCallback, useEffect, useState } from 'react';
import { getCategories } from '../services/catalog.service';
import type { Category } from '../types/category';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async ({ signal }: { signal?: AbortSignal } = {}) => {
    setIsLoading(true);
    const result = await getCategories({ signal });
    if (signal?.aborted) return;
    if (result.error || !result.data) {
      setCategories([]);
      setError(result.error?.message || 'Unable to load categories.');
    } else {
      setCategories(result.data);
      setError('');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refetch({ signal: controller.signal });
    return () => controller.abort();
  }, [refetch]);

  return { categories, isLoading, error, refetch };
}

