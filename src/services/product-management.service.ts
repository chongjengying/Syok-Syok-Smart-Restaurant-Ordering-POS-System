import {
  fetchManagedProducts,
  insertManagedProduct,
  updateManagedProduct,
} from '../repositories/product.repository';
import { getProductImageUrl } from './product-image.service';
import type { ApiResult } from '../types/api';
import type { ManagedProduct, ProductManagementInput } from '../types/product';

function mapManagedProduct(row: Record<string, unknown>): ManagedProduct {
  const imagePath = typeof row.image_path === 'string' && row.image_path.trim() ? row.image_path : null;
  return {
    id: String(row.id),
    code: String(row.product_code || ''),
    categoryId: String(row.category_id || ''),
    name: String(row.product_name || ''),
    description: String(row.description || ''),
    unit: String(row.unit || ''),
    price: Number(row.sell_price || 0),
    cost: Number(row.cost_price || 0),
    isActive: row.status === true,
    isAvailable: row.is_available === true,
    imagePath,
    imageUrl: getProductImageUrl(imagePath),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

function validateInput(input: ProductManagementInput): Error | null {
  if (!input.categoryId) return new Error('Choose a category.');
  if (!input.name.trim() || input.name.trim().length > 150) return new Error('Product name is required and must not exceed 150 characters.');
  if (!Number.isFinite(input.price) || input.price < 0) return new Error('Enter a valid product price.');
  if (!Number.isFinite(input.cost) || input.cost < 0) return new Error('Enter a valid product cost.');
  if ((input.description || '').length > 1000) return new Error('Description must not exceed 1000 characters.');
  return null;
}

export async function getManagedProducts(): Promise<ApiResult<ManagedProduct[]>> {
  const result = await fetchManagedProducts();
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: result.data.map(mapManagedProduct), error: null };
}

export async function createManagedProduct(input: ProductManagementInput): Promise<ApiResult<ManagedProduct>> {
  const validationError = validateInput(input);
  if (validationError) return { data: null, error: validationError };
  const result = await insertManagedProduct({ ...input, name: input.name.trim() });
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: mapManagedProduct(result.data), error: null };
}

export async function editManagedProduct(productId: string, input: ProductManagementInput): Promise<ApiResult<ManagedProduct>> {
  const validationError = validateInput(input);
  if (!productId) return { data: null, error: new Error('Product ID is required.') };
  if (validationError) return { data: null, error: validationError };
  const result = await updateManagedProduct(productId, { ...input, name: input.name.trim() });
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: mapManagedProduct(result.data), error: null };
}
