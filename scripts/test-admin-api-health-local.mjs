import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(status.API_URL).hostname));
const output = 'test-results/api-connections';
await mkdir(output, { recursive: true });
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
  const [role] = await service(`/rest/v1/roles?company_id=eq.${branch.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id&limit=1`);
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { name: 'API Health QA', company_id: branch.company_id, branch_id: branch.id, role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE' });
  const token = (await request('/auth/v1/token?grant_type=password', status.ANON_KEY, 'POST', { email, password })).access_token;
  for (const endpoint of ['admin-users', 'payments/providers', 'orders?health=probe', 'tables?health=probe', 'products?health=probe', 'payments?health=probe']) {
    await request(`/functions/v1/${endpoint}`, token);
    console.log(`VERIFIED PASS: authenticated local GET ${endpoint} HTTP 200`);
  }
  const { data: health } = await request('/functions/v1/system-health', token);
  const api = health.components.find(check => check.component === 'api');
  assert.equal(api.status, health.api.totalRequests === 0 ? 'UNKNOWN' : health.api.failureRate >= 0.05 ? 'CRITICAL' : health.api.failureRate >= 0.01 ? 'WARNING' : 'HEALTHY');
  assert.equal(api.label, 'API Reliability (24h)');
  const live = health.components.find(check => check.component === 'edge-functions');
  assert.equal(live.metadata.checks.length, 6);
  for (const check of live.metadata.checks) {
    assert.ok(check.lastSuccessfulAt, `${check.label}: ${check.message}`);
    assert.ok(['HEALTHY', 'WARNING', 'DEGRADED'].includes(check.status), `${check.label}: ${check.message}`);
  }
  for (const component of ['supabase', 'database', 'observability']) {
    assert.ok(health.components.find(check => check.component === component)?.lastSuccessfulAt, component);
  }
  const report = { verification: 'VERIFIED PASS', environment: 'local', checkedAt: health.checkedAt, apiStatus: api.status, requests: health.api.totalRequests, failures: health.api.failedRequests, message: api.message, liveChecks: live.metadata.checks.map(check => ({ service: check.label, status: check.status, message: check.message })) };
  console.log(JSON.stringify(report));
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
  await page.locator('.admin-dashboard-metrics').waitFor();
  const dashboardResponse = () => page.waitForResponse(response => response.url().includes('/rest/v1/rpc/get_admin_dashboard'));
  const [periodResponse] = await Promise.all([
    dashboardResponse(), page.getByRole('button', { name: 'Yesterday', exact: true }).click(),
  ]);
  assert.equal(periodResponse.ok(), true, 'Dashboard period request failed');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const [scopeResponse] = await Promise.all([
    dashboardResponse(), page.getByLabel('Order type', { exact: true }).selectOption('takeaway'),
  ]);
  assert.equal(scopeResponse.ok(), true, 'Dashboard scope request failed');
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  const lastUpdated = await page.locator('.admin-dashboard-footnote').textContent();
  await page.getByRole('button', { name: 'Find a module', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find module by name' }).fill('system-health');
  await page.locator('.admin-command-results [data-admin-section="system-health"]').click();
  try {
    await page.getByRole('heading', { name: 'Recent API Errors', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Live API Connections', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'API Reliability (24h)', exact: true }).waitFor();
    const liveCard = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Live API Connections', exact: true }) });
    await liveCard.getByText('Staff (admin-users)', { exact: false }).waitFor();
    await liveCard.getByText(/^Payment providers/).waitFor();
    await page.getByText('Realtime channel is subscribed and connected.', { exact: true }).waitFor();
  } catch (error) {
    await page.screenshot({ path: '/tmp/pos-admin-api-health-failure.png', fullPage: true });
    console.log(JSON.stringify({ verification: 'VERIFIED FAIL', alerts: await page.getByRole('alert').allTextContents(), errors }));
    throw error;
  }
  await page.screenshot({ path: `${output}/health-desktop.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: authenticated Admin System Health rendered without JavaScript errors');
  const beforeReturn = dashboardRequests;
  await page.getByRole('navigation', { name: 'Primary modules' }).getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.locator('.admin-dashboard-metrics').waitFor();
  await page.waitForTimeout(300);
  assert.equal(dashboardRequests, beforeReturn, 'Returning to Dashboard unnecessarily fetched metrics');
  await page.getByRole('button', { name: /Filters/, exact: false }).click();
  assert.equal(await page.getByLabel('Order type', { exact: true }).inputValue(), 'takeaway', 'Dashboard scope was reset by navigation');
  assert.equal(await page.getByRole('button', { name: 'Yesterday', exact: true }).getAttribute('aria-pressed'), 'true', 'Dashboard period was reset by navigation');
  assert.equal(await page.locator('.admin-dashboard-footnote').textContent(), lastUpdated, 'Dashboard snapshot was reset by navigation');
  const [refreshResponse] = await Promise.all([
    dashboardResponse(), page.getByRole('button', { name: 'Refresh', exact: true }).click(),
  ]);
  assert.equal(refreshResponse.ok(), true, 'Explicit dashboard refresh failed');
  await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
  assert.equal(dashboardRequests, beforeReturn + 1, 'Explicit dashboard refresh should fetch once');
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: dashboard navigation preserves filters and snapshot without fetching; explicit refresh fetches once using real authenticated local RPCs');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Find a module', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find module by name' }).fill('system-health');
  await page.locator('.admin-command-results [data-admin-section="system-health"]').click();
  await page.getByRole('heading', { name: 'Live API Connections', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'Health screen overflows the mobile viewport');
  await page.screenshot({ path: `${output}/health-mobile.png`, fullPage: true });
  await writeFile(`${output}/local.json`, JSON.stringify({ ...report, browser: 'VERIFIED PASS', realtime: 'SUBSCRIBED', dashboardSnapshot: 'VERIFIED PASS', mobileLayout: 'VERIFIED PASS', completedAt: new Date().toISOString() }, null, 2));
} finally {
  await browser?.close();
  if (userId) {
    await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { status: 'INACTIVE' });
    await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
  }
}
