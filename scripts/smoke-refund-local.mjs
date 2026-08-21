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

async function createStaff(role, suffix) {
  const auth = (await request('/auth/v1/signup', {
    method: 'POST', body: { email: `${role.toLowerCase()}-refund-${suffix}@example.com`, password: `Refund-${suffix}-Pass!` },
  })).payload;
  await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  return auth.access_token;
}

const suffix = crypto.randomUUID().slice(0, 8);
const adminToken = await createStaff('ADMIN', suffix);
const cashierToken = await createStaff('CASHIER', suffix);
const category = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Refund Test ${suffix}` },
})).payload[0];
const product = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: { category_id: category.id, product_name: `Refund Meal ${suffix}`, cost_price: 4, sell_price: 12, status: true, is_available: true },
})).payload[0];
const order = (await request('/functions/v1/orders', {
  method: 'POST', token: adminToken,
  body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [], serviceMode: 'TAKEAWAY' }],
    paymentMethod: 'CASH', diningMode: 'takeaway', tableId: null,
    idempotencyKey: `refund-order-${suffix}`,
  },
})).payload.data;
await request(`/functions/v1/orders/${order.id}/start`, { method: 'POST', token: adminToken, body: {} });
await request(`/functions/v1/orders/${order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'READY' } });
await request(`/functions/v1/orders/${order.id}`, { method: 'PATCH', token: adminToken, body: { status: 'SERVED' } });
await request('/functions/v1/payments', {
  method: 'POST', token: adminToken,
  body: {
    orderId: order.id, paymentMethod: 'CASH', finalAmount: Number(order.total),
    receivedAmount: Number(order.total), idempotencyKey: `refund-payment-${suffix}`,
  },
});

const body = { orderId: order.id, reason: 'Automated full refund verification', idempotencyKey: `refund-${suffix}` };
const denied = await request('/functions/v1/payments/refund', {
  method: 'POST', token: cashierToken, body, allowError: true,
});
assert.equal(denied.status, 403, 'Cashier was allowed to authorize a refund');

const completed = await request('/functions/v1/payments/refund', { method: 'POST', token: adminToken, body });
assert.equal(completed.status, 200, 'Manager-level refund boundary failed');
assert.equal(completed.payload.data.replayed, false, 'First refund was incorrectly marked as a replay');
const replay = await request('/functions/v1/payments/refund', { method: 'POST', token: adminToken, body });
assert.equal(replay.payload.data.replayed, true, 'Duplicate refund did not replay idempotently');

const [persistedOrder] = (await request(`/rest/v1/orders?id=eq.${order.id}&select=payment_status`, { key: serviceKey })).payload;
assert.equal(persistedOrder.payment_status, 'REFUNDED');
const refunds = (await request(`/rest/v1/refunds?order_id=eq.${order.id}&select=refund_number,amount`, { key: serviceKey })).payload;
assert.equal(refunds.length, 1, 'Refund retry created more than one refund');
assert.match(refunds[0].refund_number, /^REF-\d{8}-\d{6}$/);
const audit = (await request(`/rest/v1/audit_logs?entity_id=eq.${order.id}&action=eq.ORDER_REFUNDED&select=id`, { key: serviceKey })).payload;
assert.equal(audit.length, 1, 'Refund was not recorded exactly once in the audit log');

console.log(JSON.stringify({
  cashierRefundDenied: true,
  fullRefundCompleted: true,
  duplicateRefundReplayed: true,
  auditRecorded: true,
  paymentStatus: persistedOrder.payment_status,
}));
