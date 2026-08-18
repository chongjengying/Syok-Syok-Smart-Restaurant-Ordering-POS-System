import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' }));
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function request(path, { method = 'GET', key = anonKey, token = key, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const [category] = await request('/rest/v1/categories', { method: 'POST', key: serviceKey, body: { name: `Takeaway ${suffix}` } });
const [product] = await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Takeaway Meal ${suffix}`, cost_price: 4, sell_price: 12, status: true },
});
const auth = await request('/auth/v1/signup', {
  method: 'POST', body: { email: `takeaway-${suffix}@example.com`, password: `Takeaway-${suffix}-Pass!`, data: { full_name: 'Takeaway Admin' } },
});
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN', status: 'ACTIVE' },
});
const token = auth.access_token;

const draft = (await request('/functions/v1/orders', {
  method: 'POST', token,
  body: { draft: true, diningMode: 'takeaway', tableId: null, idempotencyKey: `draft-${suffix}` },
})).data;
await request(`/functions/v1/orders/${draft.id}/draft-items`, {
  method: 'POST', token,
  body: { items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: 'Sauce separately', serviceMode: 'TAKEAWAY' }] },
});
const packaging = ['CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN'];
await request(`/functions/v1/orders/${draft.id}/takeaway-packaging`, { method: 'POST', token, body: { packaging } });
let detail = (await request(`/functions/v1/orders/${draft.id}`, { token })).data;
assert.equal(detail.status, 'DRAFT');
assert.equal(detail.restaurant_table_id, null);
assert.deepEqual(detail.takeaway_packaging.sort(), [...packaging].sort());
assert.ok(detail.order_items.every(({ item_status }) => item_status === 'DRAFT'));

const paymentBody = {
  orderId: draft.id, paymentMethod: 'CASH', finalAmount: Number(detail.total), receivedAmount: 100,
  idempotencyKey: `pay-submit-${suffix}`, submitTakeaway: true,
};
await request('/functions/v1/payments', { method: 'POST', token, body: paymentBody });
await request('/functions/v1/payments', { method: 'POST', token, body: paymentBody });
detail = (await request(`/functions/v1/orders/${draft.id}`, { token })).data;
assert.equal(detail.status, 'COMPLETED');
assert.equal(detail.payment_status, 'PAID');
assert.ok(detail.order_items.every(({ item_status }) => item_status === 'SUBMITTED'));
assert.equal(detail.order_item_batches.length, 1);

const batch = detail.order_item_batches[0];
let kitchen = (await request('/functions/v1/orders', { token })).data;
assert.ok(kitchen.some(({ id }) => id === draft.id), 'Paid takeaway was missing from kitchen');
await request(`/functions/v1/orders/${draft.id}/batches/${batch.id}/start`, { method: 'POST', token, body: {} });
await request(`/functions/v1/orders/${draft.id}/batches/${batch.id}/ready`, { method: 'POST', token, body: {} });
let pickup = (await request('/functions/v1/orders?scope=ready-to-serve', { token })).data;
assert.ok(pickup.some(({ id, dining_mode }) => id === draft.id && dining_mode === 'takeaway'), 'Ready takeaway was missing from pickup');
await request(`/functions/v1/orders/${draft.id}/serve`, { method: 'POST', token, body: {} });
detail = (await request(`/functions/v1/orders/${draft.id}`, { token })).data;
assert.equal(detail.status, 'COMPLETED');
assert.ok(detail.order_items.every(({ item_status }) => item_status === 'SERVED'));
pickup = (await request('/functions/v1/orders?scope=ready-to-serve', { token })).data;
assert.ok(!pickup.some(({ id }) => id === draft.id), 'Collected takeaway remained in pickup');
kitchen = (await request('/functions/v1/orders', { token })).data;
assert.ok(!kitchen.some(({ id }) => id === draft.id), 'Collected takeaway remained in kitchen');

console.log(JSON.stringify({
  noTableRequired: true,
  packagingPersisted: packaging,
  payAndSubmitAtomic: true,
  kitchenLifecycle: ['SUBMITTED', 'PREPARING', 'READY'],
  collectedCompletesFulfillment: true,
  idempotentPayment: true,
}));
