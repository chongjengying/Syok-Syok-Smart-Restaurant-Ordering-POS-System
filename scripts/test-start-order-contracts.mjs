import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/20260907370000_trusted_draft_order_creation.sql', import.meta.url), 'utf8');
for (const required of [
  "'order.create'", 'public.require_terminal_staff_session()', "public.has_pos_permission('order.create')",
  'new.company_id := s.company_id', 'new.branch_id := s.branch_id', 'new.terminal_id := s.terminal_id',
  'new.created_by_staff_id := s.staff_id', 'public.next_branch_order_number(s.branch_id)', 'for update',
  "status = 'AVAILABLE'", "'DRAFT'", "p_dining_mode = 'takeaway' and p_table_id is not null",
  "'ORDER_CREATED'", "'TABLE_OCCUPIED'",
]) assert.ok(sql.includes(required), `Missing start-order invariant: ${required}`);
assert.ok(!sql.includes('max(order_number)'), 'Order number generation must not use MAX().');
assert.ok(sql.includes('where created_by_staff_id = s.staff_id and idempotency_key = key'), 'Draft retries must be idempotent.');
assert.ok(sql.includes('branch_row.company_id = s.company_id') && sql.includes('table_row.branch_id = s.branch_id'), 'Dine-in tables must be scoped to the trusted context.');
console.log('PASS start-order contracts: trusted session, RBAC, branch counter, idempotency, atomic table claim, audit');
