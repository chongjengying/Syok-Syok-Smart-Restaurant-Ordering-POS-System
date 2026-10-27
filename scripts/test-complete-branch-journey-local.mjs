import assert from 'node:assert/strict';
import { createHmac, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');
const appUrl = 'http://127.0.0.1:5173';
assert.equal(new URL(appUrl).hostname, '127.0.0.1');
const run = crypto.randomUUID().slice(0, 8).toUpperCase();
const created = { adminAuthId: null, branchId: null, terminalId: null, orderId: null, shiftId: null };
let browser;

async function request(path, { token = local.SERVICE_ROLE_KEY, body, method = body === undefined ? 'GET' : 'POST', proof, expected } = {}) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: {
      apikey: local.ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(proof ? { 'x-pos-device-credential': proof } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  const failure = `${method} ${path} returned HTTP ${response.status}: ${payload?.code || ''} ${payload?.message || payload?.error || ''}`;
  if (Array.isArray(expected)) assert.ok(expected.includes(response.status), failure);
  else if (expected !== undefined) assert.equal(response.status, expected, failure);
  else assert.ok(response.ok, failure);
  return { status: response.status, payload };
}
const service = (path, options) => request(path, options);
const actor = (token, proof) => (path, options = {}) => request(path, { ...options, token, proof });
const rpc = (call, name, body, expected) => call(`/rest/v1/rpc/${name}`, { body, expected });
const rows = async (table, query = '') => (await service(`/rest/v1/${table}?${query}`)).payload;
const digitButtons = async (page, pin) => {
  for (const digit of pin) await page.getByRole('button', { name: `Enter ${digit}`, exact: true }).click();
};

try {
  const [home] = await rows('branches', 'status=eq.ACTIVE&select=id,company_id&order=created_at.asc&limit=1');
  assert.ok(home?.id, 'A local company with an active branch is required');
  const adminEmail = `acceptance-admin-${run.toLowerCase()}@example.invalid`;
  const adminPassword = crypto.randomUUID() + crypto.randomUUID();
  const adminAuth = (await service('/auth/v1/admin/users', { body: { email: adminEmail, password: adminPassword, email_confirm: true } })).payload;
  created.adminAuthId = adminAuth.id;
  const [adminRole] = await rows('roles', `company_id=eq.${home.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id`);
  assert.ok(adminRole?.id, 'Company ADMIN role is required');
  await service(`/rest/v1/profiles?id=eq.${adminAuth.id}`, { method: 'PATCH', body: {
    name: 'Local acceptance administrator', company_id: home.company_id, branch_id: home.id,
    role_id: adminRole.id, role_name: 'ADMIN', status: 'ACTIVE',
  } });
  const adminToken = (await request('/auth/v1/token?grant_type=password', {
    token: local.ANON_KEY, body: { email: adminEmail, password: adminPassword },
  })).payload.access_token;
  const admin = actor(adminToken);

  const branch = (await rpc(admin, 'save_branch', {
    p_id: null, p_payload: { code: `QA${run}`, name: `Local POS acceptance ${run}`, address: 'Local acceptance fixture', phone: '+60123456789', status: 'ACTIVE', timezone: 'Asia/Kuala_Lumpur' }, p_expected_revision: null,
  })).payload;
  created.branchId = branch.id;
  assert.equal(branch.company_id, home.company_id);
  const terminal = (await rpc(admin, 'save_pos_terminal', {
    p_id: null, p_branch_id: branch.id, p_code: `POS${run}`, p_name: 'Acceptance cashier terminal', p_type: 'CASHIER',
  })).payload;
  created.terminalId = terminal.id;
  await rpc(admin, 'save_terminal_access', {
    p_terminal_id: terminal.id, p_access_mode: 'ALL_BRANCH_STAFF',
    p_allowed_roles: ['CASHIER', 'KITCHEN', 'WAITER'], p_staff_ids: [],
  });
  const activation = (await rpc(admin, 'create_terminal_activation_code', { p_terminal_id: terminal.id, p_force_new: true })).payload;
  assert.match(activation.code, /^\d{6}$/);

  const staff = {};
  for (const role of ['CASHIER', 'KITCHEN', 'WAITER']) {
    const response = await admin('/functions/v1/admin-users', { body: {
      name: `Acceptance ${role.toLowerCase()}`, staffCode: `${role.slice(0, 3)}${run}`,
      role, branchId: branch.id, pinMode: 'ADMIN_TEMPORARY',
    }, expected: 201 });
    staff[role] = { ...response.payload.data, temporaryPin: response.payload.data.temporaryPin };
    assert.match(staff[role].temporaryPin, /^\d{6}$/);
  }
  const [category] = (await service('/rest/v1/categories', { body: {
    name: `Acceptance menu ${run}`, company_id: home.company_id, branch_id: branch.id, status: true,
  }, expected: 201 })).payload;
  const [product] = (await service('/rest/v1/products', { body: {
    category_id: category.id, product_name: `Acceptance meal ${run}`, company_id: home.company_id,
    branch_id: branch.id, cost_price: 3, sell_price: 12, status: true, is_available: true,
  }, expected: 201 })).payload;
  const [table] = (await service('/rest/v1/restaurant_tables', { body: {
    branch_id: branch.id, table_number: `QA${run}`, capacity: 2, area: 'Acceptance', status: 'AVAILABLE', is_active: true,
  }, expected: 201 })).payload;

  // A separate active company supplies negative tenant fixtures.
  const [foreignCompany] = (await service('/rest/v1/companies', { body: {
    code: `QB${run}`, name: `Other-company acceptance ${run}`, status: 'ACTIVE', tax_type: 'SST_SERVICE_TAX',
  }, expected: 201 })).payload;
  const [foreignBranch] = (await service('/rest/v1/branches', { body: {
    code: `QB${run}`, name: `Other branch ${run}`, company_id: foreignCompany.id, status: 'ACTIVE',
  }, expected: 201 })).payload;
  const foreignStaff = (await rpc(service, 'create_admin_staff_record', {
    p_branch_id: foreignBranch.id, p_staff_code: `OUT${run}`, p_name: 'Other company cashier',
    p_role: 'CASHIER', p_temporary_pin: String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
    p_email: null, p_phone: null, p_additional_branch_ids: [], p_status: 'ACTIVE', p_pin_mode: 'ADMIN_TEMPORARY',
  })).payload;
  const [foreignCategory] = (await service('/rest/v1/categories', { body: {
    name: `Other menu ${run}`, company_id: foreignCompany.id, branch_id: foreignBranch.id, status: true,
  }, expected: 201 })).payload;
  const [foreignProduct] = (await service('/rest/v1/products', { body: {
    category_id: foreignCategory.id, product_name: `Other meal ${run}`, company_id: foreignCompany.id,
    branch_id: foreignBranch.id, cost_price: 2, sell_price: 9, status: true, is_available: true,
  }, expected: 201 })).payload;

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 } });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(`${appUrl}/pos/setup`);
  // Auth startup can replace the setup screen; wait before entering the code.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.getByRole('textbox', { name: '6-digit activation code' }).fill(activation.code);
  await page.getByRole('button', { name: 'Activate terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to staff sign in' }).click();
  await page.getByText('Staff sign in', { exact: true }).waitFor({ timeout: 20000 });
  const proof = await page.evaluate(() => localStorage.getItem('pos.device-credential.v1'));
  assert.ok(proof?.length >= 32, 'Activation did not store a device credential');
  const terminalAuth = await page.evaluate(() => {
    const entry = Object.keys(localStorage).find(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
    return entry ? JSON.parse(localStorage.getItem(entry))?.access_token : null;
  });
  assert.ok(terminalAuth, 'Activated browser has no terminal Auth session');
  const pos = actor(terminalAuth, proof);
  const visibleStaff = (await rpc(pos, 'list_authenticated_terminal_staff', {})).payload;
  assert.deepEqual(visibleStaff.map(row => row.id).sort(), Object.values(staff).map(row => row.id).sort());
  const foreignLogin = await pos('/functions/v1/staff-pin-session', { body: { staffId: foreignStaff.id, pin: '000000' }, expected: 403 });
  assert.equal(foreignLogin.payload.code, 'STAFF_COMPANY_ACCESS_DENIED');
  const hiddenForeignMenu = await pos(`/rest/v1/products?id=eq.${foreignProduct.id}&select=id`, { expected: 200 });
  assert.deepEqual(hiddenForeignMenu.payload, []);

  await page.getByRole('button', { name: /Acceptance cashier/i }).click();
  await page.getByText('Enter Temporary PIN').waitFor();
  await digitButtons(page, staff.CASHIER.temporaryPin);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.getByText('Create New PIN').waitFor();
  const permanentPin = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  await digitButtons(page, permanentPin);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByText('Confirm New PIN').waitFor();
  await digitButtons(page, permanentPin);
  await page.getByRole('button', { name: 'Save PIN', exact: true }).click();
  await page.getByRole('button', { name: 'Cash Shift', exact: true }).waitFor({ timeout: 20000 });
  assert.deepEqual(browserErrors, []);

  const shift = (await rpc(pos, 'open_cashier_shift', { p_opening_float: 50 })).payload;
  created.shiftId = shift.id;
  assert.equal(shift.status, 'OPEN');
  const foreignOrder = await pos('/functions/v1/orders', { body: {
    items: [{ productId: foreignProduct.id, quantity: 1, optionIds: [], serviceMode: 'DINE_IN' }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id, idempotencyKey: `foreign-${run}`,
  }, expected: 422 });
  assert.ok(foreignOrder.payload.code, 'Foreign company product must be rejected');

  const orderResponse = await pos('/functions/v1/orders', { body: {
    items: [{ productId: product.id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'DINE_IN' }],
    paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id, idempotencyKey: `sale-${run}`,
  }, expected: 201 });
  const orderId = orderResponse.payload.data.id;
  created.orderId = orderId;
  const path = `/functions/v1/orders/${orderId}`;
  const readOrder = async () => (await pos(path)).payload.data;
  const order = await readOrder();
  assert.equal(order.company_id, home.company_id);
  const login = async (role) => {
    await rpc(pos, 'switch_terminal_staff_session', {});
    const response = await pos('/functions/v1/staff-pin-session', { body: { staffId: staff[role].id, pin: role === 'CASHIER' ? permanentPin : staff[role].temporaryPin }, expected: 200 });
    assert.equal(response.payload.data.staffSession.staff_record_id, staff[role].id);
  };
  await login('KITCHEN');
  const kitchenCannotPay = await pos('/functions/v1/payments', { body: {
    orderId, paymentMethod: 'CASH', finalAmount: '12.00', receivedAmount: '12.00', idempotencyKey: `denied-${run}`,
  }, expected: 403 });
  assert.ok(kitchenCannotPay.payload.code);
  for (const batch of order.order_item_batches) {
    await pos(`${path}/batches/${batch.id}/start`, { body: {} });
    await pos(`${path}/batches/${batch.id}/ready`, { body: {} });
  }
  const kitchenCannotServe = await pos(`${path}/serve`, { body: {}, expected: 403 });
  assert.ok(kitchenCannotServe.payload.code);
  await login('WAITER');
  const waiterCannotClose = await rpc(pos, 'close_cashier_shift', { p_shift_id: shift.id, p_actual_cash: 50, p_force: false, p_reason: null }, 400);
  assert.ok(waiterCannotClose.payload.message);
  await pos(`${path}/serve`, { body: {} });
  await login('CASHIER');
  const paidOrder = await readOrder();
  const payment = { orderId, paymentMethod: 'CASH', finalAmount: Number(paidOrder.total), receivedAmount: 20, idempotencyKey: `pay-${run}` };
  await pos('/functions/v1/payments', { body: payment });
  await pos('/functions/v1/payments', { body: payment });
  const finalOrder = await readOrder();
  assert.equal(finalOrder.payment_status, 'PAID');
  assert.equal(finalOrder.status, 'COMPLETED');
  const receipts = await rows('receipts', `order_id=eq.${orderId}&select=id,receipt_number,company_id,branch_id`);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].branch_id, branch.id);
  const payments = await rows('payments', `order_id=eq.${orderId}&status=eq.PAID&select=id`);
  assert.equal(payments.length, 1, 'Idempotent retry created another payment');
  const expectedCash = 50 + Number(paidOrder.total);
  const closed = (await rpc(pos, 'close_cashier_shift', { p_shift_id: shift.id, p_actual_cash: expectedCash, p_force: false, p_reason: null })).payload;
  assert.equal(closed.status, 'CLOSED');
  assert.equal(Number(closed.cash_difference), 0);
  const coreRoutes = [
    ['/functions/v1/orders', 'GET'], [`/functions/v1/orders/${orderId}`, 'GET'],
    [`/functions/v1/orders/${orderId}/bills`, 'GET'], ['/functions/v1/orders?scope=unpaid', 'GET'],
    ['/functions/v1/orders?scope=kitchen', 'GET'], ['/functions/v1/orders', 'POST'],
    [`/functions/v1/orders/${orderId}/cancel`, 'POST'], [`/functions/v1/orders/${orderId}/reopen`, 'POST'],
    [`/functions/v1/orders/${orderId}/bills`, 'POST'], [`/functions/v1/orders/${orderId}/manual-discount`, 'POST'],
    [`/functions/v1/orders/${orderId}/items/${order.order_items[0].id}/void`, 'POST'],
    [`/functions/v1/orders/${orderId}/takeaway-packaging`, 'POST'],
    [`/functions/v1/orders/${orderId}/batches/${order.order_item_batches[0].id}/start`, 'POST'],
    [`/functions/v1/orders/${orderId}/serve`, 'POST'], [`/functions/v1/orders/${orderId}/start`, 'POST'],
    [`/functions/v1/orders/${orderId}/draft-items`, 'POST'], [`/functions/v1/orders/${orderId}/submit`, 'POST'],
    [`/functions/v1/orders/${orderId}/items`, 'POST'], [`/functions/v1/orders/${orderId}`, 'PATCH'],
    [`/functions/v1/orders/${orderId}/void`, 'PATCH'],
    ['/functions/v1/products', 'GET'], ['/functions/v1/products/categories', 'GET'],
    [`/functions/v1/products/${product.id}`, 'GET'],
    ['/functions/v1/tables', 'GET'], [`/functions/v1/tables/${table.id}`, 'GET'],
    ['/functions/v1/tables', 'POST'], ['/functions/v1/tables/move-order', 'POST'],
    [`/functions/v1/tables/${table.id}/start-cleaning`, 'POST'],
    [`/functions/v1/tables/${table.id}/complete-cleaning`, 'POST'],
    [`/functions/v1/tables/${table.id}/out-of-service`, 'POST'],
    [`/functions/v1/tables/${table.id}/restore`, 'POST'],
    [`/functions/v1/tables/${table.id}`, 'PATCH'], [`/functions/v1/tables/${table.id}/status`, 'PATCH'],
    [`/functions/v1/tables/${table.id}`, 'DELETE'],
    ['/functions/v1/payments', 'GET'], ['/functions/v1/payments/receipt', 'GET'],
    ['/functions/v1/payments/summary', 'GET'], ['/functions/v1/payments/providers', 'GET'],
    ['/functions/v1/payments/report', 'GET'], ['/functions/v1/payments', 'POST'],
    ['/functions/v1/payments/refund', 'POST'], ['/functions/v1/payments/providers', 'POST'],
    ['/functions/v1/payments/void', 'POST'], ['/functions/v1/payments/receipt/reprint', 'POST'],
  ];
  const deniedBody = (route) => route === '/functions/v1/orders'
    ? { items: [{ productId: foreignProduct.id, quantity: 1, optionIds: [], serviceMode: 'DINE_IN' }],
      paymentMethod: 'CASH', diningMode: 'dine-in', tableId: table.id, idempotencyKey: `denied-identity-${run}` }
    : {};
  const rawRoutes = [
    `/rest/v1/orders?branch_id=eq.${branch.id}&select=id`,
    `/rest/v1/order_items?order_id=eq.${orderId}&select=id`,
    `/rest/v1/products?branch_id=eq.${branch.id}&select=id`,
    `/rest/v1/categories?branch_id=eq.${branch.id}&select=id`,
    `/rest/v1/restaurant_tables?branch_id=eq.${branch.id}&select=id`,
    `/rest/v1/payments?order_id=eq.${orderId}&select=id`,
    `/rest/v1/receipts?order_id=eq.${orderId}&select=id`,
    `/rest/v1/cashier_shifts?branch_id=eq.${branch.id}&select=id`,
  ];
  const deniedCoreRoutes = async (call, expected, label) => {
    for (const [route, method] of coreRoutes) {
      const result = await call(route, { method, ...(['POST', 'PATCH', 'DELETE'].includes(method) ? { body: deniedBody(route) } : {}), expected });
      assert.ok(result.payload?.error, `${label}: ${method} ${route} did not return a denial`);
    }
    for (const route of rawRoutes) {
      const result = await call(route, { expected: [200, 401, 403] });
      if (result.status === 200) assert.deepEqual(result.payload, [], `${label}: ${route} exposed POS records`);
    }
    assert.equal((await rpc(call, 'current_terminal_staff_session', {})).payload?.id, null, `${label}: staff session remained usable`);
  };
  // A terminal Auth token alone cannot call operational routes after staff sign-out.
  await rpc(pos, 'switch_terminal_staff_session', {});
  await deniedCoreRoutes(pos, [401, 403], 'staff session ended');
  const [jwtHeader, jwtPayload] = terminalAuth.split('.');
  const header = JSON.parse(Buffer.from(jwtHeader, 'base64url').toString());
  assert.ok(['HS256', 'ES256'].includes(header.alg), 'Expected local JWT signing mode');
  const expiredClaims = JSON.parse(Buffer.from(jwtPayload, 'base64url').toString());
  expiredClaims.iat = Math.floor(Date.now() / 1000) - 7200;
  expiredClaims.exp = Math.floor(Date.now() / 1000) - 3600;
  const expiredPayload = Buffer.from(JSON.stringify(expiredClaims)).toString('base64url');
  let expiredSignature;
  if (header.alg === 'HS256') {
    expiredSignature = createHmac('sha256', local.JWT_SECRET).update(`${jwtHeader}.${expiredPayload}`).digest('base64url');
  } else {
    const containerEnv = execFileSync('docker', ['inspect', 'supabase_auth_Pos_Order', '--format', '{{range .Config.Env}}{{println .}}{{end}}'], { encoding: 'utf8' });
    const encodedKeys = containerEnv.split('\n').find(line => line.startsWith('GOTRUE_JWT_KEYS='))?.slice('GOTRUE_JWT_KEYS='.length);
    const signingKey = JSON.parse(encodedKeys || '[]').find(key => key.kid === header.kid && key.alg === 'ES256');
    assert.ok(signingKey?.d, 'Local ES256 signing key unavailable');
    expiredSignature = sign('sha256', Buffer.from(`${jwtHeader}.${expiredPayload}`),
      { key: createPrivateKey({ key: signingKey, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
    assert.equal(verify('sha256', Buffer.from(`${jwtHeader}.${expiredPayload}`),
      { key: createPublicKey(createPrivateKey({ key: signingKey, format: 'jwk' })), dsaEncoding: 'ieee-p1363' },
      Buffer.from(expiredSignature, 'base64url')), true, 'Expired JWT signature is invalid');
  }
  const expired = actor(`${jwtHeader}.${expiredPayload}.${expiredSignature}`, proof);
  await expired('/auth/v1/user', { expected: [401, 403] });
  for (const [route, method] of coreRoutes) {
    await expired(route, { method, ...(['POST', 'PATCH', 'DELETE'].includes(method) ? { body: deniedBody(route) } : {}), expected: [401, 403] });
  }
  for (const route of rawRoutes) await expired(route, { expected: [401, 403] });
  const terminalAuthUserId = (await rows('pos_terminals', `id=eq.${terminal.id}&select=auth_user_id`))[0].auth_user_id;
  const clearLocalPinLimiter = () => service(`/rest/v1/api_rate_limit_windows?subject_key=eq.${encodeURIComponent(`${terminalAuthUserId}:${staff.CASHIER.id}`)}&action=eq.staff-pin-session`, { method: 'DELETE' });
  const loginCashier = async (credential) => {
    await clearLocalPinLimiter();
    const result = await actor(terminalAuth, credential)('/functions/v1/staff-pin-session', {
      body: { staffId: staff.CASHIER.id, pin: permanentPin }, expected: 200,
    });
    assert.equal(result.payload.data.staffSession.staff_record_id, staff.CASHIER.id);
  };
  await loginCashier(proof);
  const assignment = (await rows('staff_branch_assignments', `staff_id=eq.${staff.CASHIER.legacyProfileId}&branch_id=eq.${branch.id}&select=id,status`))[0];
  assert.ok(assignment?.id, 'Cashier branch assignment missing');
  await service(`/rest/v1/staff_branch_assignments?id=eq.${assignment.id}`, { method: 'PATCH', body: { status: 'INACTIVE' } });
  await deniedCoreRoutes(pos, [401, 403], 'branch access removed');
  await service(`/rest/v1/staff_branch_assignments?id=eq.${assignment.id}`, { method: 'PATCH', body: { status: 'ACTIVE' } });
  await loginCashier(proof);
  await rpc(admin, 'manage_terminal_device', { p_terminal_id: terminal.id, p_action: 'REVOKE', p_reason: 'Local acceptance revocation' });
  await deniedCoreRoutes(pos, [401, 403], 'device revoked');
  const revokedPin = await pos('/functions/v1/staff-pin-session', { body: { staffId: staff.CASHIER.id, pin: permanentPin }, expected: 403 });
  assert.ok(['DEVICE_REVOKED', 'DEVICE_NOT_ACTIVATED'].includes(revokedPin.payload.code));
  const reactivate = (await rpc(admin, 'manage_terminal_device', { p_terminal_id: terminal.id, p_action: 'REACTIVATE', p_reason: 'Local acceptance replacement' })).payload;
  const freshPhysical = () => crypto.randomUUID() + crypto.randomUUID();
  const replacementPhysical = freshPhysical();
  const replacement = (await rpc(pos, 'activate_terminal_with_code', {
    p_code: reactivate.code, p_device_identifier: replacementPhysical, p_device_name: 'Acceptance replacement',
  })).payload;
  assert.equal(replacement.ok, true);
  const newProof = replacement.terminalCredential;
  await deniedCoreRoutes(pos, [401, 403], 'old device credential');
  const replacementPos = actor(terminalAuth, newProof);
  assert.equal((await rpc(replacementPos, 'resolve_authenticated_terminal', { p_device_identifier: replacementPhysical })).payload.ok, true);
  await loginCashier(newProof);
  assert.ok((await rpc(replacementPos, 'current_terminal_staff_session', {})).payload?.id);
  await rpc(admin, 'manage_terminal_device', { p_terminal_id: terminal.id, p_action: 'REPLACE', p_reason: 'Local acceptance hardware swap' });
  await deniedCoreRoutes(replacementPos, [401, 403], 'replaced device');
  const replacementCode = (await rpc(admin, 'create_terminal_activation_code', { p_terminal_id: terminal.id, p_force_new: true })).payload;
  const finalPhysical = freshPhysical();
  const finalActivation = (await rpc(replacementPos, 'activate_terminal_with_code', {
    p_code: replacementCode.code, p_device_identifier: finalPhysical, p_device_name: 'Acceptance final device',
  })).payload;
  assert.equal(finalActivation.ok, true);
  const finalPos = actor(terminalAuth, finalActivation.terminalCredential);
  assert.equal((await rpc(finalPos, 'resolve_authenticated_terminal', { p_device_identifier: finalPhysical })).payload.ok, true);
  await loginCashier(finalActivation.terminalCredential);
  await clearLocalPinLimiter();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await finalPos('/functions/v1/staff-pin-session', { body: { staffId: staff.CASHIER.id, pin: '000000' }, expected: 401 });
    assert.equal(wrong.payload.code, 'INVALID_PIN');
  }
  const [pinState] = await rows('staff_pin_credentials_v2', `staff_id=eq.${staff.CASHIER.id}&select=failed_attempts,locked_until`);
  assert.equal(pinState.failed_attempts, 5);
  assert.ok(new Date(pinState.locked_until) > new Date());
  await deniedCoreRoutes(finalPos, [401, 403], 'PIN locked');
  const lockedLogin = await rpc(finalPos, 'login_terminal_staff', { p_staff_id: staff.CASHIER.id, p_pin: permanentPin });
  assert.equal(lockedLogin.payload.code, 'PIN_LOCKED');
  const audit = await rows('audit_logs', `company_id=eq.${home.company_id}&branch_id=eq.${branch.id}&select=action,terminal_id,staff_session_id`);
  for (const action of ['STAFF_LOGIN', 'SHIFT_OPENED', 'SHIFT_CLOSED', 'PAYMENT_ACCEPTED']) {
    assert.ok(audit.some(row => row.action === action && row.terminal_id === terminal.id), `${action} audit missing terminal context`);
  }
  console.log(JSON.stringify({ verification: 'VERIFIED PASS', environment: 'local', branchCode: branch.code,
    branchId: branch.id, terminalId: terminal.id, orderId, shiftId: shift.id,
    steps: ['terminal activation', 'browser cashier PIN', 'shift open', 'order', 'kitchen', 'serve', 'payment', 'receipt', 'shift close'],
    denied: ['foreign staff', 'foreign product', 'kitchen serve', 'kitchen pay', 'waiter shift close',
      'ended staff session across core routes', 'expired Auth token across core routes', 'removed branch access across core routes',
      'revoked device across core routes', 'replaced device across core routes', 'old credential across core routes', 'PIN lockout across core routes'],
    preservedHistory: true }));
} catch (error) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({ path: '/tmp/pos-complete-branch-failure.png', fullPage: true }).catch(() => {});
      console.error((await page.locator('body').innerText().catch(() => ''))?.slice(0, 1200));
    }
  }
  console.error(JSON.stringify({ verification: 'VERIFIED FAIL', environment: 'local', ...created, reason: error.message }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (created.adminAuthId) {
    await service(`/rest/v1/profiles?id=eq.${created.adminAuthId}`, { method: 'PATCH', body: { status: 'INACTIVE' } });
    await service(`/auth/v1/admin/users/${created.adminAuthId}`, { method: 'DELETE' });
  }
}
