import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export class CategoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  findAll() {
    return this.client
      .from('categories')
      .select('id, category_code, name, description, status, display_order')
      .order('display_order').order('name');
  }

  findWithActiveProducts() {
    return this.client
      .from('categories')
      .select('id, category_code, name, description, status, display_order')
      .eq('status', true)
      .order('display_order').order('name');
  }

  findById(categoryId: string) {
    return this.client
      .from('categories')
      .select('id, category_code, name, description, display_order')
      .eq('id', categoryId)
      .maybeSingle();
  }
}
