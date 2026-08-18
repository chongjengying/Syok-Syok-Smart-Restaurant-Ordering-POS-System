import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCashTender } from '../src/services/cash-payment.service.ts';

test('calculates the requested cash payment example exactly', () => {
  assert.deepEqual(calculateCashTender(32.33, 50), {
    receivedAmount: 50,
    changeAmount: 17.67,
  });
});

test('rejects insufficient or invalid cash received', () => {
  assert.equal(calculateCashTender(32.33, 32), null);
  assert.equal(calculateCashTender(32.33, Number.NaN), null);
});

test('rounds currency to transaction precision', () => {
  assert.deepEqual(calculateCashTender(10.005, 20), {
    receivedAmount: 20,
    changeAmount: 9.99,
  });
});

