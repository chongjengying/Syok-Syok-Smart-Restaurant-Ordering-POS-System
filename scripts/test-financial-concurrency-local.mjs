import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');
const run = crypto.randomUUID().slice(0, 8).toUpperCase();
const fixture = { branch: null, terminal: null, adminAuthId: null, adminToken: null, terminalAuthId: null };

async function request(path, { token = local.SERVICE_ROLE_KEY, proof, method = 'GET', body, expected } = {}) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(proof ? { 'x-pos-device-credential': proof } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (expected !== undefined) assert.ok([expected].flat().includes(response.status), `${method} ${path}: HTTP ${response.status} ${payload?.message || payload?.error || payload?.code || ''}`);
  else assert.ok(response.ok, `${method} ${path}: HTTP ${response.status} ${payload?.message || payload?.error || payload?.code || ''}`);
  return { status: response.status, payload };
}
const service = (path, method = 'GET', body) => request(path, { method, body });
const actor = (token, proof) => (path, method = 'GET', body, expected) => request(path, { token, proof, method, body, expected });
const rpc = (call, name, args, expected) => call(`/rest/v1/rpc/${name}`, 'POST', args, expected);
const rows = async (table, query) => (await service(`/rest/v1/${table}?${query}`)).payload;
const cents = value => Math.round(Number(value) * 100);

try {
  const [home] = await rows('branches', 'code=eq.MAIN&status=eq.ACTIVE&select=id,company_id');
  assert.ok(home?.id, 'Active local company required');
  const [adminRole] = await rows('roles', `company_id=eq.${home.company_id}&name=eq.ADMIN&scope=eq.COMPANY&select=id`);
  const email = `finance-run-${run.toLowerCase()}@example.invalid`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  const auth = (await service('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true })).payload;
  fixture.adminAuthId = auth.id;
  await service(`/rest/v1/profiles?id=eq.${auth.id}`, 'PATCH', {
    name: 'Local financial concurrency administrator', company_id: home.company_id, branch_id: home.id,
    role_id: adminRole.id, role_name: 'ADMIN', status: 'ACTIVE',
  });
  fixture.adminToken = (await request('/auth/v1/token?grant_type=password', { token: local.ANON_KEY, method: 'POST', body: { email, password } })).payload.access_token;
  const admin = actor(fixture.adminToken);
  const branch = (await rpc(admin, 'save_branch', { p_id: null, p_payload: {
    code: `QC${run}`, name: `Local financial concurrency ${run}`, address: 'Local test fixture',
    phone: '+60123456789', status: 'ACTIVE', timezone: 'Asia/Kuala_Lumpur',
  }, p_expected_revision: null })).payload;
  fixture.branch = branch;
  const terminal = (await rpc(admin, 'save_pos_terminal', {
    p_id: null, p_branch_id: branch.id, p_code: `POS${run}`, p_name: 'Financial concurrency terminal', p_type: 'CASHIER',
  })).payload;
  fixture.terminal = terminal;
  await rpc(admin, 'save_terminal_access', { p_terminal_id: terminal.id, p_access_mode: 'ALL_BRANCH_STAFF',
    p_allowed_roles: ['CASHIER', 'MANAGER', 'KITCHEN', 'WAITER'], p_staff_ids: [] });
  const activation = (await rpc(admin, 'create_terminal_activation_code', { p_terminal_id: terminal.id, p_force_new: true })).payload;
  const staff = [];
  for (const [label, role] of [['REQUESTER', 'CASHIER'], ['APPROVER', 'MANAGER'], ['KITCHEN', 'KITCHEN'], ['WAITER', 'WAITER']]) {
    const created = await admin('/functions/v1/admin-users', 'POST', {
      name: `Finance ${label.toLowerCase()}`, staffCode: `${label.slice(0, 3)}${run}`,
      role, branchId: branch.id, pinMode: 'ADMIN_TEMPORARY',
    }, 201);
    staff.push({ ...created.payload.data, pin: created.payload.data.temporaryPin });
  }
  const [category] = (await service('/rest/v1/categories', 'POST', {
    name: `Finance category ${run}`, company_id: home.company_id, branch_id: branch.id, status: true,
  })).payload;
  const [product] = (await service('/rest/v1/products', 'POST', {
    category_id: category.id, product_name: `Finance item ${run}`, company_id: home.company_id,
    branch_id: branch.id, cost_price: 3, sell_price: 20, status: true, is_available: true,
  })).payload;
  const anonymous = (await request('/auth/v1/signup', { token: local.ANON_KEY, method: 'POST', body: {} })).payload;
  fixture.terminalAuthId = anonymous.user.id;
  const terminalToken = anonymous.access_token;
  const physical = crypto.randomUUID() + crypto.randomUUID();
  const activated = (await rpc(actor(terminalToken), 'activate_terminal_with_code', {
    p_code: activation.code, p_device_identifier: physical, p_device_name: 'Local concurrency device',
  })).payload;
  assert.equal(activated.ok, true);
  const pos = actor(terminalToken, activated.terminalCredential);
  assert.equal((await rpc(pos, 'resolve_authenticated_terminal', { p_device_identifier: physical })).payload.ok, true);
  const firstLogin = await pos('/functions/v1/staff-pin-session', 'POST', { staffId: staff[0].id, pin: staff[0].pin }, 200);
  assert.equal(firstLogin.payload.data.staffSession.staff_record_id, staff[0].id);
  const login = async (index) => {
    await rpc(pos, 'switch_terminal_staff_session', {});
    const response = await pos('/functions/v1/staff-pin-session', 'POST', { staffId: staff[index].id, pin: staff[index].pin }, 200);
    assert.equal(response.payload.data.staffSession.staff_record_id, staff[index].id);
  };
  const shift = (await rpc(pos, 'open_cashier_shift', { p_opening_float: 50 })).payload;
  assert.equal(shift.status, 'OPEN');

  const createOrder = async (label, discount) => {
    const created = await pos('/functions/v1/orders', 'POST', {
      items: [{ productId: product.id, quantity: 2, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' }],
      paymentMethod: 'CASH', diningMode: 'takeaway', idempotencyKey: `${label}-${run}`,
    }, 201);
    const id = created.payload.data.id;
    if (discount) {
      const approvalBody = { discountType: 'PERCENTAGE', value: 10, reason: 'Local concurrency approval',
        managerId: staff[1].id, pin: staff[1].pin };
      const approvals = await Promise.all([0, 1].map(() => pos(`/functions/v1/orders/${id}/manual-discount`, 'POST', approvalBody, [200, 409])));
      assert.ok(approvals.some(result => result.status === 200), `Discount approval did not succeed: ${approvals.map(result => `${result.status}:${result.payload?.code || result.payload?.error}`).join(', ')}`);
      assert.ok(approvals.some(result => result.payload?.data?.replayed === true), 'Identical approval was not replayed');
      const adjustments = await rows('order_adjustments', `order_id=eq.${id}&kind=eq.MANUAL&status=eq.APPLIED&select=id,amount,requested_by_staff_id,approved_by_staff_id`);
      assert.equal(adjustments.length, 1, 'Concurrent discount created multiple applied adjustments');
      assert.equal(adjustments[0].requested_by_staff_id, staff[0].legacyProfileId);
      assert.equal(adjustments[0].approved_by_staff_id, staff[1].legacyProfileId);
      const [authoritative] = await rows('orders', `id=eq.${id}&select=subtotal,discount,total`);
      assert.equal(cents(authoritative.discount), Math.round(cents(authoritative.subtotal) * 0.1), 'Discount was not calculated by the server');
      assert.equal(cents(adjustments[0].amount), cents(authoritative.discount));
      assert.equal((await rows('audit_logs', `entity_type=eq.ORDER&entity_id=eq.${id}&action=eq.MANUAL_DISCOUNT_APPROVED&select=id`)).length, 1,
        'Concurrent discount wrote duplicate approval audits');
    }
    const detail = (await pos(`/functions/v1/orders/${id}`)).payload.data;
    await login(2);
    for (const batch of detail.order_item_batches) {
      await pos(`/functions/v1/orders/${id}/batches/${batch.id}/start`, 'POST', {});
      await pos(`/functions/v1/orders/${id}/batches/${batch.id}/ready`, 'POST', {});
    }
    await login(3);
    await pos(`/functions/v1/orders/${id}/serve`, 'POST', {});
    await login(0);
    await rpc(pos, 'evaluate_order_discounts', { p_order_id: id, p_voucher_code: null });
    return (await pos(`/functions/v1/orders/${id}`)).payload.data;
  };
  const pay = (order, key, expected) => pos('/functions/v1/payments', 'POST', {
    orderId: order.id, paymentMethod: 'CASH', finalAmount: Number(order.total), receivedAmount: 100,
    idempotencyKey: key,
  }, expected);
  const sale = await createOrder('discounted-sale', true);
  const wrongAmount = await pos('/functions/v1/payments', 'POST', {
    orderId: sale.id, paymentMethod: 'CASH', finalAmount: Number(sale.total) + 1, receivedAmount: 100,
    idempotencyKey: `wrong-${run}`,
  }, 409);
  assert.ok(wrongAmount.payload.code);
  const paymentKey = `pay-${run}`;
  const paymentRace = await Promise.all([pay(sale, paymentKey, 200), pay(sale, paymentKey, 200)]);
  assert.equal(new Set(paymentRace.map(result => result.payload.data.payment.id)).size, 1);
  assert.ok(paymentRace.some(result => result.payload.data.replayed === true));
  const [salePayment] = await rows('payments', `order_id=eq.${sale.id}&status=eq.PAID&select=id,amount,received_amount,change_amount`);
  assert.equal(cents(salePayment.amount), cents(sale.total));
  assert.equal(cents(salePayment.change_amount), cents(salePayment.received_amount) - cents(sale.total));
  assert.equal((await rows('payments', `order_id=eq.${sale.id}&status=eq.PAID&select=id`)).length, 1);
  assert.equal((await rows('receipts', `order_id=eq.${sale.id}&select=id`)).length, 1);
  await pay(sale, `second-payment-${run}`, 409);
  await login(1);
  await pos('/functions/v1/payments/refund', 'POST', {
    orderId: sale.id, reason: 'Excess amount must be rejected',
    idempotencyKey: `excess-refund-${run}`, amount: Number(sale.total) + 1, items: [],
  }, 409);
  const refundKey = `refund-${run}`;
  const refundBody = { orderId: sale.id, reason: 'Local concurrency partial refund', idempotencyKey: refundKey,
    amount: Number((Number(sale.total) / 2).toFixed(2)), items: [] };
  const refundRace = await Promise.all([0, 1].map(() => pos('/functions/v1/payments/refund', 'POST', refundBody, 200)));
  assert.equal(new Set(refundRace.map(result => result.payload.data.refund.id)).size, 1);
  assert.ok(refundRace.some(result => result.payload.data.replayed === true));
  const [refund] = await rows('refunds', `order_id=eq.${sale.id}&status=eq.COMPLETED&select=id,amount,requested_by,cashier_shift_id`);
  assert.equal(refund.requested_by, staff[1].legacyProfileId);
  assert.equal(refund.cashier_shift_id, shift.id);
  assert.equal(cents(refund.amount), cents(refundBody.amount));
  assert.equal((await rows('refunds', `order_id=eq.${sale.id}&status=eq.COMPLETED&select=id`)).length, 1);

  await login(0);
  const voidSale = await createOrder('void-sale', false);
  const [voidSaleStored] = await rows('orders', `id=eq.${voidSale.id}&select=total`);
  assert.equal(cents(voidSale.total), cents(voidSaleStored.total), 'Order detail total differs from stored total');
  const competingPayments = await Promise.all([0, 1].map(index => pay(voidSale, `void-pay-${index}-${run}`, [200, 409])));
  assert.equal(competingPayments.filter(result => result.status === 200).length, 1, 'Competing payment keys did not produce one winner');
  assert.equal((await rows('payments', `order_id=eq.${voidSale.id}&status=eq.PAID&select=id`)).length, 1);
  const voidPayment = competingPayments.find(result => result.status === 200).payload.data.payment;
  await login(1);
  const voidBody = { paymentId: voidPayment.id, reason: 'Local concurrency payment void', idempotencyKey: `void-${run}` };
  const voidRace = await Promise.all([0, 1].map(() => pos('/functions/v1/payments/void', 'POST', voidBody, 200)));
  assert.equal(new Set(voidRace.map(result => result.payload.data.void.id)).size, 1);
  assert.ok(voidRace.some(result => result.payload.data.replayed === true));
  const [voidRecord] = await rows('payment_voids', `payment_id=eq.${voidPayment.id}&select=id,requested_by,amount`);
  assert.equal(voidRecord.requested_by, staff[1].legacyProfileId);
  assert.equal(cents(voidRecord.amount), cents(voidSale.total));
  assert.equal((await rows('payment_voids', `payment_id=eq.${voidPayment.id}&select=id`)).length, 1);
  const cashVoidMovements = await rows('cash_movements', `shift_id=eq.${shift.id}&movement_type=eq.CASH_OUT&order_id=eq.${voidSale.id}&select=id,amount,staff_id`);
  assert.equal(cashVoidMovements.length, 1, 'Cash void was not posted once to the drawer ledger');
  assert.equal(cents(cashVoidMovements[0].amount), cents(voidPayment.amount));
  assert.equal(cashVoidMovements[0].staff_id, staff[1].legacyProfileId);

  await login(0);
  const unvoided = await pos('/functions/v1/orders', 'POST', {
    items: [{ productId: product.id, quantity: 1, optionIds: [], specialRequest: '', serviceMode: 'TAKEAWAY' }],
    paymentMethod: 'CASH', diningMode: 'takeaway', idempotencyKey: `admin-void-order-${run}`,
  }, 201);
  const unvoidedId = unvoided.payload.data.id;
  const approvers = await rpc(admin, 'list_order_void_approvers', { p_order_id: unvoidedId });
  assert.ok(approvers.payload.some(person => person.id === staff[1].id), 'Manager missing from admin order approvers');
  const approvedVoid = await admin(`/functions/v1/orders/${unvoidedId}/void`, 'PATCH', {
    managerId: staff[1].id, pin: staff[1].pin, reason: 'Local admin order void approval',
  }, 200);
  assert.equal(approvedVoid.payload.data.status, 'CANCELLED');
  const voidAudit = await rows('audit_logs', `entity_type=eq.ORDER&entity_id=eq.${unvoidedId}&action=eq.ORDER_VOIDED&select=actor_id,metadata`);
  assert.equal(voidAudit.length, 1, 'Admin order void must be audited once');
  assert.equal(voidAudit[0].actor_id, fixture.adminAuthId);
  assert.equal(voidAudit[0].metadata.approved_by, staff[1].legacyProfileId);

  const summary = (await rpc(pos, 'cashier_shift_summary', { p_shift_id: shift.id })).payload;
  const expectedCash = Number(summary.expectedCash);
  const independentlyExpected = cents(50) + cents(sale.total) - cents(refund.amount)
    + cents(voidSale.total) - cents(voidPayment.amount);
  assert.equal(cents(expectedCash), independentlyExpected, 'Shift summary did not reconcile cash sale, refund and void');
  const closeArgs = { p_shift_id: shift.id, p_actual_cash: expectedCash, p_force: false, p_reason: null };
  const closeRace = await Promise.all([0, 1].map(() => rpc(pos, 'close_cashier_shift', closeArgs, 200)));
  assert.equal(closeRace[0].payload.id, closeRace[1].payload.id);
  assert.equal(closeRace[0].payload.status, 'CLOSED');
  const closeLedger = await rows('cash_movements', `shift_id=eq.${shift.id}&movement_type=eq.SHIFT_CLOSE&select=id`);
  assert.equal(closeLedger.length, 1, 'Concurrent close created duplicate ledger entries');
  const [closed] = await rows('cashier_shifts', `id=eq.${shift.id}&select=expected_cash,actual_cash,cash_difference,status`);
  assert.equal(cents(closed.expected_cash), cents(summary.expectedCash));
  assert.equal(cents(closed.actual_cash), cents(expectedCash));
  assert.equal(cents(closed.cash_difference), 0);
  console.log(JSON.stringify({ verification: 'VERIFIED PASS', environment: 'local', branchCode: branch.code,
    paymentRace: 'one payment and receipt', refundRace: 'one refund', voidRace: 'one void',
    discountRace: 'one applied adjustment with distinct requester and approver', adminOrderVoid: 'approved and audited',
    shiftCloseRace: 'one closed shift and close ledger', authoritativeAmounts: true,
    expectedCash: closed.expected_cash, cashDifference: closed.cash_difference }));
} finally {
  if (fixture.adminToken && fixture.branch) {
    const admin = actor(fixture.adminToken);
    const orders = await rows('orders', `branch_id=eq.${fixture.branch.id}&select=id,status,payment_status`);
    for (const order of orders.filter(row => !['COMPLETED', 'CANCELLED'].includes(row.status) && row.payment_status === 'UNPAID')) {
      await admin(`/functions/v1/orders/${order.id}/cancel`, 'POST', { reason: 'Local concurrency fixture retired' }, [200, 409]);
    }
    const open = await rows('cashier_shifts', `branch_id=eq.${fixture.branch.id}&status=eq.OPEN&select=id,opening_float`);
    for (const shift of open) await rpc(admin, 'force_close_cashier_shift', {
      p_shift_id: shift.id, p_actual_cash: shift.opening_float, p_reason: 'Local concurrency fixture retired',
    });
    if (fixture.terminal) await rpc(admin, 'manage_terminal_device', {
      p_terminal_id: fixture.terminal.id, p_action: 'REVOKE', p_reason: 'Local concurrency fixture retired',
    });
    const [current] = await rows('branches', `id=eq.${fixture.branch.id}&select=id,code,name,address,phone,timezone,revision`);
    await rpc(admin, 'save_branch', { p_id: current.id, p_payload: { code: current.code, name: current.name,
      address: current.address, phone: current.phone, timezone: current.timezone, status: 'INACTIVE' },
      p_expected_revision: current.revision });
  }
  if (fixture.adminAuthId) {
    await service(`/rest/v1/profiles?id=eq.${fixture.adminAuthId}`, 'PATCH', { status: 'INACTIVE' });
    // The administrator profile is retained by financial audit foreign keys.
  }
  // Device Auth is retained because its terminal activation is part of the audit history.
}
