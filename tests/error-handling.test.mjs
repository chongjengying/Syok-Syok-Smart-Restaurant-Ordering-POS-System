import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getApiErrorMessage,
  getPriceChangeMessage,
  getUserErrorMessage,
} from '../src/shared/errorMessages.js';

const expectedMessages = [
  ['TABLE_NOT_AVAILABLE', 'occupied'],
  ['PRODUCT_NOT_AVAILABLE', 'no longer available'],
  ['INVALID_ITEM_QUANTITY', 'between 1 and 99'],
  ['ORDER_CREATION_FAILED', 'could not be created'],
  ['KITCHEN_START_FAILED', 'kitchen'],
  ['NETWORK_ERROR', 'network connection'],
  ['SESSION_EXPIRED', 'Sign in again'],
  ['PAYMENT_COMPLETION_FAILED', 'could not be recorded'],
  ['ORDER_ALREADY_PAID', 'already been paid'],
  ['INVALID_ORDER_TRANSITION', 'status changed'],
];

for (const [code, expectedText] of expectedMessages) {
  test(`maps ${code} to an actionable UI message`, () => {
    const message = getApiErrorMessage({ code, status: 409, serverMessage: code.toLowerCase() });
    assert.match(message, new RegExp(expectedText, 'i'));
    assert.notEqual(message, code.toLowerCase());
  });
}

test('maps an unclassified 401 response to session expired', () => {
  assert.match(getApiErrorMessage({ status: 401, serverMessage: 'Unauthorized' }), /session has expired/i);
});

test('maps server and timeout failures without leaking internal details', () => {
  assert.match(getApiErrorMessage({ status: 500, serverMessage: 'database stack trace' }), /POS server/i);
  assert.match(getUserErrorMessage({ code: 'REQUEST_TIMEOUT' }), /did not respond in time/i);
});

test('price changes produce a persisted-total notice', () => {
  assert.equal(getPriceChangeMessage(54.52, 54.52), '');
  assert.match(getPriceChangeMessage(54.52, 56.84), /database total is RM 56\.84/i);
});

test('unknown validation errors retain their useful safe message', () => {
  assert.equal(
    getApiErrorMessage({ code: 'INVALID_ORDER_REQUEST', status: 400, serverMessage: 'items must contain between 1 and 100 entries.' }),
    'items must contain between 1 and 100 entries.',
  );
});
