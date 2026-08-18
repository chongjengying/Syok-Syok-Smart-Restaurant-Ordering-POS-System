import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync(
  'npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' },
));
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
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowError) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { status: response.status, payload };
}

async function createStaff(role, suffix) {
  const auth = (await request('/auth/v1/signup', {
    method: 'POST',
    body: { email: `${role.toLowerCase()}-serve-${suffix}@example.com`, password: `Serve-${suffix}-Pass!` },
  })).payload;
  await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  return auth.access_token;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Serve ${suffix}` },
})).payload[0];
const product = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Serve Meal ${suffix}`, cost_price: 4, sell_price: 15, status: true },
})).payload[0];
const table = (await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey,
  body: { table_number: `S-${suffix}`, capacity: 4, area: 'Serving Test', status: 'AVAILABLE', is_active: true },
})).payload[0];

const adminToken = await createStaff('ADMIN', suffix);
const waiterToken = await createStaff('WAITER', suffix);
const kitchenToken = await createStaff('KITCHEN', suffix);
const ordersRequest = (token, path = '', options = {}) => request(`/functions/v1/orders${path}`, { ...options, token });

const created = (await ordersRequest(adminToken, '', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: 'Serve together', serviceMode: 'DINE_IN' }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id,
    idempotencyKey: `serve-${suffix}`,
  },
})).payload.data;

await ordersRequest(adminToken, `/${created.id}/start`, { method: 'POST', body: {} });
const ready = (await ordersRequest(adminToken, `/${created.id}`, {
  method: 'PATCH', body: { status: 'READY', notes: 'Kitchen finished food' },
})).payload.data;
assert.equal(ready.status, 'READY', 'Kitchen READY was not persisted');
assert.notEqual(ready.status, 'COMPLETED', 'READY incorrectly completed the order');

const waiterQueue = (await request('/functions/v1/orders?scope=ready-to-serve', { token: waiterToken })).payload.data;
const waiterTicket = waiterQueue.find((order) => order.id === created.id);
assert.ok(waiterTicket, 'Waiter could not see the READY order');
assert.equal(waiterTicket.status, 'READY');
assert.equal(waiterTicket.restaurant_tables.table_number, table.table_number);

const kitchenServeAttempt = await ordersRequest(kitchenToken, `/${created.id}/serve`, {
  method: 'POST', body: {}, allowError: true,
});
assert.equal(kitchenServeAttempt.status, 403, 'Kitchen staff were allowed to perform the waiter serving action');

const served = (await ordersRequest(waiterToken, `/${created.id}/serve`, {
  method: 'POST', body: {},
})).payload.data;
assert.equal(served.status, 'SERVED', 'Waiter serving did not persist SERVED');
assert.notEqual(served.status, 'COMPLETED', 'Serving incorrectly completed the order');

const [item] = (await request(
  `/rest/v1/order_items?order_id=eq.${created.id}&select=item_status`, { key: serviceKey },
)).payload;
assert.equal(item.item_status, 'SERVED', 'Order items were not persisted as SERVED');

const afterServeQueue = (await request('/functions/v1/orders?scope=ready-to-serve', { token: waiterToken })).payload.data;
assert.equal(afterServeQueue.some((order) => order.id === created.id), false, 'Served order remained in the ready queue');

const servedAgain = (await ordersRequest(waiterToken, `/${created.id}/serve`, {
  method: 'POST', body: {},
})).payload.data;
assert.equal(servedAgain.status, 'SERVED', 'Repeated serve was not idempotent');

console.log(JSON.stringify({
  waiterSeesReady: true,
  kitchenCannotServe: true,
  servedPersisted: true,
  itemServedPersisted: true,
  readyDidNotComplete: true,
  servedDidNotComplete: true,
  servedLeavesReadyQueue: true,
  idempotentServe: true,
}));
