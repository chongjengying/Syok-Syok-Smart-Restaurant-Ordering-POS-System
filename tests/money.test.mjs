import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/services/money.service.ts';

test('formats POS amounts consistently in Malaysian ringgit', () => {
  assert.equal(formatMoney(40), 'RM 40.00');
  assert.equal(formatMoney('32.33'), 'RM 32.33');
});

test('invalid display values cannot render NaN as money', () => {
  assert.equal(formatMoney(undefined), 'RM 0.00');
  assert.equal(formatMoney('invalid'), 'RM 0.00');
});
