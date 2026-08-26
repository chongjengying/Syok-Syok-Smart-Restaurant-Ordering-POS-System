import { fetchManagedCategories, persistManagedCategory } from '../repositories/category.repository';
import type { CategoryManagementInput, ManagedCategory } from '../types/category';

const map = (row: Record<string, unknown>): ManagedCategory => ({
  id: String(row.id), code: String(row.category_code || ''), name: String(row.name || ''), description: String(row.description || ''),
  isActive: row.status === true, displayOrder: Number(row.display_order || 0),
  productCount: Number((row.products as Array<{ count?: number }>)?.[0]?.count || 0), createdAt: String(row.created_at || ''), updatedAt: String(row.updated_at || ''),
});
export async function getManagedCategories() {
  const result = await fetchManagedCategories();
  return result.error ? { data: null, error: result.error } : { data: (result.data || []).map(row => map(row as Record<string, unknown>)), error: null };
}
export async function saveManagedCategory(id: string | null, input: CategoryManagementInput) {
  if (!input.name.trim() || input.name.trim().length > 150) return { data: null, error: new Error('Category name is required.') };
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) return { data: null, error: new Error('Display order must be zero or greater.') };
  const result = await persistManagedCategory(id, { ...input, name: input.name.trim() });
  return result.error ? { data: null, error: result.error } : { data: map(result.data as unknown as Record<string, unknown>), error: null };
}
