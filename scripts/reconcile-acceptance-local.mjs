import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const keepCode = process.argv[2];
assert.match(keepCode || '', /^QA[A-F0-9]{8}$/, 'Pass the completed local QA branch code to keep');
const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');

async function request(path, token = local.SERVICE_ROLE_KEY, method = 'GET', body) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status} ${result?.code || result?.message || result?.error || ''}`);
  return result;
}

const [home] = await request('/rest/v1/branches?code=eq.MAIN&select=id,company_id');
const [role] = await request(`/rest/v1/roles?company_id=eq.${home.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id`);
const email = `qa-reconcile-${crypto.randomUUID().slice(0, 8)}@example.invalid`;
const password = crypto.randomUUID() + crypto.randomUUID();
const admin = await request('/auth/v1/admin/users', local.SERVICE_ROLE_KEY, 'POST', { email, password, email_confirm: true });
try {
  await request(`/rest/v1/profiles?id=eq.${admin.id}`, local.SERVICE_ROLE_KEY, 'PATCH', {
    name: 'Local QA reconciliation', company_id: home.company_id, branch_id: home.id,
    role_id: role.id, role_name: 'ADMIN', status: 'ACTIVE',
  });
  const token = (await request('/auth/v1/token?grant_type=password', local.ANON_KEY, 'POST', { email, password })).access_token;
  const branches = await request(`/rest/v1/branches?company_id=eq.${home.company_id}&code=like.QA*&select=id,code,name,address,phone,timezone,revision,status`);
  for (const branch of branches.filter(row => row.code !== keepCode && row.name.startsWith('Local POS acceptance') && row.status === 'ACTIVE')) {
    const orders = await request(`/rest/v1/orders?branch_id=eq.${branch.id}&select=id,status`);
    for (const order of orders.filter(row => !['CANCELLED', 'COMPLETED'].includes(row.status))) {
      await request(`/functions/v1/orders/${order.id}/cancel`, token, 'POST', {
        reason: 'Local acceptance run stopped before completion',
        deviceContext: { source: 'local-acceptance-reconciliation' },
      });
    }
    const shifts = await request(`/rest/v1/cashier_shifts?branch_id=eq.${branch.id}&status=eq.OPEN&select=id,opening_float`);
    for (const shift of shifts) await request('/rest/v1/rpc/force_close_cashier_shift', token, 'POST', {
      p_shift_id: shift.id, p_actual_cash: shift.opening_float,
      p_reason: 'Local acceptance run stopped before completion',
    });
    const terminals = await request(`/rest/v1/pos_terminals?branch_id=eq.${branch.id}&select=id,registration_status`);
    for (const terminal of terminals.filter(row => row.registration_status !== 'REVOKED')) {
      await request('/rest/v1/rpc/manage_terminal_device', token, 'POST', {
        p_terminal_id: terminal.id, p_action: 'REVOKE', p_reason: 'Local acceptance fixture retired',
      });
    }
    await request('/rest/v1/rpc/save_branch', token, 'POST', {
      p_id: branch.id,
      p_payload: { code: branch.code, name: branch.name, address: branch.address,
        phone: branch.phone, timezone: branch.timezone, status: 'INACTIVE' },
      p_expected_revision: branch.revision,
    });
    console.log(`VERIFIED PASS: reconciled local QA branch ${branch.code}`);
  }
} finally {
  await request(`/rest/v1/profiles?id=eq.${admin.id}`, local.SERVICE_ROLE_KEY, 'PATCH', { status: 'INACTIVE' });
  await request(`/auth/v1/admin/users/${admin.id}`, local.SERVICE_ROLE_KEY, 'DELETE');
}
