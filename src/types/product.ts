export interface ProductOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelection: number;
  maxSelection: number;
  sortOrder: number;
  options: ProductOption[];
}

export interface ProductRecord {
  id: string;
  name: string;
  price: number | string;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string;
  unit?: string;
  /** Current API field. Optional while older deployed functions are upgraded. */
  isActive?: boolean;
  /** Current API field. Optional while older deployed functions are upgraded. */
  isAvailable?: boolean;
  /** Authoritative products.status value when returned by the transport. */
  status?: boolean;
  imageUrl?: string;
  optionGroups?: ProductOptionGroup[];
  [key: string]: unknown;
}

export interface Product extends Omit<ProductRecord, 'price' | 'description' | 'optionGroups'> {
  price: number;
  description: string;
  optionGroups: ProductOptionGroup[];
  isActive: boolean;
  isAvailable: boolean;
  imageUrl: string;
}

export interface ProductFilters {
  categoryId?: string | null;
  search?: string;
  limit?: number;
  offset?: number;
  availableOnly?: boolean;
}

export interface ProductPage<TProduct = ProductRecord> {
  products: TProduct[];
  pagination: {
    limit: number;
    offset: number;
    total?: number;
  };
}
