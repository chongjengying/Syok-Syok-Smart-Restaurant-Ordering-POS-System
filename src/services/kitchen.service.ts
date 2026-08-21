import { ORDER_STATUSES } from '../shared/constants';
import {
  fetchOrders,
  patchOrderStatus,
  startPersistedKitchenOrder,
  subscribeToKitchenChanges,
  updatePersistedKitchenBatch,
} from '../repositories/order.repository';
import type { RequestOptions } from '../types/api';
import type { OrderRecord } from '../types/order';
import type { KitchenItemStatus, KitchenOrder, KitchenQueueStatus, KitchenTicket } from '../types/kitchen';

export type { KitchenOrder, KitchenTicket } from '../types/kitchen';

const kitchenStatuses = new Set<string>(ORDER_STATUSES);
export interface KitchenAction {
  kind: 'START' | 'STATUS';
  target: 'PREPARING' | 'READY';
  label: string;
}

export function getKitchenAction(ticket: Pick<KitchenTicket, 'status'>): KitchenAction | null {
  if (ticket.status === 'PENDING') {
    return { kind: 'START', target: 'PREPARING', label: 'START' };
  }
  if (ticket.status === 'PREPARING') return { kind: 'STATUS', target: 'READY', label: 'READY' };
  return null;
}

function mapKitchenItem(order: OrderRecord, item: NonNullable<OrderRecord['order_items']>[number]) {
  return {
    id: item.id,
    productId: item.products?.id || item.product_id,
    name: item.product_name_snapshot || item.products?.product_name || 'Unknown product',
    quantity: item.quantity,
    specialRequest: item.special_request || '',
    isAddOn: false,
    sentAt: item.sent_at || null,
    serviceMode: item.service_mode || (order.dining_mode === 'takeaway' ? 'TAKEAWAY' as const : 'DINE_IN' as const),
    itemStatus: (item.item_status || 'SUBMITTED') as KitchenItemStatus,
    options: (item.order_item_options || []).map((option) => ({
      id: option.id,
      groupName: option.option_group_name,
      name: option.option_name,
    })),
  };
}

export function mapKitchenOrder(order: OrderRecord): KitchenOrder {
  const batchNumbers = new Map(
    (order.order_item_batches || []).map((batch) => [batch.id, batch.batch_no]),
  );
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status as KitchenQueueStatus,
    paymentStatus: order.payment_status,
    diningMode: order.dining_mode,
    createdAt: order.created_at,
    kitchenStartedAt: order.kitchen_started_at || null,
    tableNumber: order.restaurant_tables?.table_number || null,
    takeawayPackaging: order.takeaway_packaging || [],
    items: (order.order_items || []).map((item) => ({
      ...mapKitchenItem(order, item),
      isAddOn: Boolean(item.batch_id && (batchNumbers.get(item.batch_id) || 0) > 1),
    })),
  };
}

export function mapKitchenTickets(order: OrderRecord): KitchenTicket[] {
  const items = order.order_items || [];
  return (order.order_item_batches || [])
    .filter((batch) => ['PENDING', 'PREPARING', 'READY'].includes(batch.status))
    .sort((left, right) => left.batch_no - right.batch_no)
    .map((batch) => ({
      id: batch.id,
      orderId: order.id,
      orderNumber: order.order_number,
      orderStatus: order.status as KitchenQueueStatus,
      batchNo: batch.batch_no,
      batchNumber: batch.batch_number || '',
      status: batch.status as KitchenTicket['status'],
      isAddOn: batch.batch_no > 1,
      paymentStatus: order.payment_status,
      diningMode: order.dining_mode,
      createdAt: batch.created_at,
      startedAt: batch.started_at || null,
      tableNumber: order.restaurant_tables?.table_number || null,
      takeawayPackaging: order.takeaway_packaging || [],
      items: items
        .filter((item) => item.batch_id === batch.id)
        .map((item) => ({ ...mapKitchenItem(order, item), isAddOn: batch.batch_no > 1 })),
    }))
    .filter((ticket) => ticket.items.length > 0);
}

export async function getKitchenQueue(options: RequestOptions = {}) {
  const result = await fetchOrders(options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: result.data.flatMap(mapKitchenTickets), error: null };
}

export function updateOrderStatus(orderId: string, status: string, notes = '') {
  const normalizedStatus = String(status || '').toUpperCase();
  if (!kitchenStatuses.has(normalizedStatus)) {
    return Promise.resolve({ data: null, error: new Error('The requested order status is invalid.') });
  }
  return patchOrderStatus(orderId, normalizedStatus ? {
    status: normalizedStatus,
    notes: String(notes || '').slice(0, 1000),
  } : { status: normalizedStatus });
}

export function startKitchenOrder(orderId: string) {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return startPersistedKitchenOrder(orderId);
}

export function updateKitchenBatch(
  orderId: string,
  batchId: string,
  action: 'start' | 'ready',
) {
  if (!orderId || !batchId) {
    return Promise.resolve({ data: null, error: new Error('Order ID and kitchen batch ID are required.') });
  }
  return updatePersistedKitchenBatch(orderId, batchId, action);
}

export const subscribeToKitchenQueue = subscribeToKitchenChanges;
