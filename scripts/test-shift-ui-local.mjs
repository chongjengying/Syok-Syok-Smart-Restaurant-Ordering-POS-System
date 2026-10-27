import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname), 'Local tests only');
const appUrl = 'http://127.0.0.1:5173';
const suffix = crypto.randomUUID().slice(0, 8);
const email = `shift-ui-${suffix}@example.com`, password = crypto.randomUUID() + crypto.randomUUID();
let userId, browser;
async function service(path, method = 'GET', body) {
  const response = await fetch(`${status.API_URL}${path}`, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  assert.ok(response.ok, `Local fixture request failed: ${method} ${path} (${response.status})`);
  return data;
}
try {
  const user = await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true }); userId = user.id;
  const [role] = await service('/rest/v1/roles?name=eq.ADMIN&select=id');
  const [branch] = await service('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&limit=1');
  assert.ok(branch, 'Active local branch required');
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { name: 'Shift UI QA', company_id: branch.company_id, branch_id: branch.id, role_name: 'ADMIN', role_id: role.id, status: 'ACTIVE' });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let anonymousSignups = 0;
  page.on('request', request => { if (request.url().endsWith('/auth/v1/signup')) anonymousSignups++; });
  await page.goto(`${appUrl}/pos/login#admin/dashboard`);
  await page.waitForURL(`${appUrl}/admin#admin/dashboard`);
  await page.locator('#current-email').fill(email); await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await page.locator('.admin-shell').waitFor({ timeout: 20000 });
  assert.equal(new URL(page.url()).pathname, '/admin', 'Admin login retained the POS pathname');
  await page.goto(`${appUrl}/pos/login#admin/cash-shifts`);
  await page.waitForURL(`${appUrl}/admin#admin/cash-shifts`);
  await page.getByRole('heading', { name: 'Shift History', exact: true }).waitFor();
  assert.equal(anonymousSignups, 0, 'Legacy admin URLs started terminal device signup');
  await page.getByRole('button', { name: 'Shift Management', exact: true }).click();
  await page.getByRole('heading', { name: 'Shift History', exact: true }).waitFor();
  await page.getByRole('status', { name: 'Loading shifts...' }).waitFor({ state: 'hidden' });
  await page.getByRole('table').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0, 'Authenticated local shift history returned an error');
  const listPath = '/rest/v1/rpc/list_cashier_shift_history';
  // Rendering fixture only: backend financial/authorization coverage lives in the rollback SQL test.
  const shift = { id: crypto.randomUUID(), shift_number: 'SHIFT-QA-20261004-000001', opened_at: '2026-10-04T01:00:00Z', closed_at: '2026-10-04T10:00:00Z', status: 'CLOSED', opening_float: 300, expected_cash: 1000, actual_cash: 980, cash_difference: -20, branch_id: branch.id, terminal_id: crypto.randomUUID(), opened_by_staff_id: userId, branches: { name: 'QA Branch' }, pos_terminals: { terminal_code: 'POS-QA' }, opened_by: { name: 'John Tan' }, total_sales: 1200 };
  await page.route(`**${listPath}`, route => route.fulfill({ json: [shift] }));
  await page.route('**/rest/v1/rpc/cashier_shift_summary', route => route.fulfill({ json: { shift, staffName: 'John Tan', branchName: 'QA Branch', terminalName: 'POS-QA', deviceName: 'QA Register', openingFloat: 300, cashSales: 700, cashIn: 100, cashOut: 50, cashRefunds: 50, cashAdjustments: 0, expectedCash: 1000, actualCash: 980, variance: -20, totalSales: 1200, salesCount: 3, refundCount: 1, paymentBreakdown: { CASH: 700, QR: 300, EWALLET: 200 }, movements: [] } }));
  await page.getByRole('button', { name: 'Refresh shifts' }).click();
  await page.getByRole('button', { name: shift.shift_number }).click();
  await page.getByText('Short by RM 20.00', { exact: true }).waitFor();
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const heading = page.getByRole('heading', { name: 'Shift Summary', exact: true });
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y < height, `Summary not framed at ${width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, `Summary overflow at ${width}px`);
    await page.screenshot({ path: `/tmp/pos-shift-summary-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Back to shift history' }).click();
  await page.getByRole('button', { name: 'Refresh shifts' }).waitFor();
  await page.route(`**${listPath}`, route => route.fulfill({ status: 403, json: { message: 'INSUFFICIENT_PERMISSION', code: 'P0001' } }));
  await page.getByRole('button', { name: 'Refresh shifts' }).click();
  await page.getByRole('alert').filter({ hasText: 'Your role does not have permission' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Terminals', exact: true }).click();
  const terminal = await service(`/rest/v1/pos_terminals?company_id=eq.${branch.company_id}&select=id,name,terminal_code&limit=1`);
  assert.ok(terminal[0], 'Existing local terminal required for read-only detail checks');
  await page.getByRole('button', { name: `View details for ${terminal[0].name}`, exact: true })
    .filter({ hasText: terminal[0].terminal_code }).click();
  await page.getByRole('heading', { name: 'Staff Access', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Device & session management', exact: true }).waitFor();
  await page.getByText('Loading device history…').waitFor({ state: 'hidden' });
  for (const [width,height] of [[1440,1000],[768,1024],[390,844]]) {
    await page.setViewportSize({ width,height });
    const heading = page.getByRole('heading', { name: 'Staff Access', exact: true });
    await heading.scrollIntoViewIfNeeded();
    const box = await heading.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width, `Terminal detail overflow at ${width}`);
    await page.screenshot({ path: `/tmp/pos-terminal-detail-${width}.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], 'Browser runtime error');
  console.log('VERIFIED PASS: authenticated local admin shift and terminal details; fixture-rendered shift summary at desktop/tablet/phone, variance, navigation and API error state');
} finally {
  await browser?.close();
  if (userId) await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
}
