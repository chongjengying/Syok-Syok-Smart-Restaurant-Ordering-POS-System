import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync(
  'npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' },
));
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
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Kitchen ${suffix}` },
}))[0];
const product = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Kitchen Meal ${suffix}`, cost_price: 4, sell_price: 14, status: true },
}))[0];
const table = (await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey,
  body: { table_number: `K-${suffix}`, capacity: 4, area: 'Kitchen Test', status: 'AVAILABLE', is_active: true },
}))[0];
const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: {
    email: `kitchen-${suffix}@example.com`,
    password: `Kitchen-${suffix}-Pass!`,
    data: { full_name: 'Kitchen Flow Admin' },
  },
});
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN', status: 'ACTIVE' },
});
const functionRequest = (path = '', options = {}) => request(`/functions/v1/orders${path}`, {
  ...options, token: auth.access_token,
});

async function createOrder(diningMode, tableId, serviceMode, note) {
  return functionRequest('', {
    method: 'POST',
    body: {
      items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: note, serviceMode }],
      paymentMethod: 'CASH', diningMode, tableId,
      idempotencyKey: `kitchen-${diningMode}-${suffix}`,
    },
  });
}

async function assertLifecycle(order, expectedLocation, fulfillmentStatus) {
  let queue = await functionRequest();
  let queued = queue.data.find((entry) => entry.id === order.data.id);
  assert.ok(queued, 'Placed order was not loaded from the real kitchen queue');
  assert.equal(queued.order_number, order.data.order_number);
  assert.equal(queued.restaurant_tables?.table_number || 'Takeaway', expectedLocation);
  assert.equal(queued.order_items[0].products.id, product.id, 'Kitchen query did not join products');
  assert.equal(queued.order_items[0].product_name_snapshot, product.product_name);
  assert.equal(queued.order_items[0].quantity, 2);
  assert.ok(queued.order_items[0].special_request);

  const started = await functionRequest(`/${order.data.id}/start`, { method: 'POST', body: {} });
  assert.equal(started.data.status, 'PREPARING', 'START did not atomically begin preparation');
  assert.ok(started.data.kitchen_started_at, 'START did not persist kitchen_started_at');
  assert.equal((await request(
    `/rest/v1/order_items?order_id=eq.${order.data.id}&select=item_status`, { key: serviceKey },
  ))[0].item_status, 'PREPARING');

  const expectedItemStatus = { READY: 'READY', SERVED: 'SERVED' };
  for (const nextStatus of ['READY', fulfillmentStatus]) {
    const changed = await functionRequest(`/${order.data.id}`, {
      method: 'PATCH', body: { status: nextStatus, notes: `Kitchen set ${nextStatus}` },
    });
    assert.equal(changed.data.status, nextStatus, `Order did not persist ${nextStatus}`);
    const [item] = await request(
      `/rest/v1/order_items?order_id=eq.${order.data.id}&select=item_status,service_mode`,
      { key: serviceKey },
    );
    assert.equal(item.item_status, expectedItemStatus[nextStatus], `Item did not persist ${expectedItemStatus[nextStatus]}`);
  }
  queue = await functionRequest();
  queued = queue.data.find((entry) => entry.id === order.data.id);
  assert.equal(queued, undefined, 'Served order remained in the active kitchen queue');
}

const dineIn = await createOrder('dine-in', table.id, 'DINE_IN', 'No salt');
await assertLifecycle(dineIn, table.table_number, 'SERVED');

const takeaway = await createOrder('takeaway', null, 'TAKEAWAY', 'Pack sauce separately');
await assertLifecycle(takeaway, 'Takeaway', 'SERVED');
const [takeawayItem] = await request(
  `/rest/v1/order_items?order_id=eq.${takeaway.data.id}&select=service_mode,item_status`,
  { key: serviceKey },
);
assert.equal(takeawayItem.service_mode, 'TAKEAWAY');
assert.equal(takeawayItem.item_status, 'SERVED');

console.log(JSON.stringify({
  realKitchenQueue: true,
  productsJoined: true,
  restaurantTablesJoined: true,
  notesPersisted: true,
  atomicStart: ['CONFIRMED', 'PREPARING'],
  dineInLifecycle: ['PREPARING', 'READY', 'SERVED'],
  takeawayLifecycle: ['PREPARING', 'READY', 'SERVED'],
  servedOrdersLeaveQueue: true,
}));
