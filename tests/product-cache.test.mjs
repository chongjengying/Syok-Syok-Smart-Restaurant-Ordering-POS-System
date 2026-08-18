import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCT_CACHE_STALE_TIME_MS,
  clearProductCache,
  getProductCache,
  invalidateProductCache,
  isProductCacheStale,
  refreshProductCache,
} from '../src/services/product-cache.service.ts';

const products = [{
  id: 'product-1',
  name: 'Coffee',
  description: '',
  price: 5,
  isActive: true,
  isAvailable: true,
  optionGroups: [],
}];

beforeEach(() => clearProductCache());

test('product cache serves fresh data without issuing another request', async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    return products;
  };

  await refreshProductCache(loader);
  await refreshProductCache(loader);

  assert.equal(calls, 1);
  assert.deepEqual(getProductCache()?.products, products);
});

test('product cache deduplicates concurrent refreshes', async () => {
  let calls = 0;
  let resolveRequest;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveRequest = resolve; });
  };

  const first = refreshProductCache(loader, true);
  const second = refreshProductCache(loader, true);
  resolveRequest(products);

  assert.deepEqual(await first, products);
  assert.deepEqual(await second, products);
  assert.equal(calls, 1);
});

test('failed background refresh preserves cached products', async () => {
  await refreshProductCache(async () => products);
  invalidateProductCache();

  await assert.rejects(
    refreshProductCache(async () => { throw new Error('Network unavailable'); }),
    /Network unavailable/,
  );

  assert.deepEqual(getProductCache()?.products, products);
});

test('stale-time boundary is explicit and deterministic', async () => {
  await refreshProductCache(async () => products);
  const entry = getProductCache();

  assert.equal(isProductCacheStale(entry, entry.fetchedAt + PRODUCT_CACHE_STALE_TIME_MS - 1), false);
  assert.equal(isProductCacheStale(entry, entry.fetchedAt + PRODUCT_CACHE_STALE_TIME_MS), true);
});
