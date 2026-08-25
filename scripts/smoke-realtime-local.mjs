import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
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
let categoryId = null;
let productId = null;
let authUserId = null;
let realtime = null;
let channel = null;

try {
  const [category] = await request('/rest/v1/categories', {
    method: 'POST',
    key: serviceKey,
    body: { name: `Realtime QA ${suffix}`, description: 'Self-cleaning realtime test' },
  });
  categoryId = category.id;

  const [product] = await request('/rest/v1/products', {
    method: 'POST',
    key: serviceKey,
    body: {
      category_id: categoryId,
      product_name: `Realtime Product ${suffix}`,
      cost_price: 1,
      sell_price: 2,
      status: true,
      is_available: true,
    },
  });
  productId = product.id;

  const auth = await request('/auth/v1/signup', {
    method: 'POST',
    body: {
      email: `realtime-${suffix}@example.com`,
      password: `Realtime-${suffix}-Pass!`,
      data: { full_name: 'Realtime QA User' },
    },
  });
  authUserId = auth.user.id;

  realtime = createClient(baseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await realtime.auth.setSession({ access_token: auth.access_token, refresh_token: auth.refresh_token });

  let updateTimeout;
  let realtimeUpdateHandler;
  const updateReceived = new Promise((resolve, reject) => {
    updateTimeout = setTimeout(() => reject(new Error('Product update was not delivered through Realtime.')), 8_000);
    realtimeUpdateHandler = (payload) => {
      clearTimeout(updateTimeout);
      resolve(payload);
    };
  });

  const subscribed = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out.')), 8_000);
    channel = realtime
      .channel(`catalog-qa-${suffix}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products', filter: `id=eq.${productId}` }, (payload) => realtimeUpdateHandler(payload))
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          clearTimeout(timeout);
          resolve();
        } else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(state)) {
          clearTimeout(timeout);
          reject(new Error(`Realtime subscription failed: ${state}`));
        }
      });
  });
  await subscribed;

  await request(`/rest/v1/products?id=eq.${productId}`, {
    method: 'PATCH',
    key: serviceKey,
    body: { is_available: false },
  });
  const payload = await updateReceived;
  assert.equal(payload.new.id, productId);
  assert.equal(payload.new.is_available, false);

  console.log(JSON.stringify({ catalogPublication: true, authenticatedDelivery: true, soldOutUpdateDelivered: true }));
} finally {
  if (realtime && channel) await realtime.removeChannel(channel);
  if (realtime) realtime.realtime.disconnect();
  if (productId) await request(`/rest/v1/products?id=eq.${productId}`, { method: 'DELETE', key: serviceKey });
  if (categoryId) await request(`/rest/v1/categories?id=eq.${categoryId}`, { method: 'DELETE', key: serviceKey });
  if (authUserId) await request(`/auth/v1/admin/users/${authUserId}`, { method: 'DELETE', key: serviceKey });
}
