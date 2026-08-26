import { ProductRepository, type ProductFilters } from '../repositories/productRepository.ts';

type ProductRow = {
  id: string;
  product_code: string;
  category_id: string;
  product_name: string;
  description: string | null;
  unit: string | null;
  sell_price: number | string;
  status: boolean;
  is_available: boolean;
  image_path: string | null;
  categories?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

type ProductOptionRow = {
  id: string;
  name: string;
  price_adjustment: number | string;
  is_available: boolean;
  sort_order: number;
};

type OptionGroupRow = {
  id: string;
  product_id: string;
  name: string;
  selection_type: 'SINGLE' | 'MULTIPLE';
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  sort_order: number;
  product_options: ProductOptionRow[];
};

function categoryName(product: ProductRow) {
  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  return category?.name || '';
}

export class ProductService {
  constructor(private readonly repository: ProductRepository) {}

  async getProducts(filters: ProductFilters) {
    const result = await this.repository.findActive(filters);
    if (result.error) return { data: null, error: result.error };

    const mapped = await this.attachOptions(result.data as ProductRow[]);
    if (mapped.error) return mapped;
    return {
      data: {
        products: mapped.data,
        pagination: {
          total: result.count || 0,
          limit: filters.limit,
          offset: filters.offset,
        },
      },
      error: null,
    };
  }

  async getProduct(productId: string) {
    const result = await this.repository.findActiveById(productId);
    if (result.error) return { data: null, error: result.error };
    if (!result.data) return { data: null, error: null };

    const mapped = await this.attachOptions([result.data as ProductRow]);
    if (mapped.error) return mapped;
    return { data: mapped.data?.[0] || null, error: null };
  }

  private async attachOptions(products: ProductRow[]) {
    const groupsResult = await this.repository.findOptionGroups(products.map(({ id }) => id));
    if (groupsResult.error) return { data: null, error: groupsResult.error };

    const groupsByProduct = new Map<string, Array<Record<string, unknown>>>();
    for (const group of groupsResult.data as OptionGroupRow[]) {
      const options = (group.product_options || [])
        .filter(({ is_available }) => is_available)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((option) => ({
          id: option.id,
          name: option.name,
          priceAdjustment: Number(option.price_adjustment),
        }));
      const mapped = {
        id: group.id,
        name: group.name,
        selectionType: group.selection_type,
        isRequired: group.is_required,
        minSelection: group.min_selection,
        maxSelection: group.max_selection,
        sortOrder: group.sort_order,
        options,
      };
      groupsByProduct.set(group.product_id, [...(groupsByProduct.get(group.product_id) || []), mapped]);
    }

    return {
      data: products.map((product) => ({
        id: product.id,
        code: product.product_code,
        categoryId: product.category_id,
        categoryName: categoryName(product),
        name: product.product_name,
        description: product.description || '',
        unit: product.unit || '',
        price: Number(product.sell_price),
        isActive: product.status,
        isAvailable: product.is_available,
        imagePath: product.image_path || null,
        optionGroups: groupsByProduct.get(product.id) || [],
      })),
      error: null,
    };
  }
}
