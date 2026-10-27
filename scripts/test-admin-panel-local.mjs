import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');
const appUrl = 'http://127.0.0.1:5173';
const sections = [
  ['dashboard', 'Dashboard'], ['company', 'Company'], ['branches', 'Branches'],
  ['terminals', 'Terminals'], ['users', 'Staff'], ['roles', 'Roles & Permissions'],
  ['orders', 'Orders'], ['payments', 'Payments'], ['receipts', 'Receipts'],
  ['cash-shifts', 'Shift Management'], ['tables', 'Tables'], ['products', 'Products'],
  ['categories', 'Categories'], ['inventory', 'Inventory'], ['promotions', 'Promotions'],
  ['vouchers', 'Vouchers'], ['reports', 'Sales Reports'], ['discount-activity', 'Voucher Usage'],
  ['audit', 'Audit Logs'], ['system-administration', 'Restaurant Settings'],
  ['system-health', 'System Health'], ['qr-settings', 'QR Payment Settings'],
  ['payment-providers', 'Payment Methods'], ['einvoice', 'E-Invoice'],
];
const email = `admin-sweep-${crypto.randomUUID()}@example.invalid`;
const password = crypto.randomUUID() + crypto.randomUUID();
let userId;
let browser;

async function request(path, token = local.SERVICE_ROLE_KEY, method = 'GET', body) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  assert.ok(response.ok, `Local fixture request failed: ${method} ${path} HTTP ${response.status}`);
  return data;
}

try {
  const [branch] = await request('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&order=created_at.asc&limit=1');
  assert.ok(branch?.id, 'An active local branch is required');
  const [role] = await request(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id&limit=1`);
  assert.ok(role?.id, 'A company ADMIN role is required');
  userId = (await request('/auth/v1/admin/users', local.SERVICE_ROLE_KEY, 'POST', { email, password, email_confirm: true })).id;
  await request(`/rest/v1/profiles?id=eq.${userId}`, local.SERVICE_ROLE_KEY, 'PATCH', {
    name: 'Local admin panel sweep', company_id: branch.company_id, branch_id: branch.id,
    role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE',
  });
  const token = (await request('/auth/v1/token?grant_type=password', local.ANON_KEY, 'POST', { email, password })).access_token;
  const companyBranches = await request(`/rest/v1/branches?company_id=eq.${branch.company_id}&select=id`);
  const orders = await request('/rest/v1/orders?select=id,branch_id&order=created_at.desc&limit=100');
  const order = orders.find(row => companyBranches.some(owned => owned.id === row.branch_id));
  if (order) {
    const approvers = await request('/rest/v1/rpc/list_order_void_approvers', token, 'POST', { p_order_id: order.id });
    assert.ok(Array.isArray(approvers), 'The authenticated approver directory returned an invalid response');
    console.log('CHECKED authenticated order void approver API');
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let currentSection = 'login';
  page.on('pageerror', error => errors.push({ section: currentSection, kind: 'browser', message: error.message }));
  page.on('response', response => {
    if (response.status() < 400) return;
    const url = new URL(response.url());
    if (url.origin !== local.API_URL || !/^\/(rest|functions)\/v1\//.test(url.pathname)) return;
    errors.push({ section: currentSection, kind: 'api', status: response.status(), path: url.pathname });
  });
  await page.goto(appUrl);
  await page.locator('#current-email').fill(email);
  await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await page.locator('.admin-shell').waitFor({ timeout: 20000 });
  const navigation = page.getByRole('navigation', { name: 'Primary modules' });
  assert.equal(await navigation.getByRole('button').count(), 7, 'Seven primary admin modules must remain available');
  const checked = [];
  for (const [section, label] of sections) {
    currentSection = section;
    await page.getByRole('button', { name: 'Find a module', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find module by name' }).fill(section);
    await page.locator(`.admin-command-results [data-admin-section="${section}"]`).click();
    await page.waitForURL(url => url.hash.startsWith(`#admin/${section}`), { timeout: 10000 });
    await navigation.locator('[aria-current="page"]').waitFor();
    await page.waitForTimeout(750);
    if (section === 'orders' && await page.locator('main table tbody tr').count()) {
      await page.locator('main table tbody tr').first().click();
      await page.getByRole('button', { name: 'Close order details' }).waitFor();
      await page.getByRole('button', { name: 'Close order details' }).click();
    }
    if (section === 'payments') {
      await page.getByRole('button', { name: 'Refund History' }).click();
      await page.getByRole('heading', { name: 'Refund History' }).waitFor();
      await page.getByRole('button', { name: 'Back to Payments' }).click();
      const refundButton = page.getByRole('button', { name: 'Refund', exact: true }).first();
      if (await refundButton.count()) {
        const refundRequests = [];
        await page.route('**/functions/v1/payments/refund', async route => {
          refundRequests.push(route.request().postDataJSON());
          if (refundRequests.length === 1) return route.abort('failed');
          return route.fulfill({ status: 200, json: { data: { replayed: true } } });
        });
        await refundButton.click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        const paymentNumber = (await dialog.getByRole('heading').textContent()).replace(/^Refund /, '').trim();
        await dialog.getByPlaceholder('Required refund reason').fill('Local duplicate submission check');
        await dialog.getByLabel(`Type ${paymentNumber} to confirm`).fill(paymentNumber);
        const confirm = dialog.getByRole('button', { name: 'Confirm Refund' });
        await Promise.all([confirm.dispatchEvent('click'), confirm.dispatchEvent('click')]);
        await dialog.getByRole('alert').waitFor();
        assert.equal(refundRequests.length, 1, 'Double click sent two refund requests');
        await confirm.click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(refundRequests.length, 2, 'Refund retry did not send a request');
        assert.equal(refundRequests[0].idempotencyKey, refundRequests[1].idempotencyKey, 'Refund retry changed its request key');
        await page.unroute('**/functions/v1/payments/refund');
      }
    }
    if (section === 'receipts') {
      const view = page.locator('main table tbody').getByRole('button', { name: 'View' }).first();
      if (await view.count()) {
        await view.click();
        await page.getByRole('button', { name: 'Close receipt' }).waitFor();
        await page.getByRole('button', { name: 'Close receipt' }).click();
      }
    }
    if (section === 'cash-shifts') {
      const shift = page.locator('main table tbody tr button').first();
      if (await shift.count()) {
        await shift.click();
        await page.getByRole('heading', { name: 'Shift Summary' }).waitFor();
        await page.getByRole('button', { name: 'Back to shift history' }).click();
      }
    }
    if (section === 'tables') {
      const branch = page.getByRole('combobox', { name: 'Table branch' });
      const options = await branch.locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean));
      if (options.length) {
        await branch.selectOption(options[0]);
        await page.getByRole('button', { name: 'Refresh tables' }).waitFor();
      }
    }
    const alerts = await page.locator('.admin-shell main [role="alert"]').allTextContents();
    for (const message of alerts.map(value => value.trim()).filter(Boolean)) {
      errors.push({ section, kind: 'alert', message });
    }
    checked.push(section);
    console.log(`CHECKED ${section}`);
  }
  assert.deepEqual(errors, [], `Admin panel failures: ${JSON.stringify(errors)}`);
  console.log(`VERIFIED PASS: ${checked.length} authenticated local admin sections rendered without API failures, alerts, or browser errors`);
} finally {
  await browser?.close();
  if (userId) {
    await request(`/rest/v1/profiles?id=eq.${userId}`, local.SERVICE_ROLE_KEY, 'PATCH', { status: 'INACTIVE' });
    await request(`/auth/v1/admin/users/${userId}`, local.SERVICE_ROLE_KEY, 'DELETE');
  }
}
