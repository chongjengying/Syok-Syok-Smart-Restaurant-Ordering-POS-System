import type { CartItem } from './cart';

export type DiningMode = 'dine-in' | 'takeaway';
export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface OrderItemOptionRecord {
  id: string;
  option_name: string;
  option_group_name: string;
  price_adjustment?: number | string;
  product_option_id?: string | null;
}

export interface OrderItemRecord {
  id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number | string;
  subtotal: number | string;
  special_request?: string | null;
  batch_id?: string | null;
  sent_at?: string;
  service_mode?: 'DINE_IN' | 'TAKEAWAY';
  item_status?: string;
  products?: {
    id: string;
    product_name: string;
  } | null;
  order_item_options?: OrderItemOptionRecord[];
}

export interface OrderItemBatchRecord {
  id: string;
  order_id: string;
  batch_number?: string;
  batch_no: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  created_at: string;
  draft_version?: number;
  started_at?: string | null;
  ready_at?: string | null;
  served_at?: string | null;
}

export interface OrderRecord {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  dining_mode: DiningMode;
  created_at: string;
  kitchen_started_at?: string | null;
  subtotal: number | string;
  tax: number | string;
  service_charge: number | string;
  tax_name?: string;
  tax_rate?: number | string;
  tax_mode?: 'INCLUSIVE' | 'EXCLUSIVE';
  service_charge_name?: string;
  service_charge_rate?: number | string;
  currency_code?: string;
  rounding?: number | string;
  discount: number | string;
  total: number | string;
  takeaway_packaging?: string[];
  staff?: { name?: string | null } | null;
  payments?: Array<{
    id: string;
    payment_number?: string;
    payment_method?: string;
    amount?: number | string;
    received_amount?: number | string | null;
    change_amount?: number | string | null;
    split_type?: string;
    status?: string;
    paid_at?: string | null;
    created_at?: string;
    cashier?: { name?: string | null } | null;
  }>;
  restaurant_tables?: {
    id: string;
    table_number: string;
    table_name: string | null;
    area: string | null;
  } | null;
  order_item_batches?: OrderItemBatchRecord[];
  order_items?: OrderItemRecord[];
  statusHistory?: Array<{
    id: string;
    previous_status: string | null;
    new_status: string;
    changed_at: string;
    notes?: string | null;
  }>;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialRequest: string;
  batchId: string | null;
  batchNo: number | null;
  batchNumber: string | null;
  sentAt: string | null;
  serviceMode: 'DINE_IN' | 'TAKEAWAY';
  itemStatus: string;
  options: Array<{
    id: string;
    name: string;
    groupName: string;
    priceAdjustment: number;
  }>;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  diningMode: DiningMode;
  createdAt: string;
  draftVersion: number;
  subtotal: number;
  tax: number;
  serviceCharge: number;
  taxName: string;
  taxRate: number;
  taxMode: 'INCLUSIVE' | 'EXCLUSIVE';
  serviceChargeName: string;
  serviceChargeRate: number;
  currencyCode: string;
  rounding: number;
  discount: number;
  total: number;
  takeawayPackaging: string[];
  staffName: string;
  paymentId: string | null;
  paymentNumber: string | null;
  payments: Array<{
    id: string;
    paymentNumber: string | null;
    paymentMethod: string;
    amount: number;
    receivedAmount: number | null;
    changeAmount: number | null;
    splitType: string;
    status: string;
    paidAt: string | null;
    cashierName: string;
  }>;
  table: {
    id: string;
    tableNumber: string;
    tableName: string | null;
    area: string | null;
  } | null;
  items: OrderItem[];
  statusHistory: Array<{
    id: string;
    previousStatus: string | null;
    newStatus: string;
    changedAt: string;
    notes: string;
  }>;
}

export interface CreateOrderInput {
  cart: CartItem[];
  paymentMethod: string;
  diningMode: DiningMode;
  tableId?: string | null;
  idempotencyKey?: string | null;
}
