import type { Product, ProductRecord } from '../types/product';

function normalizedProductStatus(product: ProductRecord): boolean {
  if (typeof product.status === 'boolean') return product.status;
  if (typeof product.isActive === 'boolean') return product.isActive;
  if (typeof product.isAvailable === 'boolean') return product.isAvailable;
  // The Product Function endpoint is active-only. Legacy versions omitted
  // availability flags even though the repository had already filtered rows.
  return true;
}

export function mapProductRecord(product: ProductRecord): Product | null {
  const price = Number(product.price);
  if (!product.id || !product.name || !Number.isFinite(price) || price < 0) return null;
  const status = normalizedProductStatus(product);
  return {
    ...product,
    price,
    description: product.description || '',
    optionGroups: Array.isArray(product.optionGroups) ? product.optionGroups : [],
    imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : '',
    isActive: product.isActive ?? status,
    isAvailable: product.isAvailable ?? status,
  };
}

export function isOrderableProduct(product: Product): boolean {
  return product.isActive && product.isAvailable;
}
