import { fetchCategories } from '../repositories/category.repository';
import {
  fetchAvailableProducts,
  fetchProductById,
  fetchProducts,
  fetchProductsByCategory,
  subscribeToCatalogChanges,
} from '../repositories/product.repository';
import type { ApiResult, RequestOptions } from '../types/api';
import type { Category, CategoryRecord } from '../types/category';
import type { Product, ProductFilters, ProductPage, ProductRecord } from '../types/product';
import { isOrderableProduct, mapProductRecord } from './product-mapper';

function mapCategory(category: CategoryRecord): Category {
  return {
    id: category.id,
    code: category.code || '',
    name: category.name,
    description: category.description || '',
    isActive: category.status !== false,
    displayOrder: category.displayOrder || 0,
  };
}

async function mapProductPage(
  request: Promise<ApiResult<ProductPage<ProductRecord>>>,
): Promise<ApiResult<ProductPage<Product>>> {
  const result = await request;
  if (result.error || !result.data) return { data: null, error: result.error };
  const normalized = result.data.products
    .map(mapProductRecord)
    .filter((product): product is Product => product !== null);
  if (result.data.products.length > 0 && normalized.length === 0) {
    return { data: null, error: new Error('The product service returned invalid product data.') };
  }
  return {
    data: {
      products: normalized,
      pagination: result.data.pagination,
    },
    error: null,
  };
}

export async function getCategories(options: RequestOptions = {}): Promise<ApiResult<Category[]>> {
  const result = await fetchCategories({ ...options, activeOnly: true });
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: result.data.map(mapCategory), error: null };
}

export async function getProducts(
  filters: ProductFilters = {},
  options: RequestOptions = {},
): Promise<ApiResult<ProductPage<Product>>> {
  return mapProductPage(fetchProducts(filters, options));
}

export function getProductsByCategory(
  categoryId: string,
  filters: Omit<ProductFilters, 'categoryId'> = {},
  options: RequestOptions = {},
): Promise<ApiResult<ProductPage<Product>>> {
  if (!categoryId) {
    return Promise.resolve({ data: null, error: new Error('Category ID is required.') });
  }
  return mapProductPage(fetchProductsByCategory(categoryId, filters, options));
}

export function getAvailableProducts(
  filters: ProductFilters = {},
  options: RequestOptions = {},
): Promise<ApiResult<ProductPage<Product>>> {
  return mapProductPage(fetchAvailableProducts(filters, options)).then((result) => ({
    ...result,
    data: result.data ? { ...result.data, products: result.data.products.filter(isOrderableProduct) } : null,
  }));
}

/** Active catalogue rows, including sold-out products for transparent POS display. */
export function getAllProducts(
  filters: Omit<ProductFilters, 'limit' | 'offset'> = {},
  options: RequestOptions = {},
): Promise<ApiResult<Product[]>> {
  const limit = 200;
  const load = async (): Promise<ApiResult<Product[]>> => {
    const first = await getProducts({ ...filters, limit, offset: 0 }, options);
    if (first.error || !first.data) return { data: null, error: first.error };
    const total = first.data.pagination.total;
    if (typeof total !== 'number' || total <= limit) return { data: first.data.products, error: null };
    if (total > 10_200) return { data: null, error: new Error('Product catalogue exceeds the supported page range.') };

    const offsets = Array.from({ length: Math.ceil(total / limit) - 1 }, (_, index) => (index + 1) * limit);
    const pages = await Promise.all(offsets.map((offset) => getProducts({ ...filters, limit, offset }, options)));
    const failed = pages.find((result) => result.error || !result.data);
    if (failed) return { data: null, error: failed.error };
    return {
      data: [first, ...pages].flatMap((result) => result.data?.products || []),
      error: null,
    };
  };
  return load();
}

export async function getAllAvailableProducts(
  filters: Omit<ProductFilters, 'limit' | 'offset'> = {},
  options: RequestOptions = {},
): Promise<ApiResult<Product[]>> {
  const limit = 200;
  const first = await getAvailableProducts({ ...filters, limit, offset: 0 }, options);
  if (first.error || !first.data) return { data: null, error: first.error };
  const total = first.data.pagination.total;
  if (typeof total !== 'number' || total <= limit) return { data: first.data.products, error: null };
  if (total > 10_200) return { data: null, error: new Error('Product catalogue exceeds the supported page range.') };

  const offsets = Array.from({ length: Math.ceil(total / limit) - 1 }, (_, index) => (index + 1) * limit);
  const pages = await Promise.all(offsets.map((offset) => getAvailableProducts({ ...filters, limit, offset }, options)));
  const failed = pages.find((result) => result.error || !result.data);
  if (failed) return { data: null, error: failed.error };
  return { data: [first, ...pages].flatMap((result) => result.data?.products || []), error: null };
}

export async function getProductById(
  productId: string,
  options: RequestOptions = {},
): Promise<ApiResult<Product>> {
  if (!productId) return { data: null, error: new Error('Product ID is required.') };
  const result = await fetchProductById(productId, options);
  if (result.error || !result.data) return { data: null, error: result.error };
  const product = mapProductRecord(result.data);
  if (!product) return { data: null, error: new Error('The product service returned invalid product data.') };
  if (!isOrderableProduct(product)) {
    return { data: null, error: new Error('Product is unavailable.') };
  }
  return { data: product, error: null };
}

// Compatibility names used by the current UI.
export const getMenuCategories = getCategories;
export const getMenuProducts = getProducts;
export const subscribeToCatalog = subscribeToCatalogChanges;
