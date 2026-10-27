import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');
async function request(path, token = local.SERVICE_ROLE_KEY, method = 'GET', body) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}
async function service(path, method = 'GET', body) {
  const result = await request(path, local.SERVICE_ROLE_KEY, method, body);
  assert.ok(result.status >= 200 && result.status < 300, `${method} ${path}: HTTP ${result.status}`);
  return result.data;
}

const [branch] = await service('/rest/v1/branches?status=eq.ACTIVE&name=like.Local%20POS%20acceptance*&select=id,company_id,code&order=created_at.desc&limit=1');
assert.ok(branch?.id, 'Completed local acceptance branch required');
const [order] = await service(`/rest/v1/orders?branch_id=eq.${branch.id}&payment_status=eq.PAID&select=id,status&limit=1`);
const [payment] = await service(`/rest/v1/payments?order_id=eq.${order.id}&status=eq.PAID&select=id&limit=1`);
const [receipt] = await service(`/rest/v1/receipts?order_id=eq.${order.id}&status=eq.ISSUED&select=id,reprint_count&limit=1`);
assert.ok(order?.id && payment?.id && receipt?.id);
const foreignCode = `QB${branch.code.slice(2)}`;
const [company] = await service(`/rest/v1/companies?code=eq.${foreignCode}&select=id,status`);
assert.ok(company?.id, 'Foreign QA company missing');
const [foreignBranch] = await service(`/rest/v1/branches?company_id=eq.${company.id}&select=id&limit=1`);
const [adminRole] = await service(`/rest/v1/roles?company_id=eq.${company.id}&name=eq.ADMIN&scope=eq.COMPANY&select=id&limit=1`);
assert.ok(['ACTIVE', 'INACTIVE'].includes(company.status), 'Foreign QA company has an unexpected status');
let userId;
try {
  if (company.status === 'INACTIVE') {
    await service(`/rest/v1/companies?id=eq.${company.id}`, 'PATCH', { status: 'ACTIVE' });
  }
  const email = `tenant-finance-${crypto.randomUUID().slice(0, 8)}@example.invalid`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  const user = await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true });
  userId = user.id;
  await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', {
    name: 'Local foreign finance boundary', company_id: company.id, branch_id: foreignBranch.id,
    role_id: adminRole.id, role_name: 'ADMIN', status: 'ACTIVE',
  });
  const token = (await request('/auth/v1/token?grant_type=password', local.ANON_KEY, 'POST', { email, password })).data.access_token;
  const cases = [
    ['get_pos_receipt', { p_order_id: order.id }, 'RECEIPT_NOT_FOUND'],
    ['reprint_pos_receipt', { p_receipt_id: receipt.id, p_reason: 'Foreign company denied' }, 'RECEIPT_NOT_FOUND'],
    ['void_pos_payment', { p_payment_id: payment.id, p_reason: 'Foreign company denied', p_idempotency_key: crypto.randomUUID() }, 'PAYMENT_NOT_FOUND'],
    ['cancel_pos_order', { p_order_id: order.id, p_reason: 'Foreign company denied' }, 'ORDER_NOT_FOUND'],
    ['reopen_pos_order', { p_order_id: order.id, p_reason: 'Foreign company denied' }, 'ORDER_NOT_FOUND'],
  ];
  for (const [name, args, code] of cases) {
    const response = await request(`/rest/v1/rpc/${name}`, token, 'POST', args);
    assert.ok(response.status >= 400 && response.status < 500, `${name} exposed another company's record`);
    assert.equal(response.data?.message, code, `${name} returned the wrong boundary result`);
  }
  const [unchangedOrder] = await service(`/rest/v1/orders?id=eq.${order.id}&select=status`);
  const [unchangedReceipt] = await service(`/rest/v1/receipts?id=eq.${receipt.id}&select=reprint_count`);
  assert.equal(unchangedOrder.status, order.status);
  assert.equal(unchangedReceipt.reprint_count, receipt.reprint_count);
  console.log(JSON.stringify({ verification: 'VERIFIED PASS', environment: 'local', cases: cases.length,
    result: 'foreign finance RPCs denied without changing the paid order or receipt' }));
} finally {
  if (userId) {
    await service(`/rest/v1/profiles?id=eq.${userId}`, 'PATCH', { status: 'INACTIVE' });
    await service(`/auth/v1/admin/users/${userId}`, 'DELETE');
  }
  if (company.status === 'INACTIVE') {
    await service(`/rest/v1/companies?id=eq.${company.id}`, 'PATCH', { status: 'INACTIVE' });
  }
}
