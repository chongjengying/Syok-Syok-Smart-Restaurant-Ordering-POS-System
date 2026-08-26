import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type ProductFilters = {
  categoryId?: string | null;
  search?: string | null;
  limit: number;
  offset: number;
  availableOnly?: boolean;
};

export class ProductRepository {
  constructor(private readonly client: SupabaseClient) {}

  findActive(filters: ProductFilters) {
    let query = this.client
      .from('products')
      .select(
        'id, product_code, category_id, product_name, description, unit, sell_price, status, is_available, image_path, categories(id, name)',
        { count: 'exact' },
      )
      .eq('status', true)
      .order('product_name')
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
    if (filters.availableOnly) query = query.eq('is_available', true);
    if (filters.search) query = query.ilike('product_name', `%${filters.search}%`);
    return query;
  }

  findActiveById(productId: string) {
    return this.client
      .from('products')
      .select('id, product_code, category_id, product_name, description, unit, sell_price, status, is_available, image_path, categories(id, name)')
      .eq('id', productId)
      .eq('status', true)
      .maybeSingle();
  }

  findOptionGroups(productIds: string[]) {
    if (productIds.length === 0) return Promise.resolve({ data: [], error: null });

    return this.client
      .from('product_option_groups')
      .select('id, product_id, name, selection_type, is_required, min_selection, max_selection, sort_order, product_options(id, name, price_adjustment, is_available, sort_order)')
      .in('product_id', productIds)
      .order('sort_order');
  }
}
