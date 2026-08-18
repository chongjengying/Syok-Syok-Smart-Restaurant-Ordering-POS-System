import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCreateOrderInput } from '../src/features/orders/orderInput.js';

const cart = [{
  dish: { id: 'product-1', isActive: true, isAvailable: true },
  quantity: 2,
  selectedOptions: [{ id: 'option-1' }],
  specialRequest: '  No pepper  ',
  finalPrice: 0.01,
}];

test('buildCreateOrderInput sends product identity and selections, not client prices', () => {
  const result = buildCreateOrderInput({
    cart,
    paymentMethod: 'cash',
    diningMode: 'takeaway',
    idempotencyKey: 'checkout-1',
  });

  assert.deepEqual(result, {
    items: [{ productId: 'product-1', quantity: 2, optionIds: ['option-1'], specialRequest: 'No pepper' }],
    paymentMethod: 'CASH',
    diningMode: 'takeaway',
    tableId: null,
    idempotencyKey: 'checkout-1',
  });
  assert.equal('price' in result.items[0], false);
});

test('buildCreateOrderInput requires a table for dine-in checkout', () => {
  assert.throws(
    () => buildCreateOrderInput({ cart, paymentMethod: 'CASH', diningMode: 'dine-in' }),
    /Select an available table/,
  );
});

test('buildCreateOrderInput rejects invalid quantities', () => {
  assert.throws(
    () => buildCreateOrderInput({
      cart: [{ ...cart[0], quantity: 0 }],
      paymentMethod: 'CASH',
      diningMode: 'takeaway',
    }),
    /invalid quantity/,
  );
});

test('buildCreateOrderInput rejects inactive or unavailable products', () => {
  assert.throws(
    () => buildCreateOrderInput({
      cart: [{ ...cart[0], dish: { ...cart[0].dish, isAvailable: false } }],
      paymentMethod: 'CASH',
      diningMode: 'takeaway',
    }),
    /unavailable/,
  );

  assert.throws(
    () => buildCreateOrderInput({
      cart: [{ ...cart[0], dish: { ...cart[0].dish, isActive: false } }],
      paymentMethod: 'CASH',
      diningMode: 'takeaway',
    }),
    /unavailable/,
  );
});
