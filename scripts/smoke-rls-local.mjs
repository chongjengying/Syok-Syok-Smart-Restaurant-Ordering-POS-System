import assert from 'node:assert/strict';
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
  return { response, payload };
}

async function successful(path, options) {
  const result = await request(path, options);
  if (!result.response.ok) {
    throw new Error(`${options?.method || 'GET'} ${path}: ${result.response.status} ${JSON.stringify(result.payload)}`);
  }
  return result.payload;
}

const suffix = crypto.randomUUID().slice(0, 8);
const createdUserIds = [];
const fixture = { categoryIds: [], productIds: [], orderIds: [], tableId: null };

async function createStaff(role) {
  const auth = await successful('/auth/v1/signup', {
    method: 'POST',
    body: {
      email: `${role.toLowerCase()}-rls-${suffix}@example.com`,
      password: `Rls-${role}-${suffix}-Pass!`,
      data: { full_name: `${role} RLS Test` },
    },
  });
  createdUserIds.push(auth.user.id);
  await successful(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH', key: serviceKey, body: { role_name: role, status: 'ACTIVE' },
  });
  return { id: auth.user.id, token: auth.access_token };
}

try {
  const users = Object.fromEntries(await Promise.all(
    ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN', 'CASHIER'].map(async (role) => [role, await createStaff(role)]),
  ));

  const anonymousCatalog = await request('/rest/v1/categories?select=id');
  assert.ok(anonymousCatalog.response.status >= 400, 'anon unexpectedly read menu data');

  const [category] = await successful('/rest/v1/categories', {
    method: 'POST', key: serviceKey,
    body: { name: `RLS Menu ${suffix}`, description: 'Temporary Phase 15 fixture' },
  });
  fixture.categoryIds.push(category.id);
  const products = await successful('/rest/v1/products', {
    method: 'POST', key: serviceKey,
    body: [
      { category_id: category.id, product_name: `Active ${suffix}`, cost_price: 2, sell_price: 8, status: true },
      { category_id: category.id, product_name: `Inactive ${suffix}`, cost_price: 2, sell_price: 9, status: false },
    ],
  });
  const activeProduct = products.find(({ status: isActive }) => isActive);
  const inactiveProduct = products.find(({ status: isActive }) => !isActive);
  fixture.productIds.push(...products.map(({ id }) => id));

  const waiterProducts = await successful('/rest/v1/products?select=id,status', { token: users.WAITER.token });
  assert.ok(waiterProducts.some(({ id }) => id === activeProduct.id), 'WAITER cannot read active products');
  assert.ok(!waiterProducts.some(({ id }) => id === inactiveProduct.id), 'WAITER can read inactive products');
  const managerProducts = await successful('/rest/v1/products?select=id,status', { token: users.MANAGER.token });
  assert.ok(managerProducts.some(({ id }) => id === inactiveProduct.id), 'MANAGER cannot manage inactive products');

  const waiterCategoryWrite = await request('/rest/v1/categories', {
    method: 'POST', token: users.WAITER.token, body: { name: `Forbidden ${suffix}` },
  });
  assert.equal(waiterCategoryWrite.response.status, 403, 'WAITER created a category');
  const [managerCategory] = await successful('/rest/v1/categories', {
    method: 'POST', token: users.MANAGER.token, body: { name: `Manager ${suffix}` },
  });
  fixture.categoryIds.push(managerCategory.id);

  const [table] = await successful('/rest/v1/restaurant_tables', {
    method: 'POST', key: serviceKey,
    body: { table_number: `RLS-${suffix}`, capacity: 2, area: 'RLS Test', status: 'AVAILABLE', is_active: true },
  });
  fixture.tableId = table.id;
  const tableRows = await successful('/rest/v1/restaurant_tables?select=id', { token: users.KITCHEN.token });
  assert.ok(tableRows.some(({ id }) => id === table.id), 'KITCHEN cannot read table labels for tickets');
  const disabledTable = await successful(`/functions/v1/tables/${table.id}/out-of-service`, {
    method: 'POST', token: users.MANAGER.token,
    body: { reason: 'Canonical status verification', operationKey: `disable-${suffix}` },
  });
  assert.equal(disabledTable.data.status, 'DISABLED', 'Table did not persist canonical DISABLED status');
  const restoredTable = await successful(`/functions/v1/tables/${table.id}/restore`, {
    method: 'POST', token: users.MANAGER.token,
    body: { operationKey: `restore-${suffix}` },
  });
  assert.equal(restoredTable.data.status, 'AVAILABLE', 'Disabled table could not be restored');

  const orders = await successful('/rest/v1/orders', {
    method: 'POST', key: serviceKey,
    body: [
      {
        order_number: `RLS-ACTIVE-${suffix}`, user_id: users.ADMIN.id, subtotal: 8, tax: 0,
        service_charge: 0, total: 8, status: 'CONFIRMED', payment_status: 'UNPAID', dining_mode: 'takeaway',
      },
      {
        order_number: `RLS-DONE-${suffix}`, user_id: users.ADMIN.id, subtotal: 9, tax: 0,
        service_charge: 0, total: 9, status: 'COMPLETED', payment_status: 'PAID', dining_mode: 'takeaway',
      },
      {
        order_number: `RLS-PAY-${suffix}`, user_id: users.ADMIN.id, subtotal: 8, tax: 0,
        service_charge: 0, total: 8, status: 'SERVED', payment_status: 'UNPAID', dining_mode: 'takeaway',
      },
    ],
  });
  fixture.orderIds.push(...orders.map(({ id }) => id));
  const [activeOrder, completedOrder, payableOrder] = orders;
  await successful('/rest/v1/payments', {
    method: 'POST', key: serviceKey,
    body: [
      {
        order_id: completedOrder.id, user_id: users.ADMIN.id, payment_method: 'CASH',
        amount: 9, status: 'PAID', paid_at: new Date().toISOString(),
      },
      { order_id: payableOrder.id, user_id: users.ADMIN.id, payment_method: 'CASH', amount: 8, status: 'PENDING', paid_at: null },
    ],
  });

  const kitchenOrders = await successful('/rest/v1/orders?select=id', { token: users.KITCHEN.token });
  assert.ok(kitchenOrders.some(({ id }) => id === activeOrder.id), 'KITCHEN cannot read an active kitchen order');
  assert.ok(!kitchenOrders.some(({ id }) => id === completedOrder.id), 'KITCHEN can read completed order history');
  assert.deepEqual(await successful('/rest/v1/payments?select=id', { token: users.KITCHEN.token }), [], 'KITCHEN can read payments');
  assert.deepEqual(await successful('/rest/v1/payments?select=id', { token: users.WAITER.token }), [], 'WAITER can read payments');
  const cashierPayments = await successful('/rest/v1/payments?select=order_id,status', { token: users.CASHIER.token });
  assert.ok(cashierPayments.some(({ order_id: orderId }) => orderId === completedOrder.id), 'CASHIER cannot read payments');

  const waiterOrderWrite = await request(`/rest/v1/orders?id=eq.${activeOrder.id}`, {
    method: 'PATCH', token: users.WAITER.token, body: { discount: 1 },
  });
  assert.deepEqual(waiterOrderWrite.payload, [], 'WAITER bypassed the transactional order RPC boundary');
  const [unchangedOrder] = await successful(`/rest/v1/orders?id=eq.${activeOrder.id}&select=discount`, { key: serviceKey });
  assert.equal(Number(unchangedOrder.discount), 0, 'Denied WAITER update changed the order');

  const waiterPayment = await request('/rest/v1/rpc/complete_payment', {
    method: 'POST', token: users.WAITER.token,
    body: {
      p_order_id: payableOrder.id, p_payment_method: 'CASH', p_final_amount: 8,
      p_idempotency_key: `waiter-${suffix}`, p_provider: 'RLS_TEST', p_transaction_reference: null,
    },
  });
  assert.ok([400, 403].includes(waiterPayment.response.status), 'WAITER completed payment');
  assert.match(
    JSON.stringify(waiterPayment.payload),
    /INSUFFICIENT_PERMISSION|permission denied/i,
    'Database did not report the payment role violation',
  );

  const managerReport = await successful(
    `/rest/v1/daily_sales_report?payment_id=eq.${(await successful(`/rest/v1/payments?order_id=eq.${completedOrder.id}&select=id`, { key: serviceKey }))[0].id}`,
    { token: users.MANAGER.token },
  );
  assert.equal(managerReport.length, 1, 'MANAGER cannot read sales reports');
  assert.deepEqual(
    await successful('/rest/v1/daily_sales_report?select=payment_id', { token: users.CASHIER.token }),
    [],
    'CASHIER can read manager reports',
  );

  const managerProfiles = await successful('/rest/v1/profiles?select=id', { token: users.MANAGER.token });
  assert.deepEqual(managerProfiles.map(({ id }) => id), [users.MANAGER.id], 'MANAGER can enumerate staff profiles');
  const adminProfiles = await successful('/rest/v1/profiles?select=id', { token: users.ADMIN.token });
  assert.ok(createdUserIds.every((id) => adminProfiles.some((profile) => profile.id === id)), 'ADMIN lacks full profile access');

  console.log(JSON.stringify({
    anonymousDenied: true,
    adminFullAccess: true,
    managerCatalogAndReports: true,
    waiterOrdersAndServingOnly: true,
    kitchenActiveOrdersOnly: true,
    cashierOrdersAndPayments: true,
    disabledTableLifecycle: true,
    directOperationalWritesDenied: true,
    waiterPaymentDeniedByDatabase: true,
  }));
} finally {
  if (fixture.orderIds.length) {
    await request(`/rest/v1/payments?order_id=in.(${fixture.orderIds.join(',')})`, { method: 'DELETE', key: serviceKey });
    await request(`/rest/v1/orders?id=in.(${fixture.orderIds.join(',')})`, { method: 'DELETE', key: serviceKey });
  }
  if (fixture.tableId) {
    await request(`/rest/v1/restaurant_tables?id=eq.${fixture.tableId}`, { method: 'DELETE', key: serviceKey });
  }
  if (fixture.categoryIds.length) {
    if (fixture.productIds.length) {
      await request(`/rest/v1/products?id=in.(${fixture.productIds.join(',')})`, { method: 'DELETE', key: serviceKey });
    }
    await request(`/rest/v1/categories?id=in.(${fixture.categoryIds.join(',')})`, { method: 'DELETE', key: serviceKey });
  }
  for (const userId of createdUserIds) {
    await request(`/auth/v1/admin/users/${userId}`, { method: 'DELETE', key: serviceKey });
    await request(`/rest/v1/profiles?id=eq.${userId}`, { method: 'DELETE', key: serviceKey });
  }
}
