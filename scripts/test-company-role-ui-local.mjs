import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname), 'Local tests only');
const suffix = crypto.randomUUID().slice(0, 8);
const email = `roles-ui-${suffix}@example.com`, password = crypto.randomUUID() + crypto.randomUUID();
let userId, browser, uploadedPath;
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${status.API_URL}${path}`, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, data: response.status === 204 ? null : await response.json() };
}
async function service(path, method = 'GET', body) {
  const result = await request(path, status.SERVICE_ROLE_KEY, method, body);
  assert.ok(result.response.ok, `Local fixture request failed: ${method} ${path} (${result.response.status})`);
  return result.data;
}
try {
  const user = await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true }); userId = user.id;
  const [branch] = await service('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&limit=1');
  const [role] = await service(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&select=id`);
  const [template] = await service('/rest/v1/roles?scope=eq.SYSTEM&name=eq.CASHIER&select=id');
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { name: 'Role UI QA', company_id: branch.company_id, branch_id: branch.id, role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE' });
  const login = await request('/auth/v1/token?grant_type=password', status.ANON_KEY, 'POST', { email, password });
  assert.ok(login.response.ok, 'Local admin authentication failed');
  const token = login.data.access_token;
  uploadedPath = `branding/logo-${crypto.randomUUID()}.png`;
  const upload = await fetch(`${status.API_URL}/storage/v1/object/restaurant-assets/${uploadedPath}`, {
    method: 'POST', headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' },
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE9sAAAAASUVORK5CYII=', 'base64'),
  });
  assert.ok(upload.ok, `Own-company Storage upload failed (${upload.status})`);
  const removed = await request('/storage/v1/object/restaurant-assets', token, 'DELETE', { prefixes: [uploadedPath] });
  assert.ok(removed.response.ok && removed.data.length === 1, 'Own-company Storage removal failed');
  uploadedPath = null;
  const roles = await request('/rest/v1/roles?select=id,company_id,scope', token);
  assert.ok(roles.response.ok && roles.data.length > 0);
  assert.ok(roles.data.every(item => item.company_id === branch.company_id && item.scope === 'COMPANY'));
  const rejected = await request('/rest/v1/rpc/set_role_permissions', token, 'POST', { p_role_id: template.id, p_permission_codes: ['order.create'] });
  assert.ok(!rejected.response.ok && rejected.data.message === 'ROLE_NOT_FOUND_OR_FORBIDDEN');
  assert.equal(rejected.response.status, 403);
  for (const rpc of ['activate_admin_role', 'deactivate_admin_role']) {
    const denied = await request(`/rest/v1/rpc/${rpc}`, token, 'POST', { p_role_id: template.id });
    assert.equal(denied.response.status, 403);
  }
  for (const [path, method, body] of [
    [`/rest/v1/roles?id=eq.${template.id}`, 'PATCH', { description: 'forged template edit' }],
    [`/rest/v1/roles?id=eq.${template.id}`, 'DELETE', undefined],
    ['/rest/v1/permissions?code=eq.order.create', 'PATCH', { is_active: false }],
    ['/rest/v1/role_permissions', 'POST', { role_id: template.id, permission_id: crypto.randomUUID() }],
  ]) {
    assert.equal((await request(path, token, method, body)).response.status, 403);
  }
  const tampered = await request(`/rest/v1/profiles?id=eq.${userId}`, token, 'PATCH', { company_id: crypto.randomUUID() });
  assert.equal(tampered.response.status, 403);
  const definitions = await request('/rest/v1/permissions?select=scope', token);
  assert.ok(definitions.response.ok && definitions.data.every(item => item.scope === 'COMPANY_ASSIGNABLE'));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#current-email').fill(email); await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await page.locator('.admin-shell').waitFor({ timeout: 20000 });
  const go = async section => {
    await page.getByRole('button', { name: 'Find a module', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find module by name' }).fill(section);
    await page.locator(`.admin-command-results [data-admin-section="${section}"]`).click();
  };
  await go('roles');
  await page.getByRole('heading', { name: 'Role Directory', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save Permissions', exact: true }).waitFor();
  assert.equal(await page.getByText('platform.company.manage', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('option', { name: 'TERMINAL_SETUP', exact: true }).count(), 0);
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const heading = page.getByRole('heading', { name: 'Role Directory', exact: true });
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width, `Role directory overflow at ${width}`);
    await page.screenshot({ path: `/tmp/pos-company-roles-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('promotions');
  await page.getByRole('heading', { name: 'Promotions', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Create promotion', exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/pos-audit-promotions-1440.png', fullPage: true });
  await go('vouchers');
  await page.getByRole('heading', { name: /Voucher/ }).waitFor();
  await page.getByText('Loading vouchers…', { exact: true }).waitFor({ state: 'hidden' });
  const voucherRows = await request('/rest/v1/vouchers?select=id,code,company_id', token);
  assert.ok(voucherRows.response.ok && voucherRows.data.every(item => item.company_id === branch.company_id));
  for (const voucher of voucherRows.data) await page.getByRole('cell', { name: voucher.code, exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/pos-audit-vouchers-1440.png', fullPage: true });
  const anonymousVoucher = await request('/rest/v1/rpc/validate_voucher', status.ANON_KEY, 'POST', { p_code: 'UNKNOWN-QA', p_subtotal: 10, p_order_type: null });
  assert.equal(anonymousVoucher.response.status, 401);
  assert.deepEqual(errors, []);
  const health = await request('/functions/v1/system-health', token);
  assert.ok(health.response.ok, 'Live System Health API must respond');
  const healthData = health.data?.data || health.data;
  console.log('Live health warnings:', JSON.stringify((healthData?.components || []).filter(item => ['CRITICAL','WARNING','DEGRADED'].includes(item.status)).map(item => ({ component: item.component, status: item.status, message: item.message }))));
  console.log('VERIFIED PASS: real local Auth/API/RLS and role directory on desktop/tablet/phone; template edit and tenant tampering denied');
} finally {
  await browser?.close();
  if (uploadedPath) await service('/storage/v1/object/restaurant-assets', 'DELETE', { prefixes: [uploadedPath] });
  if (userId) {
    // A real login creates append-only audit references; retire the identity, not its history.
    await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { status: 'INACTIVE' });
    await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
  }
}
