import assert from 'node:assert/strict';
import {
  formatCents,
  parseMoneyToCents,
  selectedItemTotalCents,
  splitCentsEqually,
} from '../src/services/split-payment.service.js';

assert.deepEqual(splitCentsEqually(12000, 3), [4000, 4000, 4000]);
assert.deepEqual(splitCentsEqually(10000, 3), [3333, 3333, 3334]);
assert.deepEqual(splitCentsEqually(10001, 2), [5000, 5001]);
assert.equal(splitCentsEqually(10000, 3).reduce((sum, cents) => sum + cents, 0), 10000);
assert.equal(parseMoneyToCents('33.34'), 3334);
assert.equal(parseMoneyToCents('0'), 0);
assert.equal(parseMoneyToCents('-1'), null);
assert.equal(parseMoneyToCents('1.001'), null);
assert.equal(formatCents(3334), '33.34');
assert.equal(selectedItemTotalCents([
  { orderItemId: 'burger', remainingUnitAmounts: ['20.00'] },
  { orderItemId: 'coke', remainingUnitAmounts: ['5.00', '5.00'] },
], { burger: 1, coke: 1 }), 2500);

console.log('Split-payment money tests passed.');
