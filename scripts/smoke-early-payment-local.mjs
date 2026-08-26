import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function request(path, { method = 'GET', key = anonKey, token = key, body, allowError = false } = {}) {
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
  if (!response.ok && !allowError) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { status: response.status, payload };
}

const suffix = crypto.randomUUID().slice(0, 8);
const [category] = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Early Payment ${suffix}` },
})).payload;
const [product] = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Early Meal ${suffix}`, cost_price: 4, sell_price: 15, status: true },
})).payload;
const [table] = (await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey,
  body: { table_number: `EP-${suffix}`, capacity: 4, area: 'Early Payment Test', status: 'AVAILABLE', is_active: true },
})).payload;
const auth = (await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `early-${suffix}@example.com`, password: `Early-${suffix}-Pass!`, data: { full_name: 'Early Payment Admin' } },
})).payload;
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN', status: 'ACTIVE' },
});

const orderRequest = (path = '', options = {}) => request(`/functions/v1/orders${path}`, {
  ...options, token: auth.access_token,
});
const paymentRequest = (order, key) => request('/functions/v1/payments', {
  method: 'POST', token: auth.access_token,
  body: {
    orderId: order.id,
    paymentMethod: 'CASH',
    finalAmount: Number(order.total),
    receivedAmount: 100,
    idempotencyKey: key,
  },
});

async function createOrder(diningMode, tableId, key) {
  return (await orderRequest('', {
    method: 'POST',
    body: {
      items: [{
        productId: product.id, quantity: 1, optionIds: [], specialRequest: '',
        serviceMode: diningMode === 'dine-in' ? 'DINE_IN' : 'TAKEAWAY',
      }],
      paymentMethod: 'CASH', diningMode, tableId, idempotencyKey: key,
    },
  })).payload.data;
}

const confirmedOrder = await createOrder('dine-in', table.id, `confirmed-${suffix}`);
let detail = (await orderRequest(`/${confirmedOrder.id}`)).payload.data;
const confirmedBatch = detail.order_item_batches[0];
assert.equal(detail.status, 'CONFIRMED');

await paymentRequest(detail, `pay-confirmed-${suffix}`);
let [persisted] = (await request(
  `/rest/v1/orders?id=eq.${detail.id}&select=status,payment_status`, { key: serviceKey },
)).payload;
let [persistedTable] = (await request(
  `/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey },
)).payload;
assert.deepEqual(persisted, { status: 'COMPLETED', payment_status: 'PAID' });
assert.equal(persistedTable.status, 'CLEANING', 'Paid dine-in table did not enter cleaning');
let tableView = (await request('/functions/v1/tables', { token: auth.access_token })).payload.data
  .find(({ id }) => id === table.id);
assert.ok(
  tableView.orders.some(({ id, payment_status }) => id === confirmedOrder.id && payment_status === 'PAID'),
  'The paid order disappeared from the table food-progress view',
);

const prematureCleaning = await request(`/functions/v1/tables/${table.id}/complete-cleaning`, {
  method: 'POST', token: auth.access_token, allowError: true,
  body: { operationKey: `premature-cleaning-${suffix}` },
});
assert.equal(prematureCleaning.status, 409, 'Cleaning completed while paid kitchen items were still active');
assert.equal(prematureCleaning.payload.code, 'KITCHEN_ITEMS_NOT_FULFILLED');

const blockedSecondBill = await request('/functions/v1/orders', {
  method: 'POST', token: auth.access_token, allowError: true,
  body: {
    items: [{
      productId: product.id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'DINE_IN',
    }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id,
    idempotencyKey: `blocked-second-bill-${suffix}`,
  },
});
assert.equal(blockedSecondBill.status, 409, 'A new bill claimed a table that was still cleaning');

await orderRequest(`/${confirmedOrder.id}/batches/${confirmedBatch.id}/start`, { method: 'POST', body: {} });
await orderRequest(`/${confirmedOrder.id}/batches/${confirmedBatch.id}/ready`, { method: 'POST', body: {} });
[persisted] = (await request(`/rest/v1/orders?id=eq.${confirmedOrder.id}&select=status,payment_status`, { key: serviceKey })).payload;
assert.deepEqual(persisted, { status: 'COMPLETED', payment_status: 'PAID' }, 'Kitchen actions regressed the completed bill');
const readyQueue = (await orderRequest('?scope=ready-to-serve')).payload.data;
assert.ok(readyQueue.some(({ id }) => id === confirmedOrder.id), 'Paid ready order disappeared from waiter flow');
await orderRequest(`/${confirmedOrder.id}/serve`, { method: 'POST', body: {} });
await request(`/functions/v1/tables/${table.id}/complete-cleaning`, {
  method: 'POST', token: auth.access_token,
  body: { operationKey: `cleaning-complete-${suffix}` },
});
[persistedTable] = (await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey })).payload;
assert.equal(persistedTable.status, 'AVAILABLE', 'Table became available before cleaning completion');

const secondBill = await createOrder('dine-in', table.id, `second-bill-${suffix}`);
assert.notEqual(secondBill.id, confirmedOrder.id, 'New items were appended to the already-paid order');
assert.notEqual(secondBill.order_number, confirmedOrder.order_number, 'The new bill reused the paid order number');
const secondDetail = (await orderRequest(`/${secondBill.id}`)).payload.data;
assert.equal(secondDetail.payment_status, 'UNPAID');
assert.equal(secondDetail.order_items.length, 1);
tableView = (await request('/functions/v1/tables', { token: auth.access_token })).payload.data
  .find(({ id }) => id === table.id);
assert.ok(tableView.orders.some(({ id }) => id === confirmedOrder.id), 'Paid food progress disappeared after a new bill');
assert.ok(tableView.orders.some(({ id }) => id === secondBill.id), 'The current unpaid bill is missing from the table view');

const kitchenQueue = (await orderRequest()).payload.data;
assert.ok(kitchenQueue.some(({ id }) => id === confirmedOrder.id), 'Paid confirmed order disappeared from kitchen');
assert.ok(kitchenQueue.some(({ id }) => id === secondBill.id), 'New same-table bill did not reach kitchen');

[persisted] = (await request(`/rest/v1/orders?id=eq.${confirmedOrder.id}&select=status,payment_status`, { key: serviceKey })).payload;
[persistedTable] = (await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey })).payload;
assert.deepEqual(persisted, { status: 'COMPLETED', payment_status: 'PAID' });
assert.equal(persistedTable.status, 'OCCUPIED', 'Serving the older paid bill disrupted the newer unpaid bill');

const preparingOrder = await createOrder('takeaway', null, `preparing-${suffix}`);
detail = (await orderRequest(`/${preparingOrder.id}`)).payload.data;
const preparingBatch = detail.order_item_batches[0];
await orderRequest(`/${preparingOrder.id}/batches/${preparingBatch.id}/start`, { method: 'POST', body: {} });
detail = (await orderRequest(`/${preparingOrder.id}`)).payload.data;
assert.equal(detail.status, 'PREPARING');
await paymentRequest(detail, `pay-preparing-${suffix}`);
[persisted] = (await request(`/rest/v1/orders?id=eq.${preparingOrder.id}&select=status,payment_status`, { key: serviceKey })).payload;
assert.deepEqual(persisted, { status: 'COMPLETED', payment_status: 'PAID' });
await orderRequest(`/${preparingOrder.id}/batches/${preparingBatch.id}/ready`, { method: 'POST', body: {} });
await orderRequest(`/${preparingOrder.id}/serve`, { method: 'POST', body: {} });
[persisted] = (await request(`/rest/v1/orders?id=eq.${preparingOrder.id}&select=status,payment_status`, { key: serviceKey })).payload;
assert.deepEqual(persisted, { status: 'COMPLETED', payment_status: 'PAID' });

console.log(JSON.stringify({
  payWhenConfirmed: true,
  payWhenPreparing: true,
  kitchenContinuesAfterPayment: true,
  readyToServeIncludesPaid: true,
  billRemainsCompletedDuringFulfillment: true,
  tableEntersCleaningAfterPayment: true,
  cleaningCompletionBlockedDuringFulfillment: true,
  newBillBlockedUntilCleaningComplete: true,
  paidBillRemainsImmutable: true,
  paidFoodProgressVisibleFromTable: true,
}));
