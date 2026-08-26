import { apiRequest } from '../infrastructure/supabase/functionsClient';
import { supabase } from '../infrastructure/supabase/client';
import type { ApiResult, RequestOptions } from '../types/api';
import type { ProductFilters, ProductManagementInput, ProductPage, ProductRecord } from '../types/product';

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

const managedProductColumns = 'id, product_code, category_id, product_name, description, unit, cost_price, sell_price, status, is_available, image_path, created_at, updated_at';

export function fetchManagedProducts() {
  return supabase
    .from('products')
    .select(managedProductColumns)
    .order('product_name') as unknown as Promise<ApiResult<Array<Record<string, unknown>>>>;
}

export function insertManagedProduct(input: ProductManagementInput) {
  return supabase.rpc('save_admin_product', { p_product_id: null, p_payload: input }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
}

export function updateManagedProduct(productId: string, input: ProductManagementInput) {
  return supabase.rpc('save_admin_product', { p_product_id: productId, p_payload: input }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
}

export function persistProductImagePath(productId: string, imagePath: string | null) {
  return supabase.rpc('set_product_image_path', {
    p_product_id: productId,
    p_image_path: imagePath,
  }) as unknown as Promise<ApiResult<Record<string, unknown>>>;
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
