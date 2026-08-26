import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export class CategoryRepository {
  constructor(private readonly client: SupabaseClient) {}

  findAll() {
    return this.client
      .from('categories')
      .select('id, category_code, name, description, status')
      .order('name');
  }

  findWithActiveProducts() {
    return this.client
      .from('categories')
      .select('id, category_code, name, description, status')
      .eq('status', true)
      .order('name');
  }

  findById(categoryId: string) {
    return this.client
      .from('categories')
      .select('id, category_code, name, description')
      .eq('id', categoryId)
      .maybeSingle();
  }
}
