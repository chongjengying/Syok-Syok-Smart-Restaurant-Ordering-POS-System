import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

async function rawRequest(path, { method = 'GET', key = anonKey, token = key, body } = {}) {
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
  return { response, payload: await response.json().catch(() => null) };
}

async function request(path, options) {
  const result = await rawRequest(path, options);
  if (!result.response.ok) {
    throw new Error(`${options?.method || 'GET'} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', {
  method: 'POST', key: serviceKey, body: { name: `Production Split ${suffix}` },
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

async function createUser(role = 'ADMIN') {
  const identity = crypto.randomUUID().slice(0, 8);
  const auth = await request('/auth/v1/signup', {
    method: 'POST',
    body: { email: `split-${role.toLowerCase()}-${identity}@example.com`, password: `Split-${identity}-Pass!` },
  });
  await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  return auth.access_token;
}

const token = await createUser('ADMIN');
const waiterToken = await createUser('WAITER');
let tableNumber = 0;
const testedOrderIds = [];

async function createOrder(quantity = 1) {
  tableNumber += 1;
  const table = (await request('/rest/v1/restaurant_tables', {
    method: 'POST', key: serviceKey,
    body: { table_number: `PS-${suffix}-${tableNumber}`, capacity: 4, area: 'Split Test', status: 'AVAILABLE', is_active: true },
  }))[0];
  const order = (await request('/functions/v1/orders', {
    method: 'POST', token,
    body: {
      items: [{ productId: product.id, quantity, optionIds: [] }],
      paymentMethod: 'CASH',
      diningMode: 'dine-in',
      tableId: table.id,
      idempotencyKey: `split-order-${suffix}-${tableNumber}`,
    },
  })).data;
  testedOrderIds.push(order.id);
  return order;
}

function paymentBody(order, splitType, idempotencyKey, overrides = {}) {
  return {
    orderId: order.id,
    splitType,
    paymentMethod: 'CASH',
    amount: String(order.total),
    receivedAmount: String(order.total),
    idempotencyKey,
    ...overrides,
  };
}

async function pay(body, expectedStatus = 200, paymentToken = token) {
  const result = await rawRequest('/functions/v1/payments', { method: 'POST', token: paymentToken, body });
  assert.equal(result.response.status, expectedStatus, JSON.stringify(result.payload));
  return result.payload;
}

// Full payment, cash tender/change, receipt, already-paid protection.
const fullOrder = await createOrder();
const fullResult = (await pay(paymentBody(fullOrder, 'FULL', `full-${suffix}`, {
  receivedAmount: String(Number(fullOrder.total) + 10),
}))).data;
assert.equal(fullResult.summary.paymentStatus, 'PAID');
assert.equal(Number(fullResult.summary.remainingAmount), 0);
assert.equal(Number(fullResult.payment.change_amount), 10);
assert.equal((await pay(paymentBody(fullOrder, 'FULL', `full-again-${suffix}`), 409)).code, 'ORDER_ALREADY_PAID');
const fullReceipts = await request(`/rest/v1/receipts?order_id=eq.${fullOrder.id}&select=receipt_number,total,paid_amount`, { key: serviceKey });
assert.equal(fullReceipts.length, 1);
assert.equal(Number(fullReceipts[0].total), Number(fullReceipts[0].paid_amount));

// Custom amount, browser refresh/reconciliation, idempotent retry, bad amounts,
// and two-terminal race for the same final outstanding balance.
const amountOrder = await createOrder();
const partialBody = paymentBody(amountOrder, 'AMOUNT', `amount-partial-${suffix}`, {
  amount: '5.00', receivedAmount: '10.00',
});
const partial = (await pay(partialBody)).data;
assert.equal(partial.summary.paymentStatus, 'PARTIALLY_PAID');
assert.equal(Number(partial.payment.amount), 5);
assert.equal(Number(partial.payment.change_amount), 5);
const replay = (await pay(partialBody)).data;
assert.equal(replay.replayed, true);
const refreshed = (await request(`/functions/v1/payments/summary?orderId=${amountOrder.id}`, { token })).data;
assert.equal(Number(refreshed.paidAmount), 5);
assert.equal(refreshed.paymentStatus, 'PARTIALLY_PAID');
assert.equal((await pay(paymentBody(amountOrder, 'AMOUNT', `zero-${suffix}`, { amount: '0.00', receivedAmount: '0.00' }), 409)).code, 'INVALID_PAYMENT_AMOUNT');
assert.equal((await pay(paymentBody(amountOrder, 'AMOUNT', `negative-${suffix}`, { amount: '-1.00' }), 400)).code, 'INVALID_PAYMENT_AMOUNT');
assert.equal((await pay(paymentBody(amountOrder, 'AMOUNT', `over-${suffix}`, { amount: String(Number(refreshed.remainingAmount) + 1) }), 409)).code, 'PAYMENT_EXCEEDS_BALANCE');

const remaining = String(refreshed.remainingAmount);
const concurrentBodies = [
  paymentBody(amountOrder, 'FULL', `race-a-${suffix}`, { amount: remaining, receivedAmount: remaining }),
  paymentBody(amountOrder, 'FULL', `race-b-${suffix}`, { amount: remaining, receivedAmount: remaining }),
];
const concurrent = await Promise.all(concurrentBodies.map((body) => rawRequest('/functions/v1/payments', { method: 'POST', token, body })));
assert.equal(concurrent.filter(({ response }) => response.status === 200).length, 1);
assert.equal(concurrent.filter(({ response }) => response.status === 409).length, 1);
const amountSummary = (await request(`/functions/v1/payments/summary?orderId=${amountOrder.id}`, { token })).data;
assert.equal(Number(amountSummary.paidAmount), Number(amountSummary.orderTotal));
assert.equal(amountSummary.paymentStatus, 'PAID');

// Equal split / 2 and / 3. The final share owns any rounding cent.
for (const count of [2, 3]) {
  const equalOrder = await createOrder();
  await request(`/functions/v1/orders/${equalOrder.id}/bills`, {
    method: 'POST', token, body: { mode: 'EQUAL', billCount: count },
  });
  const bills = (await request(`/functions/v1/orders/${equalOrder.id}/bills`, { token })).data;
  assert.equal(bills.length, count);
  assert.equal(bills.reduce((sum, bill) => sum + Math.round(Number(bill.total) * 100), 0), Math.round(Number(equalOrder.total) * 100));
  for (const bill of bills) {
    const result = (await pay(paymentBody(equalOrder, 'EQUAL', `equal-${count}-${bill.bill_number}-${suffix}`, {
      billId: bill.id,
      amount: String(bill.total),
      receivedAmount: String(bill.total),
    }))).data;
    assert.equal(result.summary.paymentStatus, bill.bill_number === count ? 'PAID' : 'PARTIALLY_PAID');
  }
}

// Item split with partial quantity allocation and duplicate item protection.
const itemOrder = await createOrder(2);
const itemSummary = (await request(`/functions/v1/payments/summary?orderId=${itemOrder.id}`, { token })).data;
const item = itemSummary.items[0];
const firstItemPayment = (await pay(paymentBody(itemOrder, 'ITEM', `item-one-${suffix}`, {
  itemAllocations: [{ orderItemId: item.orderItemId, quantity: 1 }],
  amount: String(item.remainingUnitAmounts[0]),
  receivedAmount: String(item.remainingUnitAmounts[0]),
}))).data;
assert.equal(firstItemPayment.summary.paymentStatus, 'PARTIALLY_PAID');
assert.equal(firstItemPayment.summary.items[0].remainingQuantity, 1);
assert.equal((await pay(paymentBody(itemOrder, 'ITEM', `item-duplicate-${suffix}`, {
  itemAllocations: [{ orderItemId: item.orderItemId, quantity: 2 }],
}), 409)).code, 'ORDER_ITEM_ALREADY_PAID');
const finalItem = firstItemPayment.summary.items[0];
const finalItemPayment = (await pay(paymentBody(itemOrder, 'ITEM', `item-final-${suffix}`, {
  itemAllocations: [{ orderItemId: item.orderItemId, quantity: 1 }],
  amount: String(finalItem.remainingUnitAmounts[0]),
  receivedAmount: String(finalItem.remainingUnitAmounts[0]),
}))).data;
assert.equal(finalItemPayment.summary.paymentStatus, 'PAID');
const allocations = await request(`/rest/v1/payment_items?order_item_id=eq.${item.orderItemId}&select=quantity,amount`, { key: serviceKey });
assert.equal(allocations.reduce((sum, allocation) => sum + allocation.quantity, 0), 2);

// Provider failure, cancelled-order rejection, and backend role enforcement.
const failedProviderOrder = await createOrder();
const providerFailure = await pay(paymentBody(failedProviderOrder, 'FULL', `provider-${suffix}`, { paymentMethod: 'QR' }), 503);
assert.equal(providerFailure.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
const providerSummary = (await request(`/functions/v1/payments/summary?orderId=${failedProviderOrder.id}`, { token })).data;
assert.equal(providerSummary.paymentStatus, 'UNPAID');

const cancelledOrder = await createOrder();
await request(`/functions/v1/orders/${cancelledOrder.id}`, {
  method: 'PATCH', token, body: { status: 'CANCELLED', notes: 'Split payment cancellation test' },
});
assert.equal((await pay(paymentBody(cancelledOrder, 'FULL', `cancelled-${suffix}`), 409)).code, 'ORDER_NOT_PAYABLE');
assert.equal((await pay(paymentBody(failedProviderOrder, 'FULL', `waiter-${suffix}`), 403, waiterToken)).code, 'INSUFFICIENT_PERMISSION');

// A split order contributes multiple payment rows but only one distinct order;
// order-level tax/service fields are recognized once and method totals use the
// actual payment amounts.
const today = new Date().toISOString().slice(0, 10);
const reportRows = (await request(`/functions/v1/payments/report/daily?dateFrom=${today}&dateTo=${today}`, { token })).data
  .filter((row) => testedOrderIds.includes(row.order_id));
const amountRows = reportRows.filter((row) => row.order_id === amountOrder.id);
assert.ok(amountRows.length > 1);
assert.equal(new Set(amountRows.map((row) => row.order_id)).size, 1);
assert.equal(amountRows.reduce((sum, row) => sum + Number(row.amount_paid), 0), Number(amountOrder.total));
assert.equal(amountRows.filter((row) => Number(row.tax) > 0).length, 1);
assert.equal(amountRows.filter((row) => Number(row.service_charge) > 0).length, 1);

const productRows = (await request(`/functions/v1/payments/report/products?dateFrom=${today}&dateTo=${today}`, { token })).data;
const productRow = productRows.find((row) => row.product_id === product.id);
assert.ok(productRow, 'Paid product was missing from the product sales report');
assert.equal(Number(productRow.quantity_sold), 6);
assert.equal(Number(productRow.order_count), 5);
assert.equal(Number(productRow.gross_sales), 120);
const unauthorizedProductReport = await rawRequest(
  `/functions/v1/payments/report/products?dateFrom=${today}&dateTo=${today}`,
  { token: waiterToken },
);
assert.equal(unauthorizedProductReport.response.status, 403);

console.log(JSON.stringify({
  fullPayment: true,
  equalTwo: true,
  equalThree: true,
  amountSplit: true,
  itemQuantitySplit: true,
  idempotentReplay: true,
  concurrentOverpaymentPrevented: true,
  cashTenderChange: true,
  providerFailurePreservedUnpaid: true,
  cancelledOrderRejected: true,
  unauthorizedRoleRejected: true,
  reportOrderCountNotInflated: true,
  productReportDateFilter: true,
  productReportNotInflatedBySplitPayments: true,
  receiptIssuedOnce: true,
}));
