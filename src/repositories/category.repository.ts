import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult, RequestOptions } from '../types/api';
import type { CategoryRecord } from '../types/category';
import { supabase } from '../infrastructure/supabase/client';
import type { CategoryManagementInput } from '../types/category';

export interface CategoryQuery extends RequestOptions {
  activeOnly?: boolean;
}

export function fetchManagedCategories() {
  return supabase.from('categories').select('id,category_code,name,description,status,display_order,created_at,updated_at,products(count)').order('display_order').order('name');
}

export function persistManagedCategory(categoryId: string | null, input: CategoryManagementInput) {
  return supabase.rpc('save_admin_category', { p_category_id: categoryId, p_payload: input });
}

export function fetchCategories({ activeOnly = true, signal }: CategoryQuery = {}) {
  return apiRequest('products', {
    path: 'categories',
    query: { activeOnly: String(activeOnly) },
    signal,
  }) as Promise<ApiResult<CategoryRecord[]>>;
}

