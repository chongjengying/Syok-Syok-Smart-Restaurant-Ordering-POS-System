import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

// Compile the actual Edge helper with the installed TS transformer, including on
// Node versions supported by Vite that do not import TypeScript natively.
const filename = fileURLToPath(new URL('../supabase/functions/_shared/healthProbe.ts', import.meta.url));
const { code } = await transformWithOxc(await readFile(filename, 'utf8'), filename);
const { FUNCTION_PROBES, probeFunction, summarizeFunctionProbes } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const target = FUNCTION_PROBES.find(probe => probe.name === 'payment-providers');
assert.equal(target.path, 'payments/providers');
assert.equal(FUNCTION_PROBES.find(probe => probe.name === 'admin-users').path, 'admin-users');
const run = fetchImpl => probeFunction('http://localhost:54321', 'public-test-key', 'Bearer test-session', target, { fetchImpl });
const healthy = await run(async (url, options) => {
  assert.equal(url, 'http://localhost:54321/functions/v1/payments/providers');
  assert.equal(options.headers.Authorization, 'Bearer test-session');
  assert.ok(options.signal instanceof AbortSignal);
  return Response.json({ data: [] });
});
assert.equal(healthy.status, 'HEALTHY');
assert.ok(healthy.lastSuccessfulAt);
for (const [http, expected] of [[401, 'WARNING'], [403, 'UNKNOWN'], [404, 'CRITICAL'], [409, 'CRITICAL'], [429, 'WARNING'], [500, 'CRITICAL'], [503, 'CRITICAL']]) {
  const check = await run(async () => Response.json({ error: 'Not available' }, { status: http }));
  assert.equal(check.status, expected, `HTTP ${http}`);
  assert.equal(check.lastSuccessfulAt, undefined);
}
for (const response of [new Response('<html>proxy error</html>'), Response.json({ error: 'Database failed' }), Response.json({})]) {
  assert.equal((await run(async () => response)).status, 'CRITICAL', 'A successful HTTP status alone cannot pass');
}
assert.equal((await run(async () => { throw new TypeError('Network failed'); })).status, 'CRITICAL');
const timeout = await run(async () => { throw new DOMException('Timed out', 'TimeoutError'); });
assert.equal(timeout.status, 'CRITICAL');
assert.match(timeout.message, /timed out/);
// Use a real server that stalls the response body: the deadline must cover JSON too.
const { createServer } = await import('node:http');
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.write('{"data":');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const stalled = await probeFunction(`http://127.0.0.1:${server.address().port}`, 'public-test-key', 'Bearer test-session', target, { timeoutMs: 50 });
  assert.equal(stalled.status, 'CRITICAL');
  assert.match(stalled.message, /timed out/);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
const status = (value, critical = false) => ({ status: value, critical });
assert.equal(summarizeFunctionProbes([healthy]), 'HEALTHY');
assert.equal(summarizeFunctionProbes([healthy, status('UNKNOWN')]), 'UNKNOWN');
assert.equal(summarizeFunctionProbes([healthy, status('CRITICAL', true)]), 'CRITICAL');
assert.equal(summarizeFunctionProbes([healthy, status('CRITICAL')]), 'WARNING');
assert.equal(summarizeFunctionProbes([status('UNKNOWN'), status('WARNING')]), 'WARNING');
assert.equal(summarizeFunctionProbes([status('DEGRADED')]), 'DEGRADED');
assert.equal(summarizeFunctionProbes([]), 'UNKNOWN');
console.log('VERIFIED PASS: live API probe HTTP errors, permissions, malformed responses, network/body timeout, and incomplete coverage states');
