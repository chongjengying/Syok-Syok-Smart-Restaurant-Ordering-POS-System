import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllProducts } from '../services/catalog.service';
import {
  getProductCache,
  isProductCacheStale,
  refreshProductCache,
  subscribeToProductCache,
  type ProductCacheEntry,
} from '../services/product-cache.service';
import type { Product } from '../types/product';

interface ProductHookFilters {
  categoryId?: string | null;
  search?: string;
}

async function loadProductCatalogue(): Promise<Product[]> {
  const result = await getAllProducts();
  if (result.error || !result.data) {
    throw result.error || new Error('Unable to load products.');
  }
  return result.data;
}

function matchesSearch(product: Product, normalizedSearch: string): boolean {
  if (!normalizedSearch) return true;
  return [product.name, product.description, product.categoryName]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
}

export function useProducts({ categoryId = null, search = '' }: ProductHookFilters = {}) {
  const [cache, setCache] = useState<ProductCacheEntry | null>(() => getProductCache());
  const [isFetching, setIsFetching] = useState(() => isProductCacheStale(getProductCache()));
  const [error, setError] = useState('');

  const executeRefresh = useCallback(async (force = false) => {
    setIsFetching(true);
    try {
      await refreshProductCache(loadProductCatalogue, force);
      setError('');
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load products.');
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeToProductCache((entry) => {
      if (active) setCache(entry);
    });

    const cached = getProductCache();
    setCache(cached);
    if (!cached || isProductCacheStale(cached)) void executeRefresh();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible' && isProductCacheStale()) void executeRefresh();
    };
    const refreshWhenOnline = () => { if (isProductCacheStale()) void executeRefresh(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenOnline);

    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenOnline);
    };
  }, [executeRefresh]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const products = useMemo(() => (cache?.products || []).filter((product) => (
    (!categoryId || product.categoryId === categoryId) && matchesSearch(product, normalizedSearch)
  )), [cache, categoryId, normalizedSearch]);

  const hasCachedData = cache !== null;
  return {
    products,
    isLoading: !hasCachedData && isFetching,
    isInitialLoading: !hasCachedData && isFetching,
    isFetching,
    isBackgroundRefreshing: hasCachedData && isFetching,
    hasCachedData,
    error,
    refetch: () => executeRefresh(true),
  };
}
