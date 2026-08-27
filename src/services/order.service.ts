import {
  appendOrderItems as appendPersistedOrderItems,
  createOrderBillSplit as createPersistedOrderBillSplit,
  fetchOrder,
  fetchOrderBills,
  fetchUnpaidOrders,
  insertOrder,
  insertOrderDraft,
  patchOrderStatus,
  replaceOrderDraftItems,
  submitOrderDraft,
  subscribeToOrderChanges,
  updateTakeawayPackaging,
  type PersistedOrderInput,
} from '../repositories/order.repository';
import type { ApiResult, RequestOptions } from '../types/api';
import type { CreateOrderInput, Order, OrderItemRecord, OrderRecord } from '../types/order';

const paymentMethods = new Set(['CASH', 'CARD', 'QR', 'EWALLET']);
const diningModes = new Set(['dine-in', 'takeaway']);

function buildOrderItems(cart: CreateOrderInput['cart']): PersistedOrderInput['items'] {
  if (!Array.isArray(cart) || cart.length === 0) throw new Error('The cart is empty.');
  return cart.map((item, index) => {
    const productId = item.dish?.id;
    if (!productId) throw new Error(`Cart item ${index + 1} has no product ID.`);
    if (item.dish?.isActive !== true || item.dish?.isAvailable !== true) {
      throw new Error(`Cart item ${index + 1} is unavailable.`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error(`Cart item ${index + 1} has an invalid quantity.`);
    }
    return {
      productId,
      quantity: item.quantity,
      optionIds: (item.selectedOptions || []).map((option) => option.id),
      specialRequest: String(item.specialRequest || '').trim().slice(0, 1000),
      serviceMode: item.serviceMode || 'DINE_IN',
    };
  });
}

function buildCreateOrderInput(input: CreateOrderInput): PersistedOrderInput {
  const { cart, paymentMethod, diningMode, tableId, idempotencyKey } = input;
  const method = String(paymentMethod || '').toUpperCase();
  if (!paymentMethods.has(method)) throw new Error('The selected payment method is unsupported.');
  if (!diningModes.has(diningMode)) throw new Error('The dining mode is invalid.');
  if (diningMode === 'dine-in' && !tableId) {
    throw new Error('Select an available table before checkout.');
  }

  return {
    items: buildOrderItems(cart),
    paymentMethod: method,
    diningMode,
    tableId: diningMode === 'dine-in' ? tableId || null : null,
    idempotencyKey: idempotencyKey || null,
  };
}

export function addItemsToOrder(
  orderId: string,
  cart: CreateOrderInput['cart'],
  idempotencyKey = crypto.randomUUID(),
): Promise<ApiResult<OrderRecord>> {
  try {
    if (!orderId) throw new Error('Order ID is required.');
    return appendPersistedOrderItems(orderId, {
      items: buildOrderItems(cart),
      idempotencyKey,
    });
  } catch (error) {
    return Promise.resolve({
      data: null,
      error: error instanceof Error ? error : new Error('Unable to add items to the order.'),
    });
  }
}

type BatchIdentity = { batchNo: number; batchNumber: string };

function mapOrderItem(item: OrderItemRecord, batchIdentities = new Map<string, BatchIdentity>()): Order['items'][number] {
  const batch = item.batch_id ? batchIdentities.get(item.batch_id) : undefined;
  return {
    id: item.id,
    productId: item.product_id,
    name: item.product_name_snapshot,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price || 0),
    subtotal: Number(item.subtotal || 0),
    specialRequest: item.special_request || '',
    batchId: item.batch_id || null,
    batchNo: batch?.batchNo || null,
    batchNumber: batch?.batchNumber || null,
    sentAt: item.sent_at || null,
    serviceMode: item.service_mode || 'DINE_IN',
    itemStatus: item.item_status || 'SUBMITTED',
    options: (item.order_item_options || []).map((option) => ({
      id: option.product_option_id || option.id,
      name: option.option_name,
      groupName: option.option_group_name,
      priceAdjustment: Number(option.price_adjustment || 0),
    })),
  };
}

export function createOrderDraft(diningMode: 'dine-in' | 'takeaway', tableId: string | null, idempotencyKey: string) {
  return insertOrderDraft({ diningMode, tableId: diningMode === 'dine-in' ? tableId : null, idempotencyKey });
}

export function saveOrderDraftItems(orderId: string, cart: CreateOrderInput['cart'], expectedVersion: number) {
  try {
    const items = cart.length ? buildOrderItems(cart) : [];
    return replaceOrderDraftItems(orderId, items, expectedVersion);
  } catch (error) {
    return Promise.resolve({ data: null, error: error instanceof Error ? error : new Error('Unable to save draft items.') });
  }
}

export function submitOrder(orderId: string, idempotencyKey: string) {
  return submitOrderDraft(orderId, idempotencyKey);
}

export function saveTakeawayPackaging(orderId: string, packaging: string[]) {
  return updateTakeawayPackaging(orderId, packaging);
}

export function getOrderBills(orderId: string) {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return fetchOrderBills(orderId);
}

export function createEqualOrderSplit(orderId: string, billCount: number) {
  if (!orderId || !Number.isInteger(billCount) || billCount < 2 || billCount > 10) {
    return Promise.resolve({ data: null, error: new Error('Equal split details are invalid.') });
  }
  return createPersistedOrderBillSplit(orderId, { mode: 'EQUAL', billCount });
}

export function mapOrder(order: OrderRecord): Order {
  const batchIdentities = new Map(
    (order.order_item_batches || []).map((batch) => [batch.id, {
      batchNo: batch.batch_no,
      batchNumber: batch.batch_number || '',
    }]),
  );
  const payment = order.payments?.find(({ status }) => status === 'PAID') || order.payments?.[0];
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    diningMode: order.dining_mode,
    createdAt: order.created_at,
    draftVersion: Number(order.draft_version || 0),
    subtotal: Number(order.subtotal || 0),
    tax: Number(order.tax || 0),
    serviceCharge: Number(order.service_charge || 0),
    taxName: order.tax_name || 'Tax',
    taxRate: Number(order.tax_rate || 0),
    taxMode: order.tax_mode || 'EXCLUSIVE',
    serviceChargeName: order.service_charge_name || 'Service Charge',
    serviceChargeRate: Number(order.service_charge_rate || 0),
    currencyCode: order.currency_code || 'MYR',
    rounding: Number(order.rounding || 0),
    discount: Number(order.discount || 0),
    total: Number(order.total || 0),
    takeawayPackaging: order.takeaway_packaging || [],
    staffName: order.staff?.name || '',
    paymentId: payment?.id || null,
    paymentNumber: payment?.payment_number || null,
    payments: (order.payments || []).map((entry) => ({
      id: entry.id,
      paymentNumber: entry.payment_number || null,
      paymentMethod: entry.payment_method || '',
      amount: Number(entry.amount || 0),
      receivedAmount: entry.received_amount == null ? null : Number(entry.received_amount),
      changeAmount: entry.change_amount == null ? null : Number(entry.change_amount),
      splitType: entry.split_type || 'FULL',
      status: entry.status || '',
      paidAt: entry.paid_at || null,
      cashierName: entry.cashier?.name || '',
    })),
    table: order.restaurant_tables ? {
      id: order.restaurant_tables.id,
      tableNumber: order.restaurant_tables.table_number,
      tableName: order.restaurant_tables.table_name,
      area: order.restaurant_tables.area,
    } : null,
    items: (order.order_items || []).map((item) => mapOrderItem(item, batchIdentities)),
    statusHistory: (order.statusHistory || []).map((entry) => ({
      id: entry.id,
      previousStatus: entry.previous_status,
      newStatus: entry.new_status,
      changedAt: entry.changed_at,
      notes: entry.notes || '',
    })),
  };
}

export async function getUnpaidOrders(options: RequestOptions = {}): Promise<ApiResult<Order[]>> {
  const result = await fetchUnpaidOrders(options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: result.data.map(mapOrder), error: null };
}

export function createOrder(input: CreateOrderInput): Promise<ApiResult<OrderRecord>> {
  try {
    return insertOrder(buildCreateOrderInput(input));
  } catch (error) {
    return Promise.resolve({
      data: null,
      error: error instanceof Error ? error : new Error('Unable to create order.'),
    });
  }
}

export async function getOrder(orderId: string, options: RequestOptions = {}): Promise<ApiResult<Order>> {
  const result = await fetchOrder(orderId, options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: mapOrder(result.data), error: null };
}

export function cancelOrder(orderId: string, notes = '') {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return patchOrderStatus(orderId, { status: 'CANCELLED', notes: String(notes).slice(0, 1000) });
}

export function subscribeToOrder(
  orderId: string,
  onChange: (order: OrderRecord) => void,
  onStatus?: (status: string) => void,
) {
  return subscribeToOrderChanges(orderId, (payload) => onChange(payload.new), onStatus);
}
