import { apiRequest } from '../infrastructure/supabase/functionsClient';
import { supabase } from '../infrastructure/supabase/client';
import type { ApiResult, RequestOptions } from '../types/api';
import type { OrderRecord } from '../types/order';

export interface PersistedOrderInput {
  items: Array<{
    productId: string;
    quantity: number;
    optionIds: string[];
    specialRequest: string;
    serviceMode: 'DINE_IN' | 'TAKEAWAY';
  }>;
  paymentMethod: string;
  diningMode: string;
  tableId: string | null;
  idempotencyKey: string | null;
}

export function insertOrder(input: PersistedOrderInput) {
  return apiRequest('orders', { method: 'POST', body: input }) as Promise<ApiResult<OrderRecord>>;
}

export function insertOrderDraft(input: { diningMode: string; tableId: string | null; idempotencyKey: string }) {
  return apiRequest('orders', { method: 'POST', body: { ...input, draft: true } }) as Promise<ApiResult<{ id: string; payment_id: string }>>;
}

export function replaceOrderDraftItems(orderId: string, items: PersistedOrderInput['items'], expectedVersion: number) {
  return apiRequest('orders', { method: 'POST', path: `${orderId}/draft-items`, body: { items, expectedVersion } }) as Promise<ApiResult<OrderRecord>>;
}

export function submitOrderDraft(orderId: string, idempotencyKey: string) {
  return apiRequest('orders', { method: 'POST', path: `${orderId}/submit`, body: { idempotencyKey } }) as Promise<ApiResult<OrderRecord>>;
}

export function updateTakeawayPackaging(orderId: string, packaging: string[]) {
  return apiRequest('orders', {
    method: 'POST',
    path: `${orderId}/takeaway-packaging`,
    body: { packaging },
  }) as Promise<ApiResult<OrderRecord>>;
}

export function appendOrderItems(
  orderId: string,
  input: { items: PersistedOrderInput['items']; idempotencyKey: string },
) {
  return apiRequest('orders', {
    method: 'POST',
    path: `${orderId}/items`,
    body: input,
  }) as Promise<ApiResult<OrderRecord>>;
}

export function fetchOrder(orderId: string, { signal }: RequestOptions = {}) {
  return apiRequest('orders', { path: orderId, signal }) as Promise<ApiResult<OrderRecord>>;
}

export function fetchOrderBills(orderId: string) {
  return apiRequest('orders', { path: `${orderId}/bills` }) as Promise<ApiResult<Array<Record<string, unknown>>>>;
}

export function createOrderBillSplit(orderId: string, input: { mode: 'EQUAL' | 'ITEM'; billCount?: number; assignments?: Array<{ itemIds: string[] }> }) {
  return apiRequest('orders', { method: 'POST', path: `${orderId}/bills`, body: input }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function fetchOrders({ signal }: RequestOptions = {}) {
  return apiRequest('orders', { signal }) as Promise<ApiResult<OrderRecord[]>>;
}

export function fetchReadyToServeOrders({ signal }: RequestOptions = {}) {
  return apiRequest('orders', { query: { scope: 'ready-to-serve' }, signal }) as Promise<ApiResult<OrderRecord[]>>;
}

export function fetchUnpaidOrders({ signal }: RequestOptions = {}) {
  return apiRequest('orders', { query: { scope: 'unpaid' }, signal }) as Promise<ApiResult<OrderRecord[]>>;
}

export function patchOrderStatus(orderId: string, input: { status: string; notes?: string }) {
  return apiRequest('orders', { method: 'PATCH', path: orderId, body: input }) as Promise<ApiResult<OrderRecord>>;
}

export function startPersistedKitchenOrder(orderId: string) {
  return apiRequest('orders', { method: 'POST', path: `${orderId}/start`, body: {} }) as Promise<ApiResult<OrderRecord>>;
}

export function updatePersistedKitchenBatch(
  orderId: string,
  batchId: string,
  action: 'start' | 'ready',
) {
  return apiRequest('orders', {
    method: 'POST',
    path: `${orderId}/batches/${batchId}/${action}`,
    body: {},
  }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function servePersistedOrder(orderId: string) {
  return apiRequest('orders', { method: 'POST', path: `${orderId}/serve`, body: {} }) as Promise<ApiResult<OrderRecord>>;
}

export function subscribeToOrderChanges(
  orderId: string,
  onChange: (payload: { new: OrderRecord }) => void,
  onStatus?: (status: string) => void,
) {
  const channel = supabase
    .channel(`order-${orderId}-${crypto.randomUUID()}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${orderId}` },
      () => onChange({ new: {} as OrderRecord }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'order_item_batches', filter: `order_id=eq.${orderId}` },
      () => onChange({ new: {} as OrderRecord }),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${orderId}` },
      () => onChange({ new: {} as OrderRecord }),
    )
    .subscribe((status) => onStatus?.(status));

  return () => { void supabase.removeChannel(channel); };
}

export function subscribeToKitchenChanges(
  onChange: (payload: unknown) => void,
  onStatus?: (status: string) => void,
) {
  const channel = supabase
    .channel(`kitchen-queue-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item_batches' }, onChange)
    .subscribe((status) => onStatus?.(status));

  return () => { void supabase.removeChannel(channel); };
}
