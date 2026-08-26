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
  code?: string;
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
  imagePath?: string | null;
  /** Legacy transport field retained while older Edge Functions are upgraded. */
  imageUrl?: string;
  optionGroups?: ProductOptionGroup[];
  [key: string]: unknown;
}

export interface Product extends Omit<ProductRecord, 'price' | 'description' | 'optionGroups'> {
  code: string;
  price: number;
  description: string;
  optionGroups: ProductOptionGroup[];
  isActive: boolean;
  isAvailable: boolean;
  imageUrl: string;
  imagePath: string | null;
}

export interface ManagedProduct {
  id: string;
  code: string;
  categoryId: string;
  name: string;
  description: string;
  unit: string;
  price: number;
  cost: number;
  isActive: boolean;
  isAvailable: boolean;
  imagePath: string | null;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductManagementInput {
  categoryId: string;
  name: string;
  description?: string;
  unit?: string;
  price: number;
  cost: number;
  isActive: boolean;
  isAvailable: boolean;
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
