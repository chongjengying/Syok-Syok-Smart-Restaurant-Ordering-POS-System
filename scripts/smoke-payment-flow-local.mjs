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
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowError) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return { status: response.status, payload };
}

async function createStaff(role, suffix, number) {
  const auth = (await request('/auth/v1/signup', {
    method: 'POST', body: { email: `${role.toLowerCase()}-pay-${number}-${suffix}@example.com`, password: `Payment-${suffix}-Pass!` },
  })).payload;
  await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  return auth.access_token;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Payment ${suffix}` },
})).payload[0];
const product = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Payment Meal ${suffix}`, cost_price: 5, sell_price: 20, status: true },
})).payload[0];
const table = (await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey,
  body: { table_number: `P-${suffix}`, capacity: 4, area: 'Payment Test', status: 'AVAILABLE', is_active: true },
})).payload[0];

const adminToken = await createStaff('ADMIN', suffix, 1);
const cashierOne = await createStaff('CASHIER', suffix, 1);
const cashierTwo = await createStaff('CASHIER', suffix, 2);
const orderRequest = (token, path = '', options = {}) => request(`/functions/v1/orders${path}`, { ...options, token });
const paymentRequest = (token, body, allowError = false) => request('/functions/v1/payments', { method: 'POST', token, body, allowError });

async function createFulfilledOrder({ diningMode = 'takeaway', tableId = null, key }) {
  const created = (await orderRequest(adminToken, '', {
    method: 'POST',
    body: {
      items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: '', serviceMode: diningMode === 'dine-in' ? 'DINE_IN' : 'TAKEAWAY' }],
      paymentMethod: 'CASH', diningMode, tableId, idempotencyKey: key,
    },
  })).payload.data;
  await orderRequest(adminToken, `/${created.id}/start`, { method: 'POST', body: {} });
  await orderRequest(adminToken, `/${created.id}`, { method: 'PATCH', body: { status: 'READY' } });
  await orderRequest(adminToken, `/${created.id}`, {
    method: 'PATCH', body: { status: 'SERVED' },
  });
  return (await orderRequest(adminToken, `/${created.id}`)).payload.data;
}

const capabilities = (await request('/functions/v1/payments', { token: cashierOne })).payload.data.methods;
assert.equal(capabilities.find((entry) => entry.method === 'CASH')?.available, true, 'Cash payment is not available');
for (const method of ['CARD', 'QR', 'EWALLET']) {
  const capability = capabilities.find((entry) => entry.method === method);
  assert.equal(capability?.available, false, `${method} must remain disabled until a real provider is configured`);
  assert.equal(capability?.mode, 'unavailable', `${method} did not disclose its unavailable provider state`);
}

const dineIn = await createFulfilledOrder({ diningMode: 'dine-in', tableId: table.id, key: `dine-${suffix}` });
const unpaidOrderPage = (await orderRequest(cashierOne, '?scope=unpaid')).payload.data;
assert.ok(unpaidOrderPage.some(({ id }) => id === dineIn.id), 'Order page did not show the active unpaid order');
const orderDetailPage = (await orderRequest(cashierOne, `/${dineIn.id}`)).payload.data;
assert.equal(orderDetailPage.order_items.length, 1, 'Order detail did not load persisted items');
assert.equal(Number(orderDetailPage.total), Number(dineIn.total), 'Order detail did not load the authoritative total');
const sharedKey = `shared-${suffix}`;
const sharedBody = {
  orderId: dineIn.id,
  paymentMethod: 'CASH',
  finalAmount: Number(dineIn.total),
  receivedAmount: 100,
  idempotencyKey: sharedKey,
};
const wrongCashAmount = await paymentRequest(cashierOne, {
  ...sharedBody,
  finalAmount: Number(dineIn.total) + 1,
  idempotencyKey: `wrong-cash-${suffix}`,
}, true);
assert.equal(wrongCashAmount.status, 409, 'Cash accepted an incorrect authoritative amount');
const concurrentSameKey = await Promise.all([
  paymentRequest(cashierOne, sharedBody, true),
  paymentRequest(cashierTwo, sharedBody, true),
]);
assert.deepEqual(concurrentSameKey.map(({ status: responseStatus }) => responseStatus), [200, 200], 'Same-key retry did not replay safely');
assert.ok(concurrentSameKey.some(({ payload }) => payload.data.replayed === true), 'Concurrent retry was not identified as a replay');

const [completedDineIn] = (await request(`/rest/v1/orders?id=eq.${dineIn.id}&select=status,payment_status`, { key: serviceKey })).payload;
assert.deepEqual(completedDineIn, { status: 'COMPLETED', payment_status: 'PAID' });
const [cleaningTable] = (await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey })).payload;
assert.equal(cleaningTable.status, 'OCCUPIED', 'Payment released the table before staff started cleaning');
await request(`/functions/v1/tables/${table.id}/start-cleaning`, {
  method: 'POST', token: adminToken, body: { operationKey: `start-cleaning-${suffix}` },
});
const [startedCleaningTable] = (await request(`/rest/v1/restaurant_tables?id=eq.${table.id}&select=status`, { key: serviceKey })).payload;
assert.equal(startedCleaningTable.status, 'CLEANING', 'Manual cleaning start did not persist');
const paidRows = (await request(`/rest/v1/payments?order_id=eq.${dineIn.id}&status=eq.PAID&select=id,idempotency_key,amount,received_amount,change_amount`, { key: serviceKey })).payload;
assert.equal(paidRows.length, 1, 'More than one paid payment exists for the order');
assert.equal(Number(paidRows[0].received_amount), 100, 'Cash received amount was not persisted');
assert.equal(Number(paidRows[0].change_amount), Number((100 - Number(paidRows[0].amount)).toFixed(2)), 'Cash change was not persisted');

const differentKeyRetry = await paymentRequest(cashierTwo, { ...sharedBody, idempotencyKey: `different-${suffix}` }, true);
assert.equal(differentKeyRetry.status, 409, 'A second payment with another key was accepted');

for (const method of ['CARD', 'QR', 'EWALLET']) {
  const fulfilled = await createFulfilledOrder({ key: `${method}-${suffix}` });
  const blocked = await paymentRequest(cashierOne, {
    orderId: fulfilled.id, paymentMethod: method, finalAmount: Number(fulfilled.total), idempotencyKey: `pay-${method}-${suffix}`,
  }, true);
  assert.equal(blocked.status, 503, `${method} succeeded without a configured payment provider`);
  assert.equal(blocked.payload.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  const afterAttempt = (await orderRequest(adminToken, `/${fulfilled.id}`)).payload.data;
  assert.equal(afterAttempt.payment_status, 'UNPAID', `Blocked ${method} payment mutated the order`);
  const paidPaymentRows = (await request(`/rest/v1/payments?order_id=eq.${fulfilled.id}&status=eq.PAID&select=id`, { key: serviceKey })).payload;
  assert.equal(paidPaymentRows.length, 0, `Blocked ${method} payment created a paid transaction`);
}

const raceOrder = await createFulfilledOrder({ key: `race-${suffix}` });
const race = await Promise.all([
  paymentRequest(cashierOne, { orderId: raceOrder.id, paymentMethod: 'CASH', finalAmount: Number(raceOrder.total), receivedAmount: Number(raceOrder.total), idempotencyKey: `race-a-${suffix}` }, true),
  paymentRequest(cashierTwo, { orderId: raceOrder.id, paymentMethod: 'CASH', finalAmount: Number(raceOrder.total), receivedAmount: Number(raceOrder.total), idempotencyKey: `race-b-${suffix}` }, true),
]);
assert.deepEqual(race.map(({ status: responseStatus }) => responseStatus).sort(), [200, 409], 'Two-cashier race did not accept exactly one payment');
const racePaidRows = (await request(`/rest/v1/payments?order_id=eq.${raceOrder.id}&status=eq.PAID&select=id`, { key: serviceKey })).payload;
assert.equal(racePaidRows.length, 1, 'Two-cashier race created duplicate paid rows');

console.log(JSON.stringify({
  availableMethods: ['CASH'],
  blockedUntilProviderConfigured: ['CARD', 'QR', 'EWALLET'],
  authoritativeAmountValidation: true,
  transactionalCompletion: true,
  dineInTableAwaitingCleaning: true,
  manualCleaningStart: true,
  sameKeyRetryReplay: true,
  doubleClickProtected: true,
  twoCashierRaceAcceptedOne: true,
  onePaidPaymentPerOrder: true,
  cashTenderAndChangePersisted: true,
  orderPageToDetailFlow: true,
  authoritativeDetailTotal: true,
}));
