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
  method: 'POST', key: serviceKey, body: { name: `Table Add-on ${suffix}` },
});
const products = await request('/rest/v1/products', {
  method: 'POST',
  key: serviceKey,
  body: [
    { category_id: category.id, product_name: `Meal ${suffix}`, cost_price: 5, sell_price: 10, status: true },
    { category_id: category.id, product_name: `Drink ${suffix}`, cost_price: 2, sell_price: 5, status: true },
  ],
});
const [table] = await request('/rest/v1/restaurant_tables', {
  method: 'POST',
  key: serviceKey,
  body: { table_number: `A-${suffix}`, capacity: 4, area: 'Smoke Test', status: 'AVAILABLE', is_active: true },
});
const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `addon-${suffix}@example.com`, password: `Addon-${suffix}-Pass!`, data: { full_name: 'Add-on Smoke Waiter' } },
});
assert.ok(auth.access_token, 'Expected an authenticated staff session');

await assert.rejects(
  request('/functions/v1/orders', {
    method: 'POST',
    token: auth.access_token,
    body: {
      items: [{ productId: crypto.randomUUID(), quantity: 1, optionIds: [], specialRequest: '' }],
      paymentMethod: 'CASH',
      diningMode: 'dine-in',
      tableId: table.id,
      idempotencyKey: `invalid-${suffix}`,
    },
  }),
  /PRODUCT_NOT_AVAILABLE|product not available/,
);
const ordersAfterRollback = await request(`/rest/v1/orders?restaurant_table_id=eq.${table.id}&select=id`, { key: serviceKey });
assert.equal(ordersAfterRollback.length, 0, 'Failed order left a partial order behind');
const tableAfterRollback = await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey });
assert.equal(tableAfterRollback[0].status, 'AVAILABLE', 'Failed order changed the table status');

const createPayload = await request('/functions/v1/orders', {
  method: 'POST',
  token: auth.access_token,
  body: {
    items: [{ productId: products[0].id, quantity: 1, optionIds: [], specialRequest: '' }],
    paymentMethod: 'CASH',
    diningMode: 'dine-in',
    tableId: table.id,
    idempotencyKey: `initial-${suffix}`,
  },
});
const orderId = createPayload.data.id;
assert.ok(orderId, 'Initial table order was not created');

const occupiedTable = await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey });
assert.equal(occupiedTable[0].status, 'OCCUPIED', 'Table was not booked after sending the first order');
const tableListing = await request('/functions/v1/tables', { token: auth.access_token });
const reopenedTable = tableListing.data.find(({ id }) => id === table.id);
assert.equal(reopenedTable.orders[0]?.id, orderId, 'Occupied table did not expose its active order for reopening');

await assert.rejects(
  request('/functions/v1/orders', {
    method: 'POST',
    token: auth.access_token,
    body: {
      items: [{ productId: products[0].id, quantity: 1, optionIds: [], specialRequest: '' }],
      paymentMethod: 'CASH',
      diningMode: 'dine-in',
      tableId: table.id,
      idempotencyKey: `second-${suffix}`,
    },
  }),
  /TABLE_NOT_AVAILABLE|table not available|ACTIVE_ORDER_EXISTS|active order exists/,
);
await request(`/rest/v1/products?id=eq.${products[0].id}`, {
  method: 'PATCH', key: serviceKey, body: { sell_price: 99 },
});

const addOnBody = {
  items: [{ productId: products[1].id, quantity: 2, optionIds: [], specialRequest: 'Less ice' }],
  idempotencyKey: `addon-${suffix}`,
};
const addOnPayload = await request(`/functions/v1/orders/${orderId}/items`, {
  method: 'POST', token: auth.access_token, body: addOnBody,
});
assert.equal(addOnPayload.data.id, orderId, 'Add-on created or targeted a different order');

await request(`/functions/v1/orders/${orderId}/items`, {
  method: 'POST', token: auth.access_token, body: addOnBody,
});

const [persistedOrder] = await request(
  `/rest/v1/orders?id=eq.${orderId}&select=id,total,restaurant_table_id,order_items(id,product_id,quantity,unit_price,batch_id,sent_at)`,
  { key: serviceKey },
);
assert.equal(persistedOrder.restaurant_table_id, table.id, 'Order moved away from the selected table');
assert.equal(persistedOrder.order_items.length, 2, 'Idempotent retry duplicated add-on items');
const originalItem = persistedOrder.order_items.find(({ product_id }) => product_id === products[0].id);
assert.equal(Number(originalItem.unit_price), 10, 'Historical order item did not retain its transaction-time price');
const addOnItem = persistedOrder.order_items.find(({ product_id }) => product_id === products[1].id);
assert.equal(addOnItem.quantity, 2, 'Add-on quantity was not persisted');
assert.ok(addOnItem.batch_id, 'Add-on item was not tagged with its dispatch batch');
assert.ok(addOnItem.sent_at, 'Add-on item was not marked as sent');

const [payment] = await request(`/rest/v1/payments?order_id=eq.${orderId}&select=amount,status`, { key: serviceKey });
assert.equal(Number(payment.amount), Number(persistedOrder.total), 'Pending payment was not updated to the new bill total');
assert.equal(payment.status, 'PENDING');

console.log(JSON.stringify({
  table: table.table_number,
  orderId,
  tableStatus: occupiedTable[0].status,
  itemCount: persistedOrder.order_items.length,
  addOnQuantity: addOnItem.quantity,
  paymentAmount: Number(payment.amount),
  idempotentRetry: true,
  rollbackVerified: true,
  doubleTableClaimRejected: true,
  transactionPriceSnapshot: Number(originalItem.unit_price),
}));
