import test from 'node:test';
import assert from 'node:assert/strict';
import { mapCategory, mapProduct } from '../src/features/menu/menuMappers.js';

test('mapCategory normalizes nullable descriptions without inventing fields', () => {
  assert.deepEqual(mapCategory({ id: 'cat-1', name: 'Mains', description: null }), {
    id: 'cat-1',
    name: 'Mains',
    description: '',
  });
});

test('mapProduct converts database numeric values and preserves option groups', () => {
  const mapped = mapProduct({
    id: 'product-1',
    name: 'Burger',
    description: null,
    price: '15.00',
    isActive: true,
    isAvailable: true,
    optionGroups: [{ id: 'group-1' }],
  });

  assert.equal(mapped.price, 15);
  assert.equal(mapped.description, '');
  assert.equal(mapped.isActive, true);
  assert.equal(mapped.isAvailable, true);
  assert.deepEqual(mapped.optionGroups, [{ id: 'group-1' }]);
});

test('mapProduct safely normalizes missing option groups', () => {
  assert.deepEqual(mapProduct({ id: 'product-1', price: 20 }).optionGroups, []);
});
