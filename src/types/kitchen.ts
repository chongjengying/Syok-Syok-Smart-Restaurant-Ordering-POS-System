import type { DiningMode } from './order';

export type KitchenQueueStatus = 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED';
export type KitchenItemStatus = 'SUBMITTED' | 'PREPARING' | 'READY' | 'SERVED';
export type KitchenBatchStatus = 'PENDING' | 'PREPARING' | 'READY';

export interface KitchenOrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  specialRequest: string;
  isAddOn: boolean;
  sentAt: string | null;
  serviceMode: 'DINE_IN' | 'TAKEAWAY';
  itemStatus: KitchenItemStatus;
  options: Array<{ id: string; groupName: string; name: string }>;
}

export interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: KitchenQueueStatus;
  paymentStatus: string;
  diningMode: DiningMode;
  createdAt: string;
  kitchenStartedAt: string | null;
  tableNumber: string | null;
  takeawayPackaging: string[];
  items: KitchenOrderItem[];
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  orderNumber: string;
  orderStatus: KitchenQueueStatus;
  batchNo: number;
  batchNumber: string;
  status: KitchenBatchStatus;
  isAddOn: boolean;
  paymentStatus: string;
  diningMode: DiningMode;
  createdAt: string;
  startedAt: string | null;
  tableNumber: string | null;
  takeawayPackaging: string[];
  items: KitchenOrderItem[];
}
