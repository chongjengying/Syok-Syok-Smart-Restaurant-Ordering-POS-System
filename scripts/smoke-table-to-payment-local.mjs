import { bindTestTerminal } from './operational-session-fixture.mjs';
import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname), 'Local tests require a local API');
let token = status.SERVICE_ROLE_KEY;
async function request(path, { body, method = body ? 'POST' : 'GET', service = false, expected = 200 } = {}) {
  const response = await fetch(`${status.API_URL}${path}`, {
    method,
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${service ? status.SERVICE_ROLE_KEY : token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}
const suffix = crypto.randomUUID().slice(0, 8);
const [branch] = await request('/rest/v1/branches?code=eq.MAIN&select=id', { service: true });
assert.ok(branch?.id, 'Seeded MAIN branch required');
const auth = await request('/auth/v1/signup', { body: { email: `flow-${suffix}@example.com`, password: `Flow-${suffix}-Pass!` } });
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, { method: 'PATCH', service: true, body: { role_name: 'ADMIN', status: 'ACTIVE', branch_id: branch.id } });
token = auth.access_token;
await bindTestTerminal({ status, userId: auth.user.id, accessToken: token, branchId: branch.id });
const [category] = await request('/rest/v1/categories', { service: true, expected: 201, body: { name: `Flow ${suffix}` } });
const [product] = await request('/rest/v1/products', { service: true, expected: 201, body: { category_id: category.id, product_name: `Flow Meal ${suffix}`, sell_price: 12, cost_price: 3, status: true, is_available: true } });
const [table] = await request('/rest/v1/restaurant_tables', { service: true, expected: 201, body: { branch_id: branch.id, table_number: `F-${suffix}`, capacity: 4, area: 'Flow Test', status: 'AVAILABLE', is_active: true } });
const [destination] = await request('/rest/v1/restaurant_tables', { service: true, expected: 201, body: { branch_id: branch.id, table_number: `F-D-${suffix}`, capacity: 4, area: 'Flow Test', status: 'AVAILABLE', is_active: true } });
const created = await request('/functions/v1/orders', { expected: 201, body: { draft: true, diningMode: 'dine-in', tableId: table.id, idempotencyKey: `draft-${suffix}` } });
const orderPath = `/functions/v1/orders/${created.data.id}`;
const getOrder = async () => (await request(orderPath)).data;
let order = await getOrder();
const initialVersion = order.draft_version;
const items = [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: '', serviceMode: 'DINE_IN' }];
await request(`${orderPath}/draft-items`, { body: { items, expectedVersion: initialVersion } });
const conflict = await request(`${orderPath}/draft-items`, { expected: 409, body: { items: [], expectedVersion: initialVersion } });
assert.equal(conflict.code, 'STALE_DRAFT_VERSION');
order = await getOrder();
assert.equal(order.order_items.length, 1, 'Stale terminal erased the cart');
const submit = { idempotencyKey: `submit-${suffix}` };
await request(`${orderPath}/submit`, { body: submit });
await request(`${orderPath}/submit`, { body: submit });
order = await getOrder();
assert.equal(order.order_items.length, 1);
assert.ok(order.order_number);
const moved = await request('/functions/v1/tables/move-order', { body: {
  orderId: order.id, destinationTableId: destination.id, expectedSourceTableId: table.id, operationKey: `move-${suffix}`,
} });
assert.equal(moved.data.order.restaurant_table_id, destination.id, 'Active order was not moved to its destination table');
await request('/functions/v1/tables/move-order', { body: {
  orderId: order.id, destinationTableId: destination.id, expectedSourceTableId: table.id, operationKey: `move-${suffix}`,
} });
const [sourceAfterMove] = await request(`/rest/v1/restaurant_tables?id=eq.${table.id}`, { service: true });
assert.equal(sourceAfterMove.status, 'CLEANING', 'Source table was not marked for cleaning');
for (const batch of order.order_item_batches) {
  await request(`${orderPath}/batches/${batch.id}/start`, { body: {} });
  await request(`${orderPath}/batches/${batch.id}/ready`, { body: {} });
}
await request(`${orderPath}/serve`, { body: {} });
order = await getOrder();
const useScreenPayment = process.argv.includes('--screen-payment');
const useQr = useScreenPayment && process.argv.includes('--qr');
const qrProvider = 'TNG_EWALLET';
const partialPayment = useScreenPayment && process.argv.includes('--partial');
let collectedBefore = 0;
if (partialPayment) {
  const partial = { orderId: order.id, splitType: 'AMOUNT', paymentMethod: 'CASH', amount: '10.00', receivedAmount: '10.00', idempotencyKey: `partial-${suffix}` };
  if (useQr) Object.assign(partial, { paymentMethod: 'QR', providerId: qrProvider, paymentReference: `qr-partial-${suffix}` });
  await request('/functions/v1/payments', { body: partial });
  await request('/functions/v1/payments', { body: partial });
  assert.equal((await getOrder()).payment_status, 'PARTIALLY_PAID');
  collectedBefore = 10;
}
const payment = { orderId: order.id, paymentMethod: 'CASH', finalAmount: Number(order.total), receivedAmount: 100, idempotencyKey: `pay-${suffix}` };
if (useScreenPayment) {
  Object.assign(payment, { splitType: 'FULL', amount: (Number(order.total) - collectedBefore).toFixed(2), receivedAmount: '100.00', providerId: null, paymentReference: null });
  if (useQr) Object.assign(payment, { paymentMethod: 'QR', providerId: qrProvider, receivedAmount: payment.amount, paymentReference: `qr-${suffix}` });
} else {
  await request('/functions/v1/payments', { body: { ...payment, receivedAmount: 0 }, expected: 400 });
}
if (useQr) {
  const rejected = await request('/functions/v1/payments', { body: { ...payment, providerId: 'UNKNOWN_TEST_PROVIDER', idempotencyKey: `invalid-provider-${suffix}` }, expected: 409 });
  assert.equal(rejected.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
}
await request('/functions/v1/payments', { body: payment });
await request('/functions/v1/payments', { body: payment });
order = await getOrder();
assert.equal(order.payment_status, 'PAID');
assert.equal(order.status, 'COMPLETED');
const paid = await request(`/rest/v1/payments?order_id=eq.${order.id}&status=eq.PAID`, { service: true });
assert.equal(paid.length, partialPayment ? 2 : 1, 'Duplicate payment was recorded');
assert.ok(paid.every(row => row.branch_id === branch.id));
assert.equal(Number(paid.reduce((sum, row) => sum + Number(row.change_amount), 0).toFixed(2)), useQr ? 0 : Number((100 - Number(order.total) + collectedBefore).toFixed(2)));
if (useQr) assert.ok(paid.every(row => row.provider_id === qrProvider && row.confirmed_by === auth.user.id && row.confirmed_at));
const receipts = await request(`/rest/v1/receipts?order_id=eq.${order.id}`, { service: true });
assert.equal(receipts.length, 1, 'Expected one receipt');
if (useQr) assert.ok(receipts[0].payments_snapshot.every(row => row.providerId === qrProvider), 'QR provider missing from receipt snapshot');
const [afterTable] = await request(`/rest/v1/restaurant_tables?id=eq.${destination.id}`, { service: true });
if (afterTable.status === 'OCCUPIED') await request(`/functions/v1/tables/${destination.id}/start-cleaning`, { body: { operationKey: `clean-${suffix}` } });
await request(`/functions/v1/tables/${destination.id}/complete-cleaning`, { body: { operationKey: `available-${suffix}` } });
const [available] = await request(`/rest/v1/restaurant_tables?id=eq.${destination.id}`, { service: true });
assert.equal(available.status, 'AVAILABLE');
console.log(JSON.stringify({ orderId: order.id, paymentPath: useScreenPayment ? 'payment-screen' : 'legacy', method: useQr ? 'QR' : 'CASH', partialPayment, tableMove: 'PASS', tableToPayment: 'PASS', staleDraftProtected: true, duplicateSubmitProtected: true, duplicatePaymentProtected: true, receiptCreated: true, tableAvailable: true }));
