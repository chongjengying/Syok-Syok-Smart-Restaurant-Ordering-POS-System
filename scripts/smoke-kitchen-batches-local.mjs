import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function request(path, { method = 'GET', key = anonKey, token = key, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const [category] = await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Batch ${suffix}` },
});
const products = await request('/rest/v1/products', {
  method: 'POST', key: serviceKey, body: [
    { category_id: category.id, product_name: `Chicken Rice ${suffix}`, cost_price: 5, sell_price: 12, status: true },
    { category_id: category.id, product_name: `Milo ${suffix}`, cost_price: 1, sell_price: 3.5, status: true },
  ],
});
const tables = await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey, body: [
    { table_number: `B-${suffix}`, capacity: 4, area: 'Batch Test', status: 'AVAILABLE', is_active: true },
    { table_number: `C-${suffix}`, capacity: 4, area: 'Concurrency Test', status: 'AVAILABLE', is_active: true },
  ],
});
const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `batch-${suffix}@example.com`, password: `Batch-${suffix}-Pass!`, data: { full_name: 'Kitchen Batch Admin' } },
});
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN', status: 'ACTIVE' },
});
const orderRequest = (path = '', options = {}) => request(`/functions/v1/orders${path}`, {
  ...options, token: auth.access_token,
});

async function createDineIn(table, key) {
  return (await orderRequest('', {
    method: 'POST',
    body: {
      items: [{ productId: products[0].id, quantity: 1, optionIds: [], specialRequest: 'No chili', serviceMode: 'DINE_IN' }],
      paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id, idempotencyKey: key,
    },
  })).data;
}

const order = await createDineIn(tables[0], `initial-${suffix}`);
let batches = await request(
  `/rest/v1/order_item_batches?order_id=eq.${order.id}&select=id,batch_no,status&order=batch_no`,
  { key: serviceKey },
);
assert.deepEqual(batches.map(({ batch_no, status: batchStatus }) => [batch_no, batchStatus]), [[1, 'PENDING']]);

await orderRequest(`/${order.id}/batches/${batches[0].id}/start`, { method: 'POST', body: {} });
await orderRequest(`/${order.id}/batches/${batches[0].id}/ready`, { method: 'POST', body: {} });

const addOnBody = {
  items: [{ productId: products[1].id, quantity: 1, optionIds: [], specialRequest: 'Less ice', serviceMode: 'DINE_IN' }],
  idempotencyKey: `addon-${suffix}`,
};
const duplicateSend = await Promise.all([
  orderRequest(`/${order.id}/items`, { method: 'POST', body: addOnBody }),
  orderRequest(`/${order.id}/items`, { method: 'POST', body: addOnBody }),
]);
assert.equal(duplicateSend[0].data.batch_id, duplicateSend[1].data.batch_id, 'Duplicate send created different batches');

batches = await request(
  `/rest/v1/order_item_batches?order_id=eq.${order.id}&select=id,batch_no,status&order=batch_no`,
  { key: serviceKey },
);
assert.deepEqual(batches.map(({ batch_no }) => batch_no), [1, 2]);
assert.equal(batches[1].status, 'PENDING');

const queue = (await orderRequest()).data.find(({ id }) => id === order.id);
assert.ok(queue, 'Order with a pending add-on batch was absent from the kitchen queue');
const batchTwoItems = queue.order_items.filter(({ batch_id }) => batch_id === batches[1].id);
assert.equal(batchTwoItems.length, 1, 'Batch 2 did not contain only the new add-on item');
assert.equal(batchTwoItems[0].product_id, products[1].id, 'Batch 2 resent a prior product');

await orderRequest(`/${order.id}/batches/${batches[1].id}/start`, { method: 'POST', body: {} });
let itemStatuses = await request(
  `/rest/v1/order_items?order_id=eq.${order.id}&select=batch_id,item_status&order=created_at`,
  { key: serviceKey },
);
assert.deepEqual(itemStatuses.map(({ item_status }) => item_status), ['READY', 'PREPARING'], 'Starting Batch 2 changed Batch 1 items');
await orderRequest(`/${order.id}/batches/${batches[1].id}/ready`, { method: 'POST', body: {} });
await orderRequest(`/${order.id}/serve`, { method: 'POST', body: {} });

const [combinedBill] = await request(
  `/rest/v1/orders?id=eq.${order.id}&select=id,status,payment_status,total,order_items(id,product_id,quantity,unit_price,batch_id,item_status)`,
  { key: serviceKey },
);
assert.equal(combinedBill.order_items.length, 2, 'The final bill did not contain both batches');
assert.equal(combinedBill.status, 'SERVED');
assert.ok(combinedBill.order_items.every(({ item_status }) => item_status === 'SERVED'));

await request('/functions/v1/payments', {
  method: 'POST', token: auth.access_token,
  body: {
    orderId: order.id, paymentMethod: 'CASH', finalAmount: Number(combinedBill.total),
    receivedAmount: 100, idempotencyKey: `payment-${suffix}`,
  },
});
const [paidOrder] = await request(`/rest/v1/orders?id=eq.${order.id}&select=status,payment_status`, { key: serviceKey });
const [cleaningTable] = await request(`/rest/v1/restaurant_tables?id=eq.${tables[0].id}&select=status`, { key: serviceKey });
assert.deepEqual(paidOrder, { status: 'COMPLETED', payment_status: 'PAID' });
assert.equal(cleaningTable.status, 'CLEANING');

// The per-order lock plus unique(order_id, batch_no) protects simultaneous
// submissions with different request keys from allocating the same number.
const concurrentOrder = await createDineIn(tables[1], `concurrent-initial-${suffix}`);
await Promise.all([
  orderRequest(`/${concurrentOrder.id}/items`, { method: 'POST', body: { ...addOnBody, idempotencyKey: `device-a-${suffix}` } }),
  orderRequest(`/${concurrentOrder.id}/items`, { method: 'POST', body: { ...addOnBody, idempotencyKey: `device-b-${suffix}` } }),
]);
const concurrentBatches = await request(
  `/rest/v1/order_item_batches?order_id=eq.${concurrentOrder.id}&select=batch_no&order=batch_no`,
  { key: serviceKey },
);
assert.deepEqual(concurrentBatches.map(({ batch_no }) => batch_no), [1, 2, 3]);

console.log(JSON.stringify({
  oneActiveBill: true,
  kitchenBatches: [1, 2],
  addOnItemsOnly: true,
  batchSpecificLifecycle: true,
  duplicateSendProtected: true,
  concurrentBatchNumbers: [1, 2, 3],
  combinedPayment: true,
  tableAfterServe: cleaningTable.status,
}));
