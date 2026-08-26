import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.STAGING_SUPABASE_URL;
const anonKey = process.env.STAGING_PUBLISHABLE_KEY;
const serviceKey = process.env.STAGING_SERVICE_KEY;
if (!baseUrl || !anonKey || !serviceKey) throw new Error('Staging URL and keys are required.');

const suffix = crypto.randomUUID().slice(0, 8);
const password = `Performance-${suffix}-Pass!`;
const fixture = { users: [], categories: [], products: [], orders: [] };
const measurements = {};

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function summary(samples) {
  const durations = samples.map(({ ms }) => ms);
  return {
    samples: samples.length,
    minMs: Number(Math.min(...durations).toFixed(1)),
    medianMs: Number(percentile(durations, 0.5).toFixed(1)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
    maxMs: Number(Math.max(...durations).toFixed(1)),
    averageBytes: Math.round(samples.reduce((sum, row) => sum + row.bytes, 0) / samples.length),
  };
}

async function request(path, { method = 'GET', key = anonKey, token = key, body, allowError = false } = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  const result = { status: response.status, payload: raw ? JSON.parse(raw) : null, ms: performance.now() - started, bytes: Buffer.byteLength(raw) };
  if (!response.ok && !allowError) throw new Error(`${method} ${path}: ${response.status} ${raw.slice(0, 300)}`);
  return result;
}

const edge = (name, token, path = '', options = {}) => request(`/functions/v1/${name}${path}`, { ...options, token });
const item = (productId) => ({ productId, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' });

async function createStaff(ordinal) {
  const email = `perf-${ordinal}-${suffix}@example.invalid`;
  const created = await request('/auth/v1/admin/users', { method: 'POST', key: serviceKey, body: { email, password, email_confirm: true } });
  const id = created.payload.id ?? created.payload.user.id;
  fixture.users.push(id);
  await request(`/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', key: serviceKey, body: { role_name: 'MANAGER', status: 'ACTIVE' } });
  const login = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return { id, email, token: login.payload.access_token, refreshToken: login.payload.refresh_token, login };
}

async function sample(count, operation) {
  const rows = [];
  for (let index = 0; index < count; index += 1) rows.push(await operation(index));
  return summary(rows);
}

async function createOrder(token, size = 1, key = crypto.randomUUID()) {
  const response = await edge('orders', token, '', {
    method: 'POST',
    body: { items: Array.from({ length: size }, (_, index) => item(fixture.products[index % fixture.products.length])), paymentMethod: 'CASH', diningMode: 'takeaway', tableId: null, idempotencyKey: key },
  });
  fixture.orders.push(response.payload.data.id);
  return response;
}

async function cleanup() {
  if (fixture.orders.length) {
    const ids = fixture.orders.join(',');
    const nested = async (table, query) => (await request(`/rest/v1/${table}?${query}`, { key: serviceKey, allowError: true })).payload || [];
    const paymentIds = (await nested('payments', `order_id=in.(${ids})&select=id`)).map(({ id }) => id);
    const itemIds = (await nested('order_items', `order_id=in.(${ids})&select=id`)).map(({ id }) => id);
    for (const [table, filter] of [
      ['receipts', `order_id=in.(${ids})`],
      ['payment_items', `payment_id=in.(${paymentIds.join(',') || crypto.randomUUID()})`],
      ['payments', `order_id=in.(${ids})`],
      ['order_submissions', `order_id=in.(${ids})`],
      ['order_item_options', `order_item_id=in.(${itemIds.join(',') || crypto.randomUUID()})`],
      ['order_item_batches', `order_id=in.(${ids})`],
      ['order_status_history', `order_id=in.(${ids})`],
      ['order_items', `order_id=in.(${ids})`],
      ['orders', `id=in.(${ids})`],
    ]) await request(`/rest/v1/${table}?${filter}`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
  for (let index = 0; index < fixture.products.length; index += 100) {
    await request(`/rest/v1/products?id=in.(${fixture.products.slice(index, index + 100).join(',')})`, { method: 'DELETE', key: serviceKey, allowError: true });
  }
  for (const id of fixture.categories) await request(`/rest/v1/categories?id=eq.${id}`, { method: 'DELETE', key: serviceKey, allowError: true });
  for (const id of fixture.users) await request(`/auth/v1/admin/users/${id}`, { method: 'DELETE', key: serviceKey, allowError: true });
}

const realtimeClients = [];
try {
  const users = [];
  for (let index = 1; index <= 10; index += 1) users.push(await createStaff(index));
  const manager = users[0];
  measurements.login = await sample(5, () => request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: manager.email, password } }));

  const categoryRows = [];
  for (let index = 1; index <= 10; index += 1) categoryRows.push({ name: `Performance ${suffix} ${index}`, description: 'Temporary performance fixture', status: true });
  const insertedCategories = (await request('/rest/v1/categories', { method: 'POST', key: serviceKey, body: categoryRows })).payload;
  fixture.categories.push(...insertedCategories.map(({ id }) => id));

  for (let start = 0; start < 500; start += 100) {
    const rows = Array.from({ length: 100 }, (_, offset) => ({
      category_id: fixture.categories[Math.floor((start + offset) / 50)],
      product_name: `Perf ${suffix} ${String(start + offset + 1).padStart(3, '0')}`,
      description: 'Temporary performance product', cost_price: 1, sell_price: 5, status: true, is_available: true,
    }));
    const inserted = (await request('/rest/v1/products', { method: 'POST', key: serviceKey, body: rows })).payload;
    fixture.products.push(...inserted.map(({ id }) => id));
  }
  assert.equal(fixture.products.length, 500);

  await edge('products', manager.token, '?limit=50&offset=0');
  measurements.categories = await sample(5, () => edge('products', manager.token, '/categories?activeOnly=true'));
  for (const limit of [50, 100, 200]) measurements[`products${limit}`] = await sample(5, () => edge('products', manager.token, `?limit=${limit}&offset=0`));
  measurements.productsCategory50 = await sample(5, () => edge('products', manager.token, `?categoryId=${fixture.categories[0]}&limit=50&offset=0`));
  const fullSamples = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now(); let bytes = 0;
    for (const offset of [0, 200, 400]) { const page = await edge('products', manager.token, `?limit=200&offset=${offset}`); bytes += page.bytes; }
    fullSamples.push({ ms: performance.now() - started, bytes });
  }
  measurements.products500ThreePages = summary(fullSamples);
  const parallelSamples = [];
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    const first = await edge('products', manager.token, '?limit=200&offset=0');
    const remaining = await Promise.all([200, 400].map((offset) => edge('products', manager.token, `?limit=200&offset=${offset}`)));
    parallelSamples.push({ ms: performance.now() - started, bytes: first.bytes + remaining.reduce((sum, row) => sum + row.bytes, 0) });
  }
  measurements.products500ParallelPages = summary(parallelSamples);
  measurements.tables = await sample(5, () => edge('tables', manager.token));

  for (const size of [1, 10, 30, 100]) measurements[`createOrder${size}Items`] = summary([await createOrder(manager.token, size, `size-${size}-${suffix}`)]);

  let active = 4;
  for (const target of [10, 30, 100]) {
    while (active < target) {
      const batch = Math.min(10, target - active);
      await Promise.all(Array.from({ length: batch }, (_, index) => createOrder(users[(active + index) % users.length].token, 1)));
      active += batch;
    }
    measurements[`kitchenQueue${target}`] = await sample(3, () => edge('orders', manager.token));
  }

  for (const concurrency of [2, 5, 10]) {
    const runs = [];
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const started = performance.now();
      const responses = await Promise.all(users.slice(0, concurrency).map((user) => edge('products', user.token, '?limit=100&offset=0')));
      runs.push({ ms: performance.now() - started, bytes: responses.reduce((sum, row) => sum + row.bytes, 0) });
    }
    measurements[`concurrentUsers${concurrency}`] = summary(runs);
  }

  const client = createClient(baseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  realtimeClients.push(client);
  await client.auth.setSession({ access_token: manager.token, refresh_token: manager.refreshToken });
  client.realtime.setAuth(manager.token);
  let eventAt = 0;
  const channel = client.channel(`performance-${suffix}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => { eventAt = performance.now(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 12_000);
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } });
  });
  const realtimeStarted = performance.now();
  const realtimeOrder = await createOrder(manager.token, 1, `realtime-${suffix}`);
  const responseAt = performance.now();
  while (!eventAt && performance.now() - realtimeStarted < 12_000) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(eventAt);
  measurements.realtime = {
    requestMs: Number((responseAt - realtimeStarted).toFixed(1)),
    eventFromStartMs: Number((eventAt - realtimeStarted).toFixed(1)),
    eventAfterResponseMs: Number((eventAt - responseAt).toFixed(1)),
    responseBytes: realtimeOrder.bytes,
  };

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  measurements.dailyReport = await sample(5, () => edge('payments', manager.token, `/report/daily?dateFrom=${from}&dateTo=${today}`));
  measurements.productReport = await sample(5, () => edge('payments', manager.token, `/report/products?dateFrom=${from}&dateTo=${today}`));

  console.log(JSON.stringify({ suffix, dataset: { products: 500, categories: 10, activeOrders: 101, users: 10 }, measurements }, null, 2));
} finally {
  for (const client of realtimeClients) {
    await Promise.all(client.getChannels().map((channel) => client.removeChannel(channel)));
    client.realtime.disconnect();
  }
  await cleanup();
}
