import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' }));
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function request(path, { method = 'GET', key = anonKey, token = key, body, allowError = false } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowError) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return allowError ? { httpStatus: response.status, payload } : payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', { method: 'POST', key: serviceKey, body: { name: `Draft ${suffix}` } }))[0];
const products = await request('/rest/v1/products', { method: 'POST', key: serviceKey, body: [
  { category_id: category.id, product_name: `Meal ${suffix}`, cost_price: 3, sell_price: 12, status: true },
  { category_id: category.id, product_name: `Drink ${suffix}`, cost_price: 1, sell_price: 4, status: true },
] });
const tables = await request('/rest/v1/restaurant_tables', { method: 'POST', key: serviceKey, body: [
  { table_number: `D-${suffix}`, capacity: 4, area: 'Draft Test', status: 'AVAILABLE', is_active: true },
  { table_number: `R-${suffix}`, capacity: 4, area: 'Race Test', status: 'AVAILABLE', is_active: true },
] });
const auth = await request('/auth/v1/signup', { method: 'POST', body: { email: `draft-${suffix}@example.com`, password: `Draft-${suffix}-Pass!`, data: { full_name: 'Draft Flow Admin' } } });
assert.ok(auth.access_token);
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, { method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN' } });
const token = auth.access_token;

const draft = await request('/functions/v1/orders', { method: 'POST', token, body: {
  draft: true, diningMode: 'dine-in', tableId: tables[0].id, idempotencyKey: `draft-${suffix}`,
} });
const orderId = draft.data.id;
assert.ok(orderId);
let table = await request(`/rest/v1/restaurant_tables?id=eq.${tables[0].id}&select=status`, { key: serviceKey });
assert.equal(table[0].status, 'OCCUPIED', 'Dine-in draft did not atomically occupy its table');
let kitchen = await request('/functions/v1/orders', { token });
assert.ok(!kitchen.data.some((order) => order.id === orderId), 'Draft leaked into the kitchen queue');

const mixedItems = [
  { productId: products[0].id, quantity: 2, optionIds: [], specialRequest: 'No onion', serviceMode: 'DINE_IN' },
  { productId: products[1].id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' },
];
await request(`/functions/v1/orders/${orderId}/draft-items`, { method: 'POST', token, body: { items: mixedItems } });
let restored = await request(`/functions/v1/orders/${orderId}`, { token });
assert.equal(restored.data.order_items.filter((item) => item.item_status === 'DRAFT').length, 2, 'Draft items were not recoverable');
assert.deepEqual(new Set(restored.data.order_items.map((item) => item.service_mode)), new Set(['DINE_IN', 'TAKEAWAY']));
await request(`/rest/v1/products?id=eq.${products[0].id}`, { method: 'PATCH', key: serviceKey, body: { sell_price: 15 } });

const submitBody = { idempotencyKey: `submit-${suffix}` };
await request(`/functions/v1/orders/${orderId}/submit`, { method: 'POST', token, body: submitBody });
await request(`/functions/v1/orders/${orderId}/submit`, { method: 'POST', token, body: submitBody });
restored = await request(`/functions/v1/orders/${orderId}`, { token });
assert.equal(restored.data.order_items.length, 2, 'Submission retry duplicated items');
assert.ok(restored.data.order_items.every((item) => item.item_status === 'SUBMITTED' && item.sent_at));
assert.equal(Number(restored.data.order_items.find((item) => item.product_id === products[0].id).unit_price), 15, 'Submit did not snapshot the current authoritative price');
kitchen = await request('/functions/v1/orders', { token });
assert.equal(kitchen.data.find((order) => order.id === orderId)?.order_items.length, 2, 'Submitted items were not visible to kitchen');

const cashierAuth = await request('/auth/v1/signup', { method: 'POST', body: {
  email: `cashier-${suffix}@example.com`, password: `Cashier-${suffix}-Pass!`, data: { full_name: 'Second Terminal Cashier' },
} });
const cashierTables = await request('/functions/v1/tables', { token: cashierAuth.access_token });
const cashierTable = cashierTables.data.find((entry) => entry.id === tables[0].id);
assert.equal(cashierTable?.orders?.[0]?.id, orderId, 'A second staff terminal could not see the table unpaid order');
const cashierOrder = await request(`/functions/v1/orders/${orderId}`, { token: cashierAuth.access_token });
assert.equal(cashierOrder.data.id, orderId, 'A cashier could not reopen an unpaid order created by another user');
let unpaidOrders = await request('/functions/v1/orders?scope=unpaid', { token: cashierAuth.access_token });
assert.ok(unpaidOrders.data.some((entry) => entry.id === orderId && entry.order_items.length === 2), 'Unpaid order list did not show the table order history');

for (const next of ['PREPARING', 'READY', 'SERVED']) {
  await request(`/functions/v1/orders/${orderId}`, { method: 'PATCH', token, body: { status: next } });
}
await request(`/functions/v1/orders/${orderId}/draft-items`, { method: 'POST', token: cashierAuth.access_token, body: { items: [
  { productId: products[1].id, quantity: 2, optionIds: [], specialRequest: 'Second round', serviceMode: 'DINE_IN' },
] } });
await request(`/functions/v1/orders/${orderId}/submit`, { method: 'POST', token: cashierAuth.access_token, body: {
  idempotencyKey: `second-round-${suffix}`,
} });
restored = await request(`/functions/v1/orders/${orderId}`, { token: cashierAuth.access_token });
assert.equal(restored.data.order_items.length, 3, 'Second ordering round created a separate bill or lost history');
const secondRoundItem = restored.data.order_items.find((item) => item.special_request === 'Second round');
assert.ok(secondRoundItem?.batch_id, 'Second ordering round was not identified as an add-on batch');
kitchen = await request('/functions/v1/orders', { token });
assert.deepEqual(
  kitchen.data.find((order) => order.id === orderId)?.order_items.map((item) => item.id),
  [secondRoundItem.id],
  'Previously fulfilled items were resent to the kitchen',
);
const secondRoundBatch = restored.data.order_item_batches.find(({ id }) => id === secondRoundItem.batch_id);
assert.equal(secondRoundBatch.batch_no, 2, 'Second ordering round was not Batch 2');
await request(`/functions/v1/orders/${orderId}/batches/${secondRoundBatch.id}/start`, { method: 'POST', token, body: {} });
await request(`/functions/v1/orders/${orderId}/batches/${secondRoundBatch.id}/ready`, { method: 'POST', token, body: {} });
await request(`/functions/v1/orders/${orderId}/serve`, { method: 'POST', token, body: {} });
restored = await request(`/functions/v1/orders/${orderId}`, { token });
const paymentKey = `payment-${suffix}`;
const paymentBody = { orderId, paymentMethod: 'CASH', finalAmount: Number(restored.data.total), idempotencyKey: paymentKey };
await request('/functions/v1/payments', { method: 'POST', token, body: paymentBody });
await request('/functions/v1/payments', { method: 'POST', token, body: paymentBody });
restored = await request(`/functions/v1/orders/${orderId}`, { token });
assert.equal(restored.data.status, 'COMPLETED');
assert.equal(restored.data.payment_status, 'PAID');
unpaidOrders = await request('/functions/v1/orders?scope=unpaid', { token: cashierAuth.access_token });
assert.ok(!unpaidOrders.data.some((entry) => entry.id === orderId), 'Paid order remained in the unpaid order list');
table = await request(`/rest/v1/restaurant_tables?id=eq.${tables[0].id}&select=status`, { key: serviceKey });
assert.equal(table[0].status, 'OCCUPIED', 'Payment released the table before staff started cleaning');
await request(`/functions/v1/tables/${tables[0].id}/start-cleaning`, {
  method: 'POST', token, body: { operationKey: `start-cleaning-${suffix}` },
});
table = await request(`/rest/v1/restaurant_tables?id=eq.${tables[0].id}&select=status`, { key: serviceKey });
assert.equal(table[0].status, 'CLEANING', 'Manual cleaning start did not persist');

const takeaway = await request('/functions/v1/orders', { method: 'POST', token, body: {
  draft: true, diningMode: 'takeaway', tableId: null, idempotencyKey: `takeaway-${suffix}`,
} });
await request(`/functions/v1/orders/${takeaway.data.id}/draft-items`, { method: 'POST', token, body: { items: [
  { productId: products[0].id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' },
] } });
await request(`/functions/v1/orders/${takeaway.data.id}/submit`, { method: 'POST', token, body: { idempotencyKey: `takeaway-submit-${suffix}` } });
for (const next of ['PREPARING', 'READY', 'SERVED']) {
  await request(`/functions/v1/orders/${takeaway.data.id}`, { method: 'PATCH', token, body: { status: next } });
}
const takeawayOrder = await request(`/functions/v1/orders/${takeaway.data.id}`, { token });
assert.equal(takeawayOrder.data.restaurant_table_id, null);
assert.equal(takeawayOrder.data.order_items[0].item_status, 'SERVED');
unpaidOrders = await request('/functions/v1/orders?scope=unpaid', { token: cashierAuth.access_token });
assert.ok(unpaidOrders.data.some((entry) => entry.id === takeaway.data.id && entry.restaurant_table_id === null), 'Active takeaway was not available as a temporary pickup table');

const unavailable = await request('/functions/v1/orders', { method: 'POST', token, body: {
  draft: true, diningMode: 'takeaway', tableId: null, idempotencyKey: `unavailable-${suffix}`,
} });
await request(`/functions/v1/orders/${unavailable.data.id}/draft-items`, { method: 'POST', token, body: { items: [
  { productId: products[1].id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' },
] } });
await request(`/rest/v1/products?id=eq.${products[1].id}`, { method: 'PATCH', key: serviceKey, body: { status: false } });
const rejectedSubmit = await request(`/functions/v1/orders/${unavailable.data.id}/submit`, {
  method: 'POST', token, allowError: true, body: { idempotencyKey: `disabled-submit-${suffix}` },
});
assert.equal(rejectedSubmit.httpStatus, 422, 'Disabled product was accepted at submission');
const unavailableOrder = await request(`/functions/v1/orders/${unavailable.data.id}`, { token });
assert.equal(unavailableOrder.data.status, 'DRAFT', 'Rejected submission did not roll back');

const race = await Promise.all([
  request('/functions/v1/orders', { method: 'POST', token, allowError: true, body: { draft: true, diningMode: 'dine-in', tableId: tables[1].id, idempotencyKey: `race-a-${suffix}` } }),
  request('/functions/v1/orders', { method: 'POST', token, allowError: true, body: { draft: true, diningMode: 'dine-in', tableId: tables[1].id, idempotencyKey: `race-b-${suffix}` } }),
]);
assert.equal(race.filter((result) => result.httpStatus === 201).length, 1, 'Concurrent table claim did not produce exactly one winner');

console.log(JSON.stringify({ orderId, takeawayOrderId: takeaway.data.id, tableMarkedCleaning: true, temporaryTakeawayTable: true, unpaidOrderList: true, paidOrderRemovedFromList: true, crossTerminalResume: true, unpaidHistoryRetained: true, secondRoundSameBill: true, priorItemsNotResent: true, draftRecovery: true, kitchenDraftExcluded: true, mixedServiceModes: true, authoritativeSubmitPrice: true, idempotentSubmit: true, idempotentPayment: true, unavailableProductRejected: true, concurrentTableClaim: true }));
