import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult, RequestOptions } from '../types/api';
import type { CategoryRecord } from '../types/category';

export interface CategoryQuery extends RequestOptions {
  activeOnly?: boolean;
}

export function fetchCategories({ activeOnly = true, signal }: CategoryQuery = {}) {
  return apiRequest('products', {
    path: 'categories',
    query: { activeOnly: String(activeOnly) },
    signal,
  }) as Promise<ApiResult<CategoryRecord[]>>;
}

