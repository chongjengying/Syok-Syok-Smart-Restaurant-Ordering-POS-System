import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CART_NOTE_MAX_LENGTH,
  calculateCartPreviewTotals,
  changeCartItemQuantity,
  getCartItemCount,
  getCartItemPreviewTotal,
  normalizeCartNote,
  removeCartItem,
} from '../src/services/cart.service.ts';

const item = {
  dish: { id: 'p1', name: 'Coffee', price: 5, description: '', isActive: true, isAvailable: true, optionGroups: [] },
  selectedOptions: [],
  portion: null,
  selectedAddOns: [],
  specialRequest: 'Less sugar',
  quantity: 2,
  finalPrice: 5,
};

test('cart quantity operations are immutable and remove zero-quantity items', () => {
  const cart = [item];
  const increased = changeCartItemQuantity(cart, 0, 1);
  assert.equal(cart[0].quantity, 2);
  assert.equal(increased[0].quantity, 3);
  assert.deepEqual(changeCartItemQuantity([{ ...item, quantity: 1 }], 0, -1), []);
  assert.deepEqual(removeCartItem(cart, 0), []);
});

test('cart totals are explicitly preview calculations', () => {
  assert.deepEqual(calculateCartPreviewTotals([item]), {
    subtotal: 10,
    tax: 0.6,
    serviceCharge: 1,
    total: 11.6,
  });
});

test('cart helpers cap quantities and calculate rounded preview values', () => {
  const capped = changeCartItemQuantity([{ ...item, quantity: 98 }], 0, 5);
  assert.equal(capped[0].quantity, 99);
  assert.equal(getCartItemCount([item, { ...item, quantity: 3 }]), 5);
  assert.equal(getCartItemPreviewTotal({ ...item, finalPrice: 3.335, quantity: 2 }), 6.67);
});

test('cart notes are trimmed and limited to the backend boundary', () => {
  assert.equal(normalizeCartNote('  No onion  '), 'No onion');
  assert.equal(normalizeCartNote('x'.repeat(CART_NOTE_MAX_LENGTH + 10)).length, CART_NOTE_MAX_LENGTH);
});
