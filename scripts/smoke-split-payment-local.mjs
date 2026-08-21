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
  method: 'POST', key: serviceKey, body: { name: `Split Payment ${suffix}` },
}))[0];
const product = (await request('/rest/v1/products', {
  method: 'POST', key: serviceKey,
  body: {
    category_id: category.id,
    product_name: `Split Meal ${suffix}`,
    cost_price: 5,
    sell_price: 20,
    status: true,
    is_available: true,
  },
}))[0];
const table = (await request('/rest/v1/restaurant_tables', {
  method: 'POST', key: serviceKey,
  body: { table_number: `SP-${suffix}`, capacity: 4, area: 'Split Test', status: 'AVAILABLE', is_active: true },
}))[0];

const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `split-pay-${suffix}@example.com`, password: `Split-${suffix}-Pass!` },
});
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { role_name: 'ADMIN', status: 'ACTIVE' },
});
const token = auth.access_token;

const order = (await request('/functions/v1/orders', {
  method: 'POST', token,
  body: {
    items: [{ productId: product.id, quantity: 2, optionIds: [] }],
    paymentMethod: 'CASH',
    diningMode: 'dine-in',
    tableId: table.id,
    idempotencyKey: `split-order-${suffix}`,
  },
})).data;

await request(`/functions/v1/orders/${order.id}/bills`, {
  method: 'POST', token, body: { mode: 'EQUAL', billCount: 2 },
});
let bills = (await request(`/functions/v1/orders/${order.id}/bills`, { token })).data;
assert.equal(bills.length, 2, 'Authenticated bill read did not return both split bills');

let partialPaymentVerified = false;
let paymentReplayVerified = false;
for (const bill of bills) {
  const amount = Number(bill.total) - Number(bill.paid_amount || 0);
  if (bill.bill_number === 1) {
    const partialAmount = Math.floor(amount * 100 / 2) / 100;
    const partialBody = {
      billId: bill.id,
      payments: [{ method: 'CASH', amount: partialAmount, receivedAmount: partialAmount }],
      idempotencyKey: `split-bill-${suffix}-${bill.bill_number}-partial`,
    };
    const partial = (await request('/functions/v1/payments', {
      method: 'POST', token, body: partialBody,
    })).data;
    assert.equal(Number(partial.remainingAmount), amount - partialAmount, 'Partial payment balance was incorrect');
    assert.equal(partial.orderPaid, false, 'Partial collection incorrectly paid the order');
    const replay = (await request('/functions/v1/payments', {
      method: 'POST', token, body: partialBody,
    })).data;
    assert.equal(replay.replayed, true, 'Partial payment retry was not idempotent');
    partialPaymentVerified = true;
    paymentReplayVerified = true;
  }
  const outstanding = bill.bill_number === 1 ? amount - Math.floor(amount * 100 / 2) / 100 : amount;
  const result = (await request('/functions/v1/payments', {
    method: 'POST', token,
    body: {
      billId: bill.id,
      payments: [{ method: 'CASH', amount: outstanding, receivedAmount: outstanding }],
      idempotencyKey: `split-bill-${suffix}-${bill.bill_number}-final`,
    },
  })).data;
  assert.equal(result.remainingAmount, 0, `Bill ${bill.bill_number} retained a balance`);
}

bills = (await request(`/functions/v1/orders/${order.id}/bills`, { token })).data;
assert.ok(bills.every(({ status: billStatus }) => billStatus === 'PAID'), 'Not every split bill became PAID');
const [persistedOrder] = await request(
  `/rest/v1/orders?id=eq.${order.id}&select=payment_status`,
  { key: serviceKey },
);
assert.equal(persistedOrder.payment_status, 'PAID', 'Final bill did not mark the order PAID');
const paidRows = await request(
  `/rest/v1/payments?order_id=eq.${order.id}&bill_id=not.is.null&status=eq.PAID&select=id`,
  { key: serviceKey },
);
assert.equal(paidRows.length, 3, 'Partial plus final bill collections did not persist independently');
const receipts = await request(
  `/rest/v1/receipts?order_id=eq.${order.id}&select=receipt_number,total,paid_amount`,
  { key: serviceKey },
);
assert.equal(receipts.length, 1, 'Final split payment did not issue exactly one receipt');
assert.match(receipts[0].receipt_number, /^RCP-\d{8}-\d{6}$/, 'Receipt number format is invalid');
assert.equal(Number(receipts[0].total), Number(receipts[0].paid_amount), 'Receipt snapshot is not fully paid');

console.log(JSON.stringify({
  authenticatedBillRead: true,
  splitBillsPaid: bills.length,
  multiplePaidRowsPerOrder: paidRows.length,
  partialPaymentVerified,
  paymentReplayVerified,
  atomicReceiptVerified: receipts.length === 1,
  orderPaymentStatus: persistedOrder.payment_status,
}));
