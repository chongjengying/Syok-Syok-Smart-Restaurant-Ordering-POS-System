import { fetchReadyToServeOrders, servePersistedOrder } from '../repositories/order.repository';
import { mapKitchenOrder, type KitchenOrder } from './kitchen.service';
import type { RequestOptions } from '../types/api';

export async function getReadyToServeOrders(options: RequestOptions = {}) {
  const result = await fetchReadyToServeOrders(options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return {
    data: result.data.map(mapKitchenOrder),
    error: null,
  } as { data: KitchenOrder[]; error: null };
}

export function serveReadyOrder(orderId: string) {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return servePersistedOrder(orderId);
}
