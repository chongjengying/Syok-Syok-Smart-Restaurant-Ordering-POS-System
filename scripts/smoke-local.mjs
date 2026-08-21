import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const status = JSON.parse(execFileSync('npx', ['--no-install', 'supabase', 'status', '--output', 'json'], { encoding: 'utf8' }));
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
  method: 'POST', key: serviceKey, body: { name: `Smoke ${suffix}`, description: 'Local smoke test' },
});
const [product] = await request('/rest/v1/products', {
  method: 'POST', key: serviceKey, body: {
    category_id: category.id,
    product_name: `Smoke Product ${suffix}`,
    description: 'Local smoke test product',
    unit: 'item',
    cost_price: 5,
    sell_price: 10,
    status: true,
  },
});

const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `smoke-${suffix}@example.com`, password: `Smoke-${suffix}-Pass!`, data: { full_name: 'Smoke Cashier' } },
});
assert.ok(auth.access_token, 'Local signup did not return an access token');

const [adminRole] = await request('/rest/v1/roles?name=eq.ADMIN&select=id', { key: serviceKey });
assert.ok(adminRole?.id, 'Expected the ADMIN role to exist');
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH',
  key: serviceKey,
  body: { role_id: adminRole.id },
});

const functionRequest = (name, options = {}) => request(`/functions/v1/${name}${options.path || ''}`, {
  ...options,
  token: auth.access_token,
});

const cashierAuth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `cashier-${suffix}@example.com`, password: `Cashier-${suffix}-Pass!`, data: { full_name: 'Smoke Cashier Restricted' } },
});
assert.ok(cashierAuth.access_token, 'Restricted cashier signup did not return an access token');
const cashierFunctionRequest = (name, options = {}) => request(`/functions/v1/${name}${options.path || ''}`, {
  ...options,
  token: cashierAuth.access_token,
});

const cashierDisplayName = `Updated Cashier ${suffix}`;
const [updatedCashierProfile] = await request(`/rest/v1/profiles?id=eq.${cashierAuth.user.id}`, {
  method: 'PATCH', token: cashierAuth.access_token, body: { name: cashierDisplayName },
});
assert.equal(updatedCashierProfile.name, cashierDisplayName, 'Cashier could not update an allowed profile field');

await assert.rejects(cashierFunctionRequest('orders'), /403/);
await assert.rejects(cashierFunctionRequest('payments', { path: '/report/daily' }), /403/);

const inactiveAuth = await request('/auth/v1/signup', {
  method: 'POST',
  body: { email: `inactive-${suffix}@example.com`, password: `Inactive-${suffix}-Pass!`, data: { full_name: 'Inactive Smoke User' } },
});
await request(`/rest/v1/profiles?id=eq.${inactiveAuth.user.id}`, {
  method: 'PATCH', key: serviceKey, body: { status: 'INACTIVE' },
});
const inactiveEscalationAttempt = await request(`/rest/v1/profiles?id=eq.${inactiveAuth.user.id}`, {
  method: 'PATCH', token: inactiveAuth.access_token, body: { status: 'ACTIVE', role_name: 'ADMIN' },
});
assert.deepEqual(inactiveEscalationAttempt, [], 'Inactive staff unexpectedly updated protected profile fields');
const [persistedInactiveProfile] = await request(
  `/rest/v1/profiles?id=eq.${inactiveAuth.user.id}&select=status,role_name`,
  { key: serviceKey },
);
assert.deepEqual(
  persistedInactiveProfile,
  { status: 'INACTIVE', role_name: 'CASHIER' },
  'Inactive staff privilege escalation changed persisted profile fields',
);
const inactiveFunctionRequest = (name) => request(`/functions/v1/${name}`, { token: inactiveAuth.access_token });
for (const functionName of ['products', 'tables', 'orders', 'payments']) {
  await assert.rejects(inactiveFunctionRequest(functionName), /403/);
}
const inactiveCategories = await request('/rest/v1/categories', { token: inactiveAuth.access_token });
assert.deepEqual(inactiveCategories, [], 'Inactive profile bypassed direct category RLS');

const tables = await functionRequest('tables', { path: '?includeInactive=true' });
const seededTableNumbers = ['A01', 'A02', 'A03', 'B01', 'B02', 'B03', 'C01', 'C02'];
assert.deepEqual(
  seededTableNumbers.filter((tableNumber) => !tables.data.some((table) => table.table_number === tableNumber)),
  [],
  'Expected all seeded restaurant tables to be present',
);
for (const table of tables.data.filter(({ status }) => status === 'DISABLED')) {
  await functionRequest('tables', {
    method: 'POST', path: `/${table.id}/restore`,
    body: { operationKey: `initial-restore-${suffix}-${table.id}` },
  });
}

const menu = await functionRequest('products');
assert.ok(menu.data.products.some((item) => item.id === product.id), 'Product endpoint did not return database product');

const activeCategories = await functionRequest('products', { path: '/categories?activeOnly=true' });
assert.ok(
  activeCategories.data.some((item) => item.id === category.id),
  'Active categories endpoint did not return the category with an available product',
);

const productDetail = await functionRequest('products', { path: `/${product.id}` });
assert.equal(productDetail.data.id, product.id, 'Product detail endpoint returned the wrong product');

const availableTables = await functionRequest('tables', { path: '?status=AVAILABLE' });
const transitionTable = availableTables.data[0];
assert.ok(transitionTable?.id, 'Expected at least one available table');

for (const status of ['RESERVED', 'AVAILABLE']) {
  const transitioned = await functionRequest('tables', {
    method: 'PATCH',
    path: `/${transitionTable.id}/status`,
    body: { status },
  });
  assert.equal(transitioned.data.status, status);
}

const tableDetail = await functionRequest('tables', { path: `/${transitionTable.id}` });
assert.equal(tableDetail.data.status, 'AVAILABLE');
await assert.rejects(
  functionRequest('tables', {
    method: 'PATCH', path: `/${transitionTable.id}/status`, body: { status: 'OCCUPIED' },
  }),
  /409/,
);

const serviceTable = availableTables.data[1];
await functionRequest('tables', {
  method: 'POST', path: `/${serviceTable.id}/out-of-service`,
  body: { reason: 'Smoke maintenance', operationKey: `service-${suffix}` },
});
await assert.rejects(
  functionRequest('orders', {
    method: 'POST',
    body: {
      items: [{ productId: product.id, quantity: 1, optionIds: [] }],
      paymentMethod: 'CASH', diningMode: 'dine-in', tableId: serviceTable.id,
      idempotencyKey: `out-of-service-${suffix}`,
    },
  }),
  /409/,
);
await functionRequest('tables', {
  method: 'POST', path: `/${serviceTable.id}/restore`,
  body: { operationKey: `restore-${suffix}` },
});

const sourceTable = transitionTable;
const destinationTable = availableTables.data[2];
const dineInOrder = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [] }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: sourceTable.id,
    idempotencyKey: `dine-in-${suffix}`,
  },
});
assert.equal((await functionRequest('tables', { path: `/${sourceTable.id}` })).data.status, 'OCCUPIED');
await assert.rejects(
  cashierFunctionRequest('orders', {
    method: 'POST',
    body: {
      items: [{ productId: product.id, quantity: 1, optionIds: [] }],
      paymentMethod: 'CASH', diningMode: 'dine-in', tableId: sourceTable.id,
      idempotencyKey: `conflict-${suffix}`,
    },
  }),
  /409/,
);
const movedOrder = await functionRequest('tables', {
  method: 'POST', path: '/move-order',
  body: {
    orderId: dineInOrder.data.id,
    destinationTableId: destinationTable.id,
    operationKey: `move-${suffix}`,
  },
});
const replayedMove = await functionRequest('tables', {
  method: 'POST', path: '/move-order',
  body: {
    orderId: dineInOrder.data.id,
    destinationTableId: destinationTable.id,
    operationKey: `move-${suffix}`,
  },
});
assert.equal(replayedMove.data.order.id, movedOrder.data.order.id, 'Move replay was not idempotent');
assert.equal((await functionRequest('tables', { path: `/${sourceTable.id}` })).data.status, 'CLEANING');
assert.equal((await functionRequest('tables', { path: `/${destinationTable.id}` })).data.status, 'OCCUPIED');
await assert.rejects(
  cashierFunctionRequest('tables', {
    method: 'POST', path: `/${sourceTable.id}/complete-cleaning`, body: { operationKey: `unauthorized-clean-${suffix}` },
  }),
  /403/,
);
await functionRequest('tables', {
  method: 'POST', path: `/${sourceTable.id}/complete-cleaning`, body: { operationKey: `clean-source-${suffix}` },
});
await functionRequest('orders', {
  method: 'POST', path: `/${dineInOrder.data.id}/start`, body: {},
});
const preparingDineInOrder = await functionRequest('orders', { path: `/${dineInOrder.data.id}` });
const preparingDineInBatch = preparingDineInOrder.data.order_item_batches?.[0];
assert.ok(preparingDineInBatch?.id, 'Kitchen start did not create a persisted batch');
await functionRequest('payments', {
  method: 'POST',
  body: {
    orderId: dineInOrder.data.id,
    paymentMethod: 'CASH',
    finalAmount: Number(dineInOrder.data.total),
    receivedAmount: Number(dineInOrder.data.total),
    idempotencyKey: `dine-in-payment-${suffix}`,
  },
});
await functionRequest('orders', {
  method: 'POST',
  path: `/${dineInOrder.data.id}/batches/${preparingDineInBatch.id}/ready`,
  body: {},
});
await functionRequest('orders', {
  method: 'POST', path: `/${dineInOrder.data.id}/serve`, body: {},
});
assert.equal(
  (await functionRequest('orders', { path: `/${dineInOrder.data.id}` })).data.status,
  'COMPLETED',
  'Paid dine-in order did not complete when served',
);
assert.equal((await functionRequest('tables', { path: `/${destinationTable.id}` })).data.status, 'OCCUPIED');
await functionRequest('tables', {
  method: 'POST', path: `/${destinationTable.id}/start-cleaning`, body: { operationKey: `start-clean-destination-${suffix}` },
});
assert.equal((await functionRequest('tables', { path: `/${destinationTable.id}` })).data.status, 'CLEANING');
await functionRequest('tables', {
  method: 'POST', path: `/${destinationTable.id}/complete-cleaning`, body: { operationKey: `clean-destination-${suffix}` },
});
const repeatedCleaning = await functionRequest('tables', {
  method: 'POST', path: `/${destinationTable.id}/complete-cleaning`, body: { operationKey: `clean-destination-${suffix}` },
});
assert.equal(repeatedCleaning.data.status, 'AVAILABLE');

const cancelledDineInOrder = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [] }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: sourceTable.id,
    idempotencyKey: `cancel-dine-in-${suffix}`,
  },
});
await functionRequest('orders', {
  method: 'PATCH', path: `/${cancelledDineInOrder.data.id}`, body: { status: 'CANCELLED', notes: 'Pre-kitchen cancellation smoke' },
});
assert.equal((await functionRequest('tables', { path: `/${sourceTable.id}` })).data.status, 'AVAILABLE');

const created = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: 'No pepper' }],
    paymentMethod: 'CASH',
    diningMode: 'takeaway',
    tableId: null,
    idempotencyKey: `smoke-${suffix}`,
  },
});
assert.equal(created.data.status, 'CONFIRMED');
assert.equal(created.data.payment_status, 'UNPAID');
assert.equal(Number(created.data.total), 23.2);
assert.equal(Number(created.data.tax), 1.2);
assert.equal(Number(created.data.service_charge), 2);

await assert.rejects(
  functionRequest('orders', { method: 'POST', body: { items: [], paymentMethod: 'CASH', diningMode: 'takeaway' } }),
  /400/,
);
await assert.rejects(
  functionRequest('orders', {
    method: 'POST', body: {
      items: [{ productId: product.id, quantity: 1, optionIds: [] }],
      paymentMethod: 'CASH', diningMode: 'takeaway',
    },
  }),
  /400/,
);
await assert.rejects(
  functionRequest('orders', {
    method: 'POST',
    body: {
      items: [{ productId: crypto.randomUUID(), quantity: 1, optionIds: [] }],
      paymentMethod: 'CASH',
      diningMode: 'takeaway',
      idempotencyKey: `invalid-${suffix}`,
    },
  }),
  /422/,
);
await assert.rejects(
  functionRequest('orders', { method: 'PATCH', path: `/${created.data.id}`, body: { status: 'READY' } }),
  /409/,
);

const kitchenQueue = await functionRequest('orders');
assert.ok(kitchenQueue.data.some((order) => order.id === created.data.id), 'Kitchen queue omitted the persisted order');

const duplicate = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: 'No pepper' }],
    paymentMethod: 'CASH',
    diningMode: 'takeaway',
    tableId: null,
    idempotencyKey: `smoke-${suffix}`,
  },
});
assert.equal(duplicate.data.id, created.data.id, 'Idempotent retry created a duplicate order');
await assert.rejects(
  functionRequest('orders', {
    method: 'POST',
    body: {
      items: [{ productId: product.id, quantity: 1, optionIds: [] }],
      paymentMethod: 'CASH', diningMode: 'takeaway', tableId: null,
      idempotencyKey: `smoke-${suffix}`,
    },
  }),
  /409/,
  'An idempotency key was accepted with a different request payload',
);

const paid = await functionRequest('payments', {
  method: 'POST',
  body: {
    orderId: created.data.id,
    paymentMethod: 'CASH',
    finalAmount: Number(created.data.total),
    receivedAmount: Number(created.data.total),
    idempotencyKey: `takeaway-payment-${suffix}`,
  },
});
assert.equal(paid.data.payment.status, 'PAID');
assert.equal(paid.data.order.payment_status, 'PAID');

const paidReplay = await functionRequest('payments', {
  method: 'POST',
  body: {
    orderId: created.data.id,
    paymentMethod: 'CASH',
    finalAmount: Number(created.data.total),
    receivedAmount: Number(created.data.total),
    idempotencyKey: `takeaway-payment-${suffix}`,
  },
});
assert.equal(paidReplay.data.payment.status, 'PAID', 'Duplicate payment confirmation was not idempotent');
assert.equal(paidReplay.data.replayed, true, 'Duplicate payment confirmation was not identified as a replay');

const capabilities = await functionRequest('payments');
assert.equal(capabilities.data.methods.find(({ method }) => method === 'CASH').available, true);
assert.equal(capabilities.data.methods.find(({ method }) => method === 'CARD').available, false);

const providerPendingOrder = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [] }],
    paymentMethod: 'CARD',
    diningMode: 'takeaway',
    idempotencyKey: `provider-${suffix}`,
  },
});
await assert.rejects(
  functionRequest('payments', {
    method: 'POST',
    body: {
      orderId: providerPendingOrder.data.id,
      paymentMethod: 'CARD',
      finalAmount: Number(providerPendingOrder.data.total),
      idempotencyKey: `provider-payment-${suffix}`,
    },
  }),
  /503/,
);
const providerOrderAfterFailure = await functionRequest('orders', { path: `/${providerPendingOrder.data.id}` });
assert.equal(providerOrderAfterFailure.data.payment_status, 'UNPAID', 'Unavailable provider marked order paid');
await functionRequest('orders', {
  method: 'PATCH', path: `/${providerPendingOrder.data.id}`, body: { status: 'CANCELLED', notes: 'Smoke cleanup' },
});

const lateCancelledOrder = await functionRequest('orders', {
  method: 'POST',
  body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [] }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: sourceTable.id,
    idempotencyKey: `late-cancel-${suffix}`,
  },
});
await functionRequest('orders', {
  method: 'POST', path: `/${lateCancelledOrder.data.id}/start`, body: {},
});
await functionRequest('orders', {
  method: 'PATCH', path: `/${lateCancelledOrder.data.id}`,
  body: { status: 'CANCELLED', notes: 'Manager late cancellation smoke' },
});
assert.equal(
  (await functionRequest('tables', { path: `/${sourceTable.id}` })).data.status,
  'CLEANING',
  'Kitchen-started cancellation did not require cleaning',
);
await functionRequest('tables', {
  method: 'POST', path: `/${sourceTable.id}/complete-cleaning`,
  body: { operationKey: `clean-late-cancel-${suffix}` },
});

const concurrentPayload = (idempotencyKey) => ({
  items: [{ productId: product.id, quantity: 1, optionIds: [] }],
  paymentMethod: 'CASH', diningMode: 'dine-in', tableId: serviceTable.id,
  idempotencyKey,
});
const concurrentResults = await Promise.allSettled([
  functionRequest('orders', { method: 'POST', body: concurrentPayload(`race-a-${suffix}`) }),
  functionRequest('orders', { method: 'POST', body: concurrentPayload(`race-b-${suffix}`) }),
]);
const concurrentSuccesses = concurrentResults.filter(({ status: resultStatus }) => resultStatus === 'fulfilled');
const concurrentFailures = concurrentResults.filter(({ status: resultStatus }) => resultStatus === 'rejected');
assert.equal(concurrentSuccesses.length, 1, 'Concurrent table claims did not produce exactly one winner');
assert.equal(concurrentFailures.length, 1, 'Concurrent table claims did not reject exactly one loser');
assert.match(String(concurrentFailures[0].reason), /409/);
const concurrentOrder = concurrentSuccesses[0].value;
await functionRequest('orders', {
  method: 'PATCH', path: `/${concurrentOrder.data.id}`,
  body: { status: 'CANCELLED', notes: 'Concurrent claim cleanup' },
});
assert.equal((await functionRequest('tables', { path: `/${serviceTable.id}` })).data.status, 'AVAILABLE');

const tableActivity = await request(
  `/rest/v1/table_activity_logs?order_id=eq.${dineInOrder.data.id}&select=action,from_status,to_status,performed_by,operation_key`,
  { key: serviceKey },
);
assert.ok(tableActivity.some(({ action }) => action === 'ORDER_MOVED_OUT'), 'Move-out audit entry is missing');
assert.ok(tableActivity.some(({ action }) => action === 'ORDER_MOVED_IN'), 'Move-in audit entry is missing');
assert.ok(tableActivity.every(({ performed_by }) => performed_by === auth.user.id), 'Audit actor was not preserved');

const reportResponse = await functionRequest('payments', { path: '/report/daily' });
const salesEntry = reportResponse.data.find((entry) => entry.order_id === created.data.id);
assert.ok(salesEntry, 'Expected paid order to appear in daily sales report');
assert.equal(salesEntry.payment_id, paid.data.payment.id, 'Daily sales report returned the wrong payment');
assert.equal(Number(salesEntry.tax), 1.2);
assert.equal(Number(salesEntry.service_charge), 2);
await assert.rejects(
  functionRequest('payments', { path: '/report/daily?dateFrom=2026-99-99' }),
  /400/,
);
await assert.rejects(
  functionRequest('payments', { path: '/report/daily?dateFrom=2026-08-12&dateTo=2026-08-11' }),
  /400/,
);

const paidTakeawayDetail = await functionRequest('orders', { path: `/${created.data.id}` });
const paidTakeawayBatch = paidTakeawayDetail.data.order_item_batches?.[0];
assert.ok(paidTakeawayBatch?.id, 'Paid takeaway order did not retain its kitchen batch');
await functionRequest('orders', {
  method: 'POST', path: `/${created.data.id}/batches/${paidTakeawayBatch.id}/start`, body: {},
});
await functionRequest('orders', {
  method: 'POST', path: `/${created.data.id}/batches/${paidTakeawayBatch.id}/ready`, body: {},
});
await functionRequest('orders', {
  method: 'POST', path: `/${created.data.id}/serve`, body: {},
});

const order = await functionRequest('orders', { path: `/${created.data.id}` });
assert.equal(order.data.status, 'COMPLETED');
assert.equal(order.data.payment_status, 'PAID');
assert.ok(order.data.statusHistory.length >= 2, 'Order status history was not persisted');

console.log(JSON.stringify({
  tables: tables.data.length,
  activeCategories: activeCategories.data.length,
  products: menu.data.products.length,
  tableTransitionStatus: tableDetail.data.status,
  orderStatus: order.data.status,
  paymentStatus: order.data.payment_status,
  historyEntries: order.data.statusHistory.length,
  cashierKitchenDenied: true,
  cashierReportDenied: true,
  unavailableProviderSafe: true,
  inactiveProfileDenied: true,
  concurrentTableClaimSafe: true,
  idempotencyPayloadBound: true,
  tableAuditTraceVerified: true,
}));
