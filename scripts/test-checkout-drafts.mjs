import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the hook with deterministic state and API responses, without a DOM.
const source = readFileSync(new URL('../src/hooks/useCheckout.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function useCheckout', 'function useCheckout');
let slots = [], cursor = 0;
const storage = new Map();
let persisted, failSave = false, savedVersions = [];
const deps = {
  useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
  useCallback: callback => callback,
  useEffect() {},
  sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
  crypto: globalThis.crypto,
  createOrderDraft: async () => ({ data: { id: 'new-order' }, error: null }),
  getOrder: async () => ({ data: persisted, error: null }),
  saveOrderDraftItems: async (_id, _cart, version) => {
    savedVersions.push(version);
    return failSave ? { data: null, error: { code: 'STALE_DRAFT_VERSION' } } : { data: {}, error: null };
  },
};
const useCheckout = new Function(...Object.keys(deps), `${source}\nreturn useCheckout;`)(...Object.values(deps));
function render() {
  cursor = 0;
  return useCheckout({ enabled: true, cart: [], diningMode: 'dine-in', tableId: 'table', tableLabel: 'T1' });
}
function order(overrides = {}) {
  return { id: 'old-order', status: 'DRAFT', paymentStatus: 'PENDING', draftVersion: 8, items: [], ...overrides };
}
persisted = order();
let hook = render();
assert.equal((await hook.openExistingOrder('old-order')).error, null, 'Pending table drafts must reopen');
hook = render();
await hook.createDraftContext('dine-in', 'table', 'T1');
hook = render();
persisted = order({ id: 'new-order', draftVersion: 1 });
await hook.saveDraftCart([]);
assert.equal(savedVersions.at(-1), 0, 'A new table draft inherited the previous draft version');

hook = render();
failSave = true;
persisted = order({ id: 'new-order', draftVersion: 3, items: [{ itemStatus: 'DRAFT', productId: 'remote-product', name: 'Remote meal', unitPrice: 10, options: [], quantity: 2 }] });
const before = savedVersions.length;
const result = await hook.saveDraftCart([]);
assert.equal(savedVersions.length, before + 1, 'Conflicting cart was silently retried and could overwrite remote edits');
assert.equal(result.error.code, 'STALE_DRAFT_VERSION');
assert.equal(result.restoredCart[0].dish.id, 'remote-product');
hook = render();
assert.equal(hook.draftCart[0].quantity, 2);
failSave = false;
await hook.saveDraftCart(result.restoredCart);
assert.equal(savedVersions.at(-1), 3, 'Review and retry must use the refreshed draft version');
console.log('PASS checkout: reopen pending draft, reset version, preserve remote edits, explicit retry');
