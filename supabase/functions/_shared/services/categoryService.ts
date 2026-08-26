import { CategoryRepository } from '../repositories/categoryRepository.ts';

type CategoryRow = {
  id: string;
  category_code: string;
  name: string;
  description: string | null;
  status?: boolean;
  display_order?: number;
};

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  async getCategories(activeOnly = true) {
    const result = activeOnly
      ? await this.repository.findWithActiveProducts()
      : await this.repository.findAll();
    if (result.error) return { data: null, error: result.error };

    return {
      data: (result.data as CategoryRow[]).map(({ id, category_code, name, description, display_order }) => ({
        id,
        code: category_code,
        name,
        description: description || '',
        displayOrder: display_order || 0,
      })),
      error: null,
    };
  }
}
