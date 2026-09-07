import type { OrderStatus, PaymentStatus } from './order';

// OUT_OF_SERVICE is kept for compatibility with older deployed database
// migrations. New writes use DISABLED, but reads must still be safe.
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING' | 'DISABLED' | 'OUT_OF_SERVICE';

export interface ActiveTableOrderRecord {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: number | string;
  created_at: string;
  order_items?: Array<{ item_status: string }>;
}

export interface RestaurantTableRecord {
  id: string;
  table_number: string;
  table_name: string | null;
  capacity: number;
  status: TableStatus;
  area: string | null;
  qr_code: string | null;
  is_active: boolean;
  orders?: ActiveTableOrderRecord[];
}

export interface ActiveTableOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  createdAt: string;
  hasUnfulfilledKitchenItems?: boolean;
}

export interface RestaurantTable {
  id: string;
  tableNumber: string;
  tableName: string | null;
  capacity: number;
  status: TableStatus;
  area: string | null;
  qrCode: string | null;
  isActive: boolean;
  activeOrder: ActiveTableOrder | null;
  orders: ActiveTableOrder[];
}

export interface TableFilters {
  branchId?: string;
  status?: TableStatus;
  includeInactive?: boolean;
  signal?: AbortSignal;
}

export interface TableInput {
  branchId?: string;
  tableNumber?: string;
  tableName?: string;
  capacity?: number;
  area?: string;
  isActive?: boolean;
}
