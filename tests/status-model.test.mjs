import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  TABLE_STATUSES,
} from '../src/shared/constants.js';

test('canonical order statuses contain no legacy submission or takeaway states', () => {
  assert.deepEqual(ORDER_STATUSES, [
    'DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED',
  ]);
  assert.ok(!ORDER_STATUSES.includes('PLACED'));
  assert.ok(!ORDER_STATUSES.includes('COLLECTED'));
});

test('aggregate payment statuses reserve partial payment without implementing it', () => {
  assert.deepEqual(PAYMENT_STATUSES, ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED']);
});

test('canonical table statuses use DISABLED', () => {
  assert.deepEqual(Object.values(TABLE_STATUSES), [
    'AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED',
  ]);
});
