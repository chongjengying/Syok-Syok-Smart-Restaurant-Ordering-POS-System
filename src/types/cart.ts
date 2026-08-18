import type { Product, ProductOption } from './product';

export interface SelectedProductOption extends ProductOption {
  groupId: string;
  groupName: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
}

export interface CartPortion extends SelectedProductOption {
  priceDelta: number;
}

export interface CartAddOn extends SelectedProductOption {
  price: number;
}

export interface CartItem {
  /** Product snapshot used to render the application-state cart. */
  dish: Product;
  selectedOptions: SelectedProductOption[];
  portion: CartPortion | null;
  selectedAddOns: CartAddOn[];
  /** Kitchen note preview. The backend applies the same 1,000-character cap. */
  specialRequest: string;
  quantity: number;
  serviceMode?: 'DINE_IN' | 'TAKEAWAY';
  /** UI preview only. PostgreSQL recalculates the authoritative unit price. */
  finalPrice: number;
}

export interface CartPreviewTotals {
  readonly subtotal: number;
  readonly tax: number;
  readonly serviceCharge: number;
  readonly total: number;
}
