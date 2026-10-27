import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const email = `inventory-ui-${crypto.randomUUID()}@example.com`;
const password = crypto.randomUUID() + crypto.randomUUID();
let userId, browser;
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${status.API_URL}${path}`, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, data: response.status === 204 ? null : await response.json() };
}
async function service(path, method = 'GET', body) {
  const result = await request(path, status.SERVICE_ROLE_KEY, method, body);
  assert.ok(result.response.ok, `Fixture request failed: ${method} (${result.response.status})`);
  return result.data;
}
try {
  userId = (await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true })).id;
  const [branch] = await service('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&limit=1');
  const [role] = await service(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&select=id`);
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { name: 'Inventory UI QA', company_id: branch.company_id, branch_id: branch.id, role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE' });
  const login = await request('/auth/v1/token?grant_type=password', status.ANON_KEY, 'POST', { email, password });
  assert.ok(login.response.ok);
  const token = login.data.access_token;
  const branches = await request('/rest/v1/rpc/list_inventory_branches', token, 'POST', {});
  assert.ok(branches.response.ok && branches.data.some(item => item.id === branch.id));
  for (const rpc of ['list_inventory', 'get_inventory_report', 'list_inventory_products']) {
    const rejected = await request(`/rest/v1/rpc/${rpc}`, token, 'POST', { p_branch_id: crypto.randomUUID() });
    assert.equal(rejected.response.status, 403);
  }
  const hidden = await request(`/rest/v1/inventory_items?id=eq.${crypto.randomUUID()}&select=id`, token);
  assert.ok(hidden.response.ok); assert.deepEqual(hidden.data, []);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#current-email').fill(email); await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await page.locator('.admin-shell').waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
  await page.getByText('Stock Items', { exact: true }).waitFor();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const heading = page.getByRole('heading', { name: 'Inventory', exact: true });
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width);
    await page.screenshot({ path: `/tmp/pos-inventory-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Opening Stock', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  await page.screenshot({ path: '/tmp/pos-inventory-opening-390.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: real local Auth/API scope denials, inventory summary and opening validation on desktop/tablet/phone; no stock writes');
} finally {
  await browser?.close();
  if (userId) {
    await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { status: 'INACTIVE' });
    await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
  }
}
