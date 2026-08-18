import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrderableProduct, mapProductRecord } from '../src/services/product-mapper.ts';

const baseProduct = {
  id: 'product-1',
  name: 'Coffee',
  price: '5.50',
  description: null,
  categoryId: 'category-1',
};

test('legacy active-only responses without availability flags remain visible', () => {
  const product = mapProductRecord(baseProduct);
  assert.equal(product.isActive, true);
  assert.equal(product.isAvailable, true);
  assert.equal(product.price, 5.5);
  assert.equal(isOrderableProduct(product), true);
});

test('explicit inactive or unavailable products remain hidden', () => {
  const inactive = mapProductRecord({ ...baseProduct, status: false });
  const unavailable = mapProductRecord({ ...baseProduct, isActive: true, isAvailable: false });
  assert.equal(isOrderableProduct(inactive), false);
  assert.equal(isOrderableProduct(unavailable), false);
});

test('malformed product records are rejected instead of producing broken cards', () => {
  assert.equal(mapProductRecord({ ...baseProduct, id: '' }), null);
  assert.equal(mapProductRecord({ ...baseProduct, price: 'not-a-price' }), null);
});
