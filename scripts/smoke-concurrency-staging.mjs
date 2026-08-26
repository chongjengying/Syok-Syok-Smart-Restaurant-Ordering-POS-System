import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.STAGING_SUPABASE_URL;
const anonKey = process.env.STAGING_PUBLISHABLE_KEY;
const serviceKey = process.env.STAGING_SERVICE_KEY;
if (!baseUrl || !anonKey || !serviceKey) {
  throw new Error('STAGING_SUPABASE_URL, STAGING_PUBLISHABLE_KEY and STAGING_SERVICE_KEY are required.');
}

const suffix = crypto.randomUUID().slice(0, 8);
const password = `Concurrency-${suffix}-Pass!`;
const fixture = { users: [], categoryId: null, productIds: [], tableIds: [], orderIds: [] };
const results = {};

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
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok && !allowError) {
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return { status: response.status, payload };
}

async function createStaff(role, ordinal) {
  const email = `qa-${role.toLowerCase()}-${ordinal}-${suffix}@example.invalid`;
  const created = await request('/auth/v1/admin/users', {
    method: 'POST', key: serviceKey,
    body: { email, password, email_confirm: true, user_metadata: { full_name: `QA ${role} ${ordinal}` } },
  });
  const userId = created.payload.id ?? created.payload.user?.id;
  fixture.users.push(userId);
  await request(`/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  const login = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  return { id: userId, token: login.payload.access_token, refreshToken: login.payload.refresh_token };
}

async function removeOrphanQaUsers() {
  const listed = await request('/auth/v1/admin/users?page=1&per_page=1000', { key: serviceKey, allowError: true });
  const users = listed.payload?.users || [];
  for (const user of users) {
    if (/^qa-[a-z]+-\d+-[0-9a-f]{8}@example\.invalid$/i.test(user.email || '')) {
      await request(`/auth/v1/admin/users/${user.id}`, { method: 'DELETE', key: serviceKey, allowError: true });
    }
  }
}

const item = (productId, quantity = 1) => ({
  productId, quantity, optionIds: [], specialRequest: '', serviceMode: 'DINE_IN',
});

const edge = (name, token, path = '', options = {}) => request(`/functions/v1/${name}${path}`, {
  ...options, token,
});

async function createOrder(token, { tableId = null, key, quantity = 1, productId = fixture.productIds[0] } = {}) {
  const response = await edge('orders', token, '', {
    method: 'POST', allowError: true,
    body: {
      items: [item(productId, quantity)], paymentMethod: 'CASH',
      diningMode: tableId ? 'dine-in' : 'takeaway', tableId, idempotencyKey: key,
    },
  });
  if (response.payload?.data?.id && !fixture.orderIds.includes(response.payload.data.id)) fixture.orderIds.push(response.payload.data.id);
  return response;
}

async function rows(table, query = '') {
  return (await request(`/rest/v1/${table}?${query}`, { key: serviceKey })).payload;
}

async function waitFor(predicate, message, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

async function cleanup() {
  if (fixture.orderIds.length) {
    const ids = fixture.orderIds.join(',');
    for (const [table, filter] of [
      ['audit_logs', `entity_id=in.(${ids})`],
      ['refunds', `order_id=in.(${ids})`],
      ['receipts', `order_id=in.(${ids})`],
      ['payment_items', `payment_id=in.(${(await rows('payments', `order_id=in.(${ids})&select=id`)).map(({ id }) => id).join(',') || crypto.randomUUID()})`],
      ['payments', `order_id=in.(${ids})`],
      ['order_bill_items', `bill_id=in.(${(await rows('order_bills', `order_id=in.(${ids})&select=id`)).map(({ id }) => id).join(',') || crypto.randomUUID()})`],
      ['order_bills', `order_id=in.(${ids})`],
      ['kitchen_order_items', `kitchen_order_id=in.(${(await rows('kitchen_orders', `order_id=in.(${ids})&select=id`)).map(({ id }) => id).join(',') || crypto.randomUUID()})`],
      ['kitchen_orders', `order_id=in.(${ids})`],
      ['order_submissions', `order_id=in.(${ids})`],
      ['order_item_batches', `order_id=in.(${ids})`],
      ['order_status_history', `order_id=in.(${ids})`],
      ['order_item_options', `order_item_id=in.(${(await rows('order_items', `order_id=in.(${ids})&select=id`)).map(({ id }) => id).join(',') || crypto.randomUUID()})`],
      ['order_items', `order_id=in.(${ids})`],
      ['table_activity_logs', `order_id=in.(${ids})`],
      ['orders', `id=in.(${ids})`],
    ]) await request(`/rest/v1/${table}?${filter}`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
  for (const tableId of fixture.tableIds) {
    await request(`/rest/v1/table_activity_logs?restaurant_table_id=eq.${tableId}`, { method: 'DELETE', key: serviceKey, allowError: true });
    await request(`/rest/v1/restaurant_tables?id=eq.${tableId}`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
  for (const productId of fixture.productIds) {
    await request(`/rest/v1/products?id=eq.${productId}`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
  if (fixture.categoryId) await request(`/rest/v1/categories?id=eq.${fixture.categoryId}`, { method: 'DELETE', key: serviceKey, allowError: true });
  for (const userId of fixture.users) {
    await request(`/auth/v1/admin/users/${userId}`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
}

let waiterA;
let waiterB;
let kitchenA;
let kitchenB;
let cashierA;
let cashierB;
let manager;
const realtimeClients = [];

try {
  await removeOrphanQaUsers();
  waiterA = await createStaff('WAITER', 1);
  waiterB = await createStaff('WAITER', 2);
  kitchenA = await createStaff('KITCHEN', 1);
  kitchenB = await createStaff('KITCHEN', 2);
  cashierA = await createStaff('CASHIER', 1);
  cashierB = await createStaff('CASHIER', 2);
  manager = await createStaff('MANAGER', 1);

  const category = (await request('/rest/v1/categories', {
    method: 'POST', key: serviceKey,
    body: { name: `Concurrency QA ${suffix}`, description: 'Temporary staging concurrency fixture', status: true },
  })).payload[0];
  fixture.categoryId = category.id;
  const products = (await request('/rest/v1/products', {
    method: 'POST', key: serviceKey,
    body: [
      { category_id: category.id, product_name: `QA Meal ${suffix}`, cost_price: 3, sell_price: 10, status: true, is_available: true },
      { category_id: category.id, product_name: `QA Drink ${suffix}`, cost_price: 1, sell_price: 5, status: true, is_available: true },
    ],
  })).payload;
  fixture.productIds.push(...products.map(({ id }) => id));
  const tables = (await request('/rest/v1/restaurant_tables', {
    method: 'POST', key: serviceKey,
    body: Array.from({ length: 5 }, (_, index) => ({
      table_number: `QA-${suffix}-${index + 1}`, capacity: 4, area: 'Concurrency QA', status: 'AVAILABLE', is_active: true,
    })),
  })).payload;
  fixture.tableIds.push(...tables.map(({ id }) => id));

  // Same-table claim: two different authenticated actors race for one row.
  const tableRace = await Promise.all([
    createOrder(waiterA.token, { tableId: tables[0].id, key: `table-a-${suffix}` }),
    createOrder(waiterB.token, { tableId: tables[0].id, key: `table-b-${suffix}` }),
  ]);
  assert.deepEqual(tableRace.map(({ status }) => status).sort(), [201, 409]);
  const tableRaceOrders = await rows('orders', `restaurant_table_id=eq.${tables[0].id}&select=id`);
  assert.equal(tableRaceOrders.length, 1);
  results.sameTableClaim = true;

  // Same draft edited from two stale terminals: one quantity change races a removal.
  const draft = await edge('orders', waiterA.token, '', {
    method: 'POST',
    body: { draft: true, diningMode: 'takeaway', tableId: null, idempotencyKey: `draft-${suffix}` },
  });
  const draftOrderId = draft.payload.data.id;
  fixture.orderIds.push(draftOrderId);
  await edge('orders', waiterA.token, `/${draftOrderId}/draft-items`, {
    method: 'POST', body: { items: [{ ...item(products[0].id), serviceMode: 'TAKEAWAY' }], expectedVersion: 0 },
  });
  const draftRace = await Promise.all([
    edge('orders', waiterA.token, `/${draftOrderId}/draft-items`, {
      method: 'POST', body: { items: [{ ...item(products[0].id, 2), serviceMode: 'TAKEAWAY' }], expectedVersion: 1 }, allowError: true,
    }),
    edge('orders', waiterB.token, `/${draftOrderId}/draft-items`, {
      method: 'POST', body: { items: [], expectedVersion: 1 }, allowError: true,
    }),
  ]);
  assert.deepEqual(draftRace.map(({ status }) => status).sort(), [200, 409]);
  const draftTruth = (await rows('orders', `id=eq.${draftOrderId}&select=draft_version,order_items(quantity,item_status)`))[0];
  assert.equal(draftTruth.draft_version, 2);
  const draftItems = draftTruth.order_items.filter(({ item_status }) => item_status === 'DRAFT');
  assert.ok(draftItems.length === 0 || (draftItems.length === 1 && draftItems[0].quantity === 2));
  results.concurrentDraftEdit = true;

  // Same request repeated concurrently must replay one business order.
  const duplicateKey = `duplicate-${suffix}`;
  const duplicateRace = await Promise.all([
    createOrder(waiterA.token, { key: duplicateKey }),
    createOrder(waiterA.token, { key: duplicateKey }),
  ]);
  assert.deepEqual(duplicateRace.map(({ status }) => status), [201, 201]);
  assert.equal(duplicateRace[0].payload.data.id, duplicateRace[1].payload.data.id);
  assert.equal((await rows('orders', `user_id=eq.${waiterA.id}&idempotency_key=eq.${duplicateKey}&select=id`)).length, 1);
  const workingOrder = duplicateRace[0].payload.data;
  results.duplicateOrderSubmission = true;

  // Concurrent add-ons use append-only operations and allocate distinct batches.
  const addOnRace = await Promise.all([
    edge('orders', waiterA.token, `/${workingOrder.id}/items`, { method: 'POST', body: { items: [item(products[0].id, 2)], idempotencyKey: `addon-a-${suffix}` } }),
    edge('orders', waiterB.token, `/${workingOrder.id}/items`, { method: 'POST', body: { items: [item(products[1].id, 3)], idempotencyKey: `addon-b-${suffix}` } }),
  ]);
  assert.ok(addOnRace.every(({ status }) => status === 201));
  const persistedItems = await rows('order_items', `order_id=eq.${workingOrder.id}&select=product_id,quantity,batch_id`);
  assert.equal(persistedItems.length, 3);
  const batches = await rows('order_item_batches', `order_id=eq.${workingOrder.id}&select=id,batch_no,status&order=batch_no`);
  assert.deepEqual(batches.map(({ batch_no }) => batch_no), [1, 2, 3]);
  results.concurrentOrderAppend = true;
  results.kitchenBatchSequence = true;

  // Realtime: independent waiter/KDS/cashier clients observe authoritative changes.
  const waiterClient = createClient(baseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const kitchenClient = createClient(baseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cashierClient = createClient(baseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  realtimeClients.push(waiterClient, kitchenClient, cashierClient);
  await Promise.all([
    waiterClient.auth.setSession({ access_token: waiterA.token, refresh_token: waiterA.refreshToken }),
    kitchenClient.auth.setSession({ access_token: kitchenA.token, refresh_token: kitchenA.refreshToken }),
    cashierClient.auth.setSession({ access_token: cashierA.token, refresh_token: cashierA.refreshToken }),
  ]);
  waiterClient.realtime.setAuth(waiterA.token);
  kitchenClient.realtime.setAuth(kitchenA.token);
  cashierClient.realtime.setAuth(cashierA.token);
  const events = { waiter: [], kitchen: [], cashier: [] };
  const channels = [
    waiterClient.channel(`qa-waiter-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${workingOrder.id}` }, (p) => events.waiter.push(['orders', p]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${workingOrder.id}` }, (p) => events.waiter.push(['items', p]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, (p) => events.waiter.push(['tables', p])),
    kitchenClient.channel(`qa-kitchen-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${workingOrder.id}` }, (p) => events.kitchen.push(['orders', p]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${workingOrder.id}` }, (p) => events.kitchen.push(['items', p]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item_batches', filter: `order_id=eq.${workingOrder.id}` }, (p) => events.kitchen.push(['batches', p])),
    cashierClient.channel(`qa-cashier-${suffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${workingOrder.id}` }, (p) => events.cashier.push(['orders', p]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${workingOrder.id}` }, (p) => events.cashier.push(['payments', p])),
  ];
  await Promise.all(channels.map((channel) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), 12_000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); }
      if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timeout); reject(new Error(status)); }
    });
  })));

  const targetBatch = batches[0];
  const statusRace = await Promise.all([
    edge('orders', kitchenA.token, `/${workingOrder.id}/batches/${targetBatch.id}/start`, { method: 'POST', body: {}, allowError: true }),
    edge('orders', kitchenB.token, `/${workingOrder.id}/batches/${targetBatch.id}/ready`, { method: 'POST', body: {}, allowError: true }),
  ]);
  assert.ok(statusRace.some(({ status }) => status === 200));
  const batchAfterRace = (await rows('order_item_batches', `id=eq.${targetBatch.id}&select=status`))[0];
  assert.ok(['PREPARING', 'READY'].includes(batchAfterRace.status));
  if (batchAfterRace.status === 'PREPARING') {
    await edge('orders', kitchenA.token, `/${workingOrder.id}/batches/${targetBatch.id}/ready`, { method: 'POST', body: {} });
  }
  await waitFor(
    () => events.waiter.some(([type]) => type === 'items') && events.kitchen.length > 0,
    `Kitchen changes were not delivered (waiter=${events.waiter.length}, kitchen=${events.kitchen.length})`,
  );
  results.kitchenStatusRace = true;
  results.realtimeKitchenDelivery = true;

  // Prepare an independent fulfilled order for the critical payment race.
  const paymentOrderResponse = await createOrder(waiterA.token, { tableId: tables[1].id, key: `payment-order-${suffix}`, quantity: 2 });
  assert.equal(paymentOrderResponse.status, 201);
  const paymentOrder = paymentOrderResponse.payload.data;
  const paymentBatches = await rows('order_item_batches', `order_id=eq.${paymentOrder.id}&select=id`);
  for (const batch of paymentBatches) {
    await edge('orders', kitchenA.token, `/${paymentOrder.id}/batches/${batch.id}/start`, { method: 'POST', body: {} });
    await edge('orders', kitchenA.token, `/${paymentOrder.id}/batches/${batch.id}/ready`, { method: 'POST', body: {} });
  }
  await edge('orders', waiterA.token, `/${paymentOrder.id}/serve`, { method: 'POST', body: {} });
  const detail = (await edge('orders', waiterA.token, `/${paymentOrder.id}`)).payload.data;
  const paymentBody = (key) => ({ orderId: paymentOrder.id, paymentMethod: 'CASH', finalAmount: Number(detail.total), receivedAmount: Number(detail.total), idempotencyKey: key });
  const paymentRace = await Promise.all([
    edge('payments', cashierA.token, '', { method: 'POST', body: paymentBody(`pay-a-${suffix}`), allowError: true }),
    edge('payments', cashierB.token, '', { method: 'POST', body: paymentBody(`pay-b-${suffix}`), allowError: true }),
  ]);
  assert.deepEqual(paymentRace.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await rows('payments', `order_id=eq.${paymentOrder.id}&status=eq.PAID&select=id`)).length, 1);
  assert.equal((await rows('receipts', `order_id=eq.${paymentOrder.id}&select=id`)).length, 1);
  results.paymentRace = true;

  // Table move race: one source order cannot land at two destinations.
  const moveRace = await Promise.all([
    edge('tables', waiterA.token, '/move-order', { method: 'POST', body: { orderId: tableRaceOrders[0].id, destinationTableId: tables[2].id, expectedSourceTableId: tables[0].id, operationKey: `move-a-${suffix}` }, allowError: true }),
    edge('tables', waiterB.token, '/move-order', { method: 'POST', body: { orderId: tableRaceOrders[0].id, destinationTableId: tables[3].id, expectedSourceTableId: tables[0].id, operationKey: `move-b-${suffix}` }, allowError: true }),
  ]);
  assert.deepEqual(moveRace.map(({ status }) => status).sort(), [200, 409]);
  const movedOrder = (await rows('orders', `id=eq.${tableRaceOrders[0].id}&select=restaurant_table_id`))[0];
  assert.ok([tables[2].id, tables[3].id].includes(movedOrder.restaurant_table_id));
  assert.equal((await rows('restaurant_tables', `id=in.(${tables[2].id},${tables[3].id})&status=eq.OCCUPIED&select=id`)).length, 1);
  assert.equal((await rows('table_activity_logs', `order_id=eq.${tableRaceOrders[0].id}&action=in.(ORDER_MOVED_IN,ORDER_MOVED_OUT)&select=id`)).length, 2);
  results.tableMoveRace = true;

  // Reconnect: disconnect, mutate, reconnect, then recover database truth.
  waiterClient.realtime.disconnect();
  await request(`/rest/v1/products?id=eq.${products[0].id}`, { method: 'PATCH', key: serviceKey, body: { is_available: false } });
  waiterClient.realtime.connect();
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const recoveredProduct = (await rows('products', `id=eq.${products[0].id}&select=is_available`))[0];
  assert.equal(recoveredProduct.is_available, false);
  results.reconnectAuthoritativeRecovery = true;

  // Business identifiers are unique and generated by the database.
  const identifiers = {
    orders: (await rows('orders', `id=in.(${fixture.orderIds.join(',')})&select=order_number`)).map(({ order_number }) => order_number),
    payments: (await rows('payments', `order_id=in.(${fixture.orderIds.join(',')})&payment_number=not.is.null&select=payment_number`)).map(({ payment_number }) => payment_number),
    receipts: (await rows('receipts', `order_id=in.(${fixture.orderIds.join(',')})&select=receipt_number`)).map(({ receipt_number }) => receipt_number),
    batches: (await rows('order_item_batches', `order_id=in.(${fixture.orderIds.join(',')})&select=batch_number`)).map(({ batch_number }) => batch_number),
  };
  for (const [name, values] of Object.entries(identifiers)) {
    assert.equal(new Set(values).size, values.length, `Duplicate ${name} identifier`);
    assert.ok(values.every(Boolean), `Missing ${name} identifier`);
  }
  results.sequenceUniqueness = true;

  console.log(JSON.stringify({ suffix, results, eventCounts: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, value.length])) }));
} finally {
  for (const client of realtimeClients) {
    await Promise.all(client.getChannels().map((channel) => client.removeChannel(channel)));
    client.realtime.disconnect();
  }
  await cleanup();
}
