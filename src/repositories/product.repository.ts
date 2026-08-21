import { apiRequest } from '../infrastructure/supabase/functionsClient';
import { supabase } from '../infrastructure/supabase/client';
import type { ApiResult, RequestOptions } from '../types/api';
import type { ProductFilters, ProductPage, ProductRecord } from '../types/product';

export function fetchProducts(filters: ProductFilters = {}, { signal }: RequestOptions = {}) {
  return apiRequest('products', {
    query: {
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.limit ? { limit: String(filters.limit) } : {}),
      ...(filters.offset ? { offset: String(filters.offset) } : {}),
      ...(filters.availableOnly ? { availableOnly: 'true' } : {}),
    },
    signal,
  }) as Promise<ApiResult<ProductPage<ProductRecord>>>;
}

export function fetchProductById(productId: string, { signal }: RequestOptions = {}) {
  return apiRequest('products', { path: productId, signal }) as Promise<ApiResult<ProductRecord>>;
}

export function fetchProductsByCategory(
  categoryId: string,
  filters: Omit<ProductFilters, 'categoryId'> = {},
  options: RequestOptions = {},
) {
  return fetchProducts({ ...filters, categoryId }, options);
}

// The menu endpoint only exposes rows where products.status = true.
export function fetchAvailableProducts(
  filters: ProductFilters = {},
  options: RequestOptions = {},
) {
  return fetchProducts({ ...filters, availableOnly: true }, options);
}

export function subscribeToCatalogChanges(
  onChange: (payload: unknown) => void,
  onStatus?: (status: string) => void,
) {
  const channel = supabase
    .channel(`catalog-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, onChange)
    .subscribe((status) => onStatus?.(status));

  return () => { void supabase.removeChannel(channel); };
}
