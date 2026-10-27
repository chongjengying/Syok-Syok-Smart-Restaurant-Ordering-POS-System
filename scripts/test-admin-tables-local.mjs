import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
assert.ok(['localhost', '127.0.0.1'].includes(new URL(status.API_URL).hostname), 'Local test only');
const userId = execFileSync('docker', [
  'exec', 'supabase_db_Pos_Order', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc',
  "select p.id from public.profiles p join auth.users u on u.id=p.id join public.roles r on r.id=p.role_id where r.name='ADMIN' and p.status='ACTIVE' and p.branch_id is null limit 1",
], { encoding: 'utf8' }).trim();
assert.ok(userId, 'A local branchless administrator is required');
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role: 'authenticated', sub: userId, aud: 'authenticated', iss: 'supabase', exp: expiresAt, iat: Math.floor(Date.now() / 1000) })}`;
const accessToken = `${unsigned}.${createHmac('sha256', status.JWT_SECRET).update(unsigned).digest('base64url')}`;
const headers = { apikey: status.ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
const branchResponse = await fetch(`${status.API_URL}/rest/v1/branches?select=id,code,name,status&status=eq.ACTIVE&limit=1`, { headers });
assert.equal(branchResponse.status, 200);
const [branch] = await branchResponse.json();
assert.ok(branch, 'A local active branch is required');

const noBranch = await fetch(`${status.FUNCTIONS_URL}/tables`, { method: 'POST', headers, body: JSON.stringify({ tableNumber: 'QA-TABLE', area: 'Patio', capacity: 2 }) });
assert.equal(noBranch.status, 409, 'A branchless admin must select a branch');
const noBranchError = await noBranch.json();
assert.equal(noBranchError.code, 'BRANCH_REQUIRED');
assert.match(noBranchError.error, /Select a branch/);
const invalidBranch = await fetch(`${status.FUNCTIONS_URL}/tables`, { method: 'POST', headers, body: JSON.stringify({ branchId: 'invalid', tableNumber: 'QA-TABLE', area: 'Patio', capacity: 2 }) });
assert.equal(invalidBranch.status, 400);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const authUserResponse = await fetch(`${status.API_URL}/auth/v1/user`, { headers });
  assert.equal(authUserResponse.status, 200);
  const user = await authUserResponse.json();
  await page.addInitScript(({ token, expiresAt: expiry, user: identity }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'local-table-test', token_type: 'bearer', expires_in: 3600, expires_at: expiry, user: identity }));
  }, { token: accessToken, expiresAt, user });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  let created = false;
  let submitted = null;
  await page.route('**/functions/v1/tables?*', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return route.fulfill({ json: { data: created ? [{ id: '11111111-1111-4111-8111-111111111111', table_number: 'QA-TABLE', table_name: 'Window', area: 'Patio', capacity: 4, status: 'AVAILABLE', is_active: true, orders: [] }] : [] } });
  });
  await page.route('**/functions/v1/tables', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submitted = route.request().postDataJSON();
    created = true;
    return route.fulfill({ status: 201, json: { data: { id: '11111111-1111-4111-8111-111111111111', branch_id: branch.id, table_number: 'QA-TABLE', table_name: 'Window', area: 'Patio', capacity: 4, status: 'AVAILABLE', is_active: true, orders: [] } } });
  });
  await page.goto('http://127.0.0.1:5173/#admin/tables');
  assert.equal(new URL(page.url()).hash, '#admin/tables', 'Admin table deep link must remain selected');
  const branchSelect = page.getByRole('combobox', { name: 'Table branch' });
  await branchSelect.waitFor({ timeout: 8000 });
  const addButton = page.getByRole('button', { name: 'Add Table' });
  assert.equal(await addButton.isDisabled(), true);
  await branchSelect.selectOption(branch.id);
  assert.equal(await addButton.isEnabled(), true);
  await addButton.click();
  await page.getByRole('textbox', { name: 'Table number' }).fill('QA-TABLE');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Window');
  await page.getByRole('textbox', { name: 'Area' }).fill('Patio');
  await page.getByRole('spinbutton', { name: 'Capacity' }).fill('4');
  assert.equal(await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue(), 'Window');
  await page.getByRole('button', { name: 'Save Table' }).click();
  await page.getByText('Table created successfully.').waitFor();
  assert.equal(submitted.branchId, branch.id);
  assert.equal(submitted.area, 'Patio');
  assert.equal(submitted.tableName, 'Window');
  assert.deepEqual(errors, []);
  console.log('VERIFIED PASS: branchless admin selects branch, enters separate area/name, and creates a table in the selected branch');
} finally {
  await browser.close();
}
