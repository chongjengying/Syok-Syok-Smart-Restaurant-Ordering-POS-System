import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
const baseUrl = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;

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
  const payload = await response.json().catch(() => null);
  if (!response.ok && !allowError) {
    throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return allowError ? { status: response.status, payload } : payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const category = (await request('/rest/v1/categories', {
  method: 'POST',
  key: serviceKey,
  body: { name: `Phase 6 ${suffix}` },
}))[0];
const [availableProduct, unavailableProduct] = await request('/rest/v1/products', {
  method: 'POST',
  key: serviceKey,
  body: [
    { category_id: category.id, product_name: `Phase 6 Meal ${suffix}`, cost_price: 3, sell_price: 12.5, status: true },
    { category_id: category.id, product_name: `Disabled Meal ${suffix}`, cost_price: 3, sell_price: 99, status: false },
  ],
});
const [successTable, rollbackTable] = await request('/rest/v1/restaurant_tables', {
  method: 'POST',
  key: serviceKey,
  body: [
    { table_number: `P6-${suffix}`, capacity: 4, area: 'Phase 6', status: 'AVAILABLE', is_active: true },
    { table_number: `RB-${suffix}`, capacity: 4, area: 'Phase 6', status: 'AVAILABLE', is_active: true },
  ],
});
const auth = await request('/auth/v1/signup', {
  method: 'POST',
  body: {
    email: `phase6-${suffix}@example.com`,
    password: `Phase6-${suffix}-Pass!`,
    data: { full_name: 'Phase 6 RPC Test' },
  },
});
assert.ok(auth.access_token, 'Test user did not receive an access token');
await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
  method: 'PATCH',
  key: serviceKey,
  body: { role_name: 'ADMIN', status: 'ACTIVE' },
});

const rpc = (body, allowError = false) => request('/rest/v1/rpc/place_order', {
  method: 'POST', token: auth.access_token, body, allowError,
});
const orderCount = async () => Number((await request(
  `/rest/v1/orders?user_id=eq.${auth.user.id}&select=id`,
  { key: serviceKey },
)).length);

const beforeRollbackChecks = await orderCount();
const rejectedProduct = await rpc({
  p_items: [
    { productId: availableProduct.id, quantity: 1, optionIds: [] },
    { productId: unavailableProduct.id, quantity: 1, optionIds: [] },
  ],
  p_payment_method: 'CASH',
  p_dining_mode: 'dine-in',
  p_table_id: rollbackTable.id,
  p_idempotency_key: `rollback-product-${suffix}`,
}, true);
assert.equal(rejectedProduct.status, 400, 'Unavailable product was accepted');
assert.match(JSON.stringify(rejectedProduct.payload), /PRODUCT_NOT_AVAILABLE/);
assert.equal(await orderCount(), beforeRollbackChecks, 'Failed RPC left a partial order');
const rollbackTableState = await request(
  `/rest/v1/restaurant_tables?id=eq.${rollbackTable.id}&select=status`,
  { key: serviceKey },
);
assert.equal(rollbackTableState[0].status, 'AVAILABLE', 'Failed RPC occupied the table');

const rejectedQuantity = await rpc({
  p_items: [{ productId: availableProduct.id, quantity: 0, optionIds: [] }],
  p_payment_method: 'CASH',
  p_dining_mode: 'takeaway',
  p_table_id: null,
  p_idempotency_key: `rollback-quantity-${suffix}`,
}, true);
assert.equal(rejectedQuantity.status, 400, 'Invalid quantity was accepted');
assert.match(JSON.stringify(rejectedQuantity.payload), /INVALID_ITEM_QUANTITY/);
assert.equal(await orderCount(), beforeRollbackChecks, 'Invalid quantity left a partial order');

const dineInInput = {
  p_items: [{ productId: availableProduct.id, quantity: 2, optionIds: [], specialRequest: 'Phase 6 test' }],
  p_payment_method: 'CASH',
  p_dining_mode: 'dine-in',
  p_table_id: successTable.id,
  p_idempotency_key: `success-${suffix}`,
};
const placed = await rpc(dineInInput);
assert.equal(placed.status, 'CONFIRMED');
assert.equal(placed.payment_status, 'UNPAID');
assert.equal(Number(placed.subtotal), 25, 'Subtotal did not use authoritative product pricing');

const replayed = await rpc(dineInInput);
assert.equal(replayed.id, placed.id, 'Idempotent retry created another order');
assert.equal(await orderCount(), beforeRollbackChecks + 1, 'Successful retry duplicated the order');

const [persistedItem] = await request(
  `/rest/v1/order_items?order_id=eq.${placed.id}&select=quantity,unit_price,subtotal,product_name_snapshot`,
  { key: serviceKey },
);
assert.equal(Number(persistedItem.unit_price), 12.5, 'order_items.unit_price did not snapshot the transaction price');
assert.equal(Number(persistedItem.subtotal), 25);
assert.equal((await request(
  `/rest/v1/restaurant_tables?id=eq.${successTable.id}&select=status`,
  { key: serviceKey },
))[0].status, 'OCCUPIED', 'Successful dine-in order did not occupy its table');

await request(`/rest/v1/products?id=eq.${availableProduct.id}`, {
  method: 'PATCH', key: serviceKey, body: { sell_price: 20 },
});
const [historicalItem] = await request(
  `/rest/v1/order_items?order_id=eq.${placed.id}&select=unit_price`,
  { key: serviceKey },
);
assert.equal(Number(historicalItem.unit_price), 12.5, 'Historical item price changed with the product price');

const occupiedBefore = await orderCount();
const occupiedAttempt = await rpc({
  ...dineInInput,
  p_idempotency_key: `occupied-${suffix}`,
}, true);
assert.equal(occupiedAttempt.status, 400, 'Occupied table accepted an unrelated order');
assert.match(JSON.stringify(occupiedAttempt.payload), /TABLE_NOT_AVAILABLE|ACTIVE_ORDER_EXISTS/);
assert.equal(await orderCount(), occupiedBefore, 'Occupied-table rejection left a partial order');

const invalidTakeawayTable = await rpc({
  p_items: [{ productId: availableProduct.id, quantity: 1, optionIds: [] }],
  p_payment_method: 'CASH',
  p_dining_mode: 'takeaway',
  p_table_id: rollbackTable.id,
  p_idempotency_key: `takeaway-table-${suffix}`,
}, true);
assert.equal(invalidTakeawayTable.status, 400, 'Takeaway accepted a restaurant table');
assert.match(JSON.stringify(invalidTakeawayTable.payload), /INVALID_TABLE_ID/);

console.log(JSON.stringify({
  rpc: 'place_order',
  atomicRollback: true,
  tableLocking: true,
  authoritativePricing: true,
  historicalUnitPrice: true,
  unavailableProductRejected: true,
  invalidQuantityRejected: true,
  idempotentRetry: true,
}));
