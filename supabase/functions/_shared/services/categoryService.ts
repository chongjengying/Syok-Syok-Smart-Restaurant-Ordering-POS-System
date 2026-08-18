import { CategoryRepository } from '../repositories/categoryRepository.ts';

type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  status?: boolean;
};

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  async getCategories(activeOnly = true) {
    const result = activeOnly
      ? await this.repository.findWithActiveProducts()
      : await this.repository.findAll();
    if (result.error) return { data: null, error: result.error };

    return {
      data: (result.data as CategoryRow[]).map(({ id, name, description }) => ({
        id,
        name,
        description: description || '',
      })),
      error: null,
    };
  }
}
