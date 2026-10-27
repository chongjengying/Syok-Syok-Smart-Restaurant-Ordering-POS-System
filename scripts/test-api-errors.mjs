import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/infrastructure/supabase/functionsClient.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let calls = 0;
let session = { access_token: 'test-only' };
let respond;
const telemetry = [];
const deps = {
  deviceProofHeaders: () => ({}),
  env: { supabaseUrl: 'http://local.test', supabaseKey: 'test-only' },
  supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
  getApiErrorMessage: ({ code }) => code,
  classifyApiError: ({ code }) => code,
  isInfrastructureFailure: ({ status }) => status >= 500,
  recordApiTelemetry: event => telemetry.push(event),
  fetch: async (_url, options) => { calls++; return respond(options); },
};
const apiRequest = new Function(...Object.keys(deps), `${source}\nreturn apiRequest;`)(...Object.values(deps));

respond = () => new Response('{"data":{"id":"order"}}', { status: 200 });
assert.equal((await apiRequest('orders')).data.id, 'order');
respond = () => new Response(null, { status: 204 });
assert.deepEqual(await apiRequest('orders'), { data: null, error: null });
respond = () => new Response('<html>proxy error</html>', { status: 200 });
const invalid = await apiRequest('payments', { method: 'POST', body: {} });
assert.equal(invalid.error.code, 'INVALID_RESPONSE');
assert.equal(invalid.error.retryable, false, 'Do not encourage retrying an uncertain payment');
assert.equal(telemetry.at(-1).infrastructureFailure, true);
for (const [status, code] of [[401, 'SESSION_EXPIRED'], [403, 'INSUFFICIENT_PERMISSION'], [409, 'ORDER_ALREADY_PAID'], [429, 'RATE_LIMIT_EXCEEDED'], [503, 'SERVER_ERROR']]) {
  respond = () => new Response(JSON.stringify({ code, error: 'Rejected' }), { status });
  const result = await apiRequest('orders');
  assert.equal(result.error.status, status);
  assert.equal(result.error.code, code);
}
respond = () => new Response('Bad gateway', { status: 502 });
assert.equal((await apiRequest('orders')).error.code, 'SERVER_ERROR');
respond = () => { throw new TypeError('Network unavailable'); };
assert.equal((await apiRequest('orders')).error.code, 'NETWORK_ERROR');
const controller = new AbortController();
controller.abort();
const previousCalls = calls;
assert.equal((await apiRequest('orders', { signal: controller.signal })).error.code, 'REQUEST_CANCELLED');
assert.equal(calls, previousCalls, 'Pre-cancelled requests must not reach the server');
respond = ({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
assert.equal((await apiRequest('orders', { timeoutMs: 5 })).error.code, 'REQUEST_TIMEOUT');
session = null;
assert.equal((await apiRequest('orders')).error.code, 'SESSION_EXPIRED');
console.log('API error handling checks passed');
