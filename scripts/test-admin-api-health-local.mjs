import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const email = `api-health-${crypto.randomUUID()}@example.com`;
const password = crypto.randomUUID() + crypto.randomUUID();
let userId, browser;
async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${status.API_URL}${path}`, {
    method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.ok(response.ok, `Request failed: ${method} ${path} HTTP ${response.status}`);
  return data;
}
const service = (path, method, body) => request(path, status.SERVICE_ROLE_KEY, method, body);
try {
  userId = (await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true })).id;
  const [branch] = await service('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&limit=1');
  const [role] = await service(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&select=id`);
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { name: 'API Health QA', company_id: branch.company_id, branch_id: branch.id, role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE' });
  const token = (await request('/auth/v1/token?grant_type=password', status.ANON_KEY, 'POST', { email, password })).access_token;
  for (const endpoint of ['admin-users', 'payments/providers']) {
    await request(`/functions/v1/${endpoint}`, token);
    console.log(`VERIFIED PASS: authenticated local GET ${endpoint} HTTP 200`);
  }
  const { data: health } = await request('/functions/v1/system-health', token);
  const api = health.components.find(check => check.component === 'api');
  assert.equal(api.status, health.api.totalRequests === 0 ? 'UNKNOWN' : health.api.failureRate >= 0.05 ? 'CRITICAL' : health.api.failureRate >= 0.01 ? 'WARNING' : 'HEALTHY');
  console.log(JSON.stringify({ verification: 'VERIFIED PASS', environment: 'local', apiStatus: api.status, requests: health.api.totalRequests, failures: health.api.failedRequests, message: api.message, liveChecks: health.components.find(check => check.component === 'edge-functions').metadata.checks.map(check => ({ service: check.label, status: check.status, message: check.message })) }));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  let dashboardRequests = 0;
  page.on('request', request => {
    if (request.url().includes('/rest/v1/rpc/get_admin_dashboard')) dashboardRequests++;
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().includes('/functions/v1/system-health')) console.log(`Health browser HTTP ${response.status()}`);
  });
  await page.goto('http://127.0.0.1:5173');
  await page.locator('#current-email').fill(email);
  await page.locator('#current-password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).last().click();
  await page.locator('.admin-shell').waitFor({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Admin Dashboard', exact: true }).waitFor();
  const dashboardResponse = () => page.waitForResponse(response => response.url().includes('/rest/v1/rpc/get_admin_dashboard'));
  const [periodResponse] = await Promise.all([
    dashboardResponse(), page.getByRole('button', { name: 'Yesterday', exact: true }).click(),
  ]);
  assert.equal(periodResponse.ok(), true, 'Dashboard period request failed');
  const [scopeResponse] = await Promise.all([
    dashboardResponse(), page.getByLabel('Order type', { exact: true }).selectOption('takeaway'),
  ]);
  assert.equal(scopeResponse.ok(), true, 'Dashboard scope request failed');
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  const lastUpdated = await page.getByText(/Last updated/).textContent();
  await page.getByRole('button', { name: 'System Health', exact: true }).click();
  try {
    await page.getByRole('heading', { name: 'Recent API Errors', exact: true }).waitFor();
  } catch (error) {
    await page.screenshot({ path: '/tmp/pos-admin-api-health-failure.png', fullPage: true });
    console.log(JSON.stringify({ verification: 'VERIFIED FAIL', alerts: await page.getByRole('alert').allTextContents(), errors }));
    throw error;
  }
  await page.screenshot({ path: '/tmp/pos-admin-api-health.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: authenticated Admin System Health rendered without JavaScript errors');
  const beforeReturn = dashboardRequests;
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('heading', { name: 'Admin Dashboard', exact: true }).waitFor();
  await page.waitForTimeout(300);
  assert.equal(dashboardRequests, beforeReturn, 'Returning to Dashboard unnecessarily fetched metrics');
  assert.equal(await page.getByLabel('Order type', { exact: true }).inputValue(), 'takeaway', 'Dashboard scope was reset by navigation');
  assert.match(await page.getByRole('button', { name: 'Yesterday', exact: true }).getAttribute('class'), /bg-slate-950/, 'Dashboard period was reset by navigation');
  assert.equal(await page.getByText(/Last updated/).textContent(), lastUpdated, 'Dashboard snapshot was reset by navigation');
  const [refreshResponse] = await Promise.all([
    dashboardResponse(), page.getByRole('button', { name: 'Refresh', exact: true }).click(),
  ]);
  assert.equal(refreshResponse.ok(), true, 'Explicit dashboard refresh failed');
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  assert.equal(dashboardRequests, beforeReturn + 1, 'Explicit dashboard refresh should fetch once');
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: dashboard navigation preserves filters and snapshot without fetching; explicit refresh fetches once using real authenticated local RPCs');
} finally {
  await browser?.close();
  if (userId) {
    await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { status: 'INACTIVE' });
    await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
  }
}
