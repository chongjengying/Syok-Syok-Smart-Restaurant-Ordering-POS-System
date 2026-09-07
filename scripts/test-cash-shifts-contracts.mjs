import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile('supabase/migrations/20260907360000_cashier_shifts_and_cash_controls.sql', 'utf8');
assert.match(sql, /one_open_cashier_shift_per_terminal[\s\S]*where status='OPEN'/i, 'Only one OPEN shift may exist per terminal.');
assert.match(sql, /opening_float numeric[\s\S]*check\(opening_float>=0\)/i, 'Opening float must be immutable shift data with non-negative validation.');
assert.match(sql, /ACTIVE_CASHIER_SHIFT_REQUIRED/i, 'Cash payment must require an active cashier shift.');
assert.match(sql, /assign_payment_cashier_shift/i, 'Payment shift context must come from trusted terminal context.');
assert.match(sql, /record_cash_payment_movement/i, 'Cash sales must create an immutable movement.');
assert.match(sql, /FORCE_CLOSE_REASON_REQUIRED/i, 'Force close must require a reason.');
assert.match(sql, /for update/i, 'Shift close and force-close must lock the shift row.');
assert.match(sql, /cash_difference=round\(p_actual_cash-expected,2\)/i, 'Cash difference must be calculated by the backend.');
assert.doesNotMatch(sql, /max\s*\(\s*shift_number/i, 'Shift numbers must not use MAX + 1.');
console.log('PASS cash shift contracts');
