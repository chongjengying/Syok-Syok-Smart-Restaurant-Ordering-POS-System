import assert from 'node:assert/strict';
import { getDeviceCredential, storeDeviceCredential, clearDeviceCredential, deviceProofHeaders, fetchWithDeviceProof } from '../src/infrastructure/supabase/deviceCredential.js';
const values = new Map();
const previousStorage = globalThis.localStorage, previousFetch = globalThis.fetch;
const proof = crypto.randomUUID() + crypto.randomUUID();
try {
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
  assert.deepEqual(deviceProofHeaders(), {});
  values.set('pos.registered-device.v1', proof);
  assert.equal(getDeviceCredential(), '', 'A device identifier must not be used as a credential');
  assert.throws(() => storeDeviceCredential(''), /Invalid terminal credential/);
  storeDeviceCredential(proof);
  assert.equal(getDeviceCredential(), proof);
  let headers;
  globalThis.fetch = async (_request,options) => { headers = options.headers; return new Response('{}'); };
  await fetchWithDeviceProof('http://localhost/rest/v1/rpc/current_terminal_cash_shift', { headers: { Authorization: 'Bearer test-only' } });
  assert.equal(headers.get('x-pos-device-credential'),proof);
  assert.equal(headers.get('Authorization'),'Bearer test-only');
  await fetchWithDeviceProof(new Request('http://localhost', { headers: { apikey: 'test-only' } }));
  assert.equal(headers.get('apikey'),'test-only');
  values.set('pos.terminal.credential.v1', 'bound');
  clearDeviceCredential();
  assert.deepEqual(deviceProofHeaders(),{});
  assert.equal(values.has('pos.registered-device.v1'), false);
  assert.equal(values.has('pos.terminal.credential.v1'), false);
  console.log('VERIFIED PASS: device proof storage, validation, header forwarding and clearing');
} finally {
  globalThis.localStorage = previousStorage;
  globalThis.fetch = previousFetch;
}
