import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveOrderKitchenProgress,
  groupOrderRounds,
} from '../src/services/order-rounds.service.ts';

const item = (id, batchNo, itemStatus, quantity = 1) => ({ id, batchNo, itemStatus, quantity });

test('groups one bill into ordered kitchen rounds', () => {
  const rounds = groupOrderRounds([
    item('second', 2, 'SUBMITTED'),
    item('first', 1, 'READY'),
    item('third', 3, 'PREPARING'),
  ]);
  assert.deepEqual(rounds.map(({ roundNo, isAddOn, status }) => ({ roundNo, isAddOn, status })), [
    { roundNo: 1, isAddOn: false, status: 'READY' },
    { roundNo: 2, isAddOn: true, status: 'WAITING' },
    { roundNo: 3, isAddOn: true, status: 'PREPARING' },
  ]);
});

test('mixed round states produce an in-progress summary', () => {
  assert.deepEqual(deriveOrderKitchenProgress([
    item('waiting', 1, 'SUBMITTED', 2),
    item('preparing', 2, 'PREPARING'),
    item('ready', 3, 'READY'),
  ]), {
    label: 'ORDER IN PROGRESS', waiting: 2, preparing: 1, ready: 1, served: 0, cancelled: 0,
  });
});

test('overall READY requires every active kitchen item to be ready', () => {
  assert.equal(deriveOrderKitchenProgress([
    item('ready', 1, 'READY'), item('served', 1, 'SERVED'),
  ]).label, 'READY');
  assert.equal(deriveOrderKitchenProgress([
    item('ready', 1, 'READY'), item('waiting', 2, 'SUBMITTED'),
  ]).label, 'ORDER IN PROGRESS');
});
