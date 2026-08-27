import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const [migration,endpoint,client,hook]=await Promise.all([
  read('supabase/migrations/20260827100000_system_health_observability.sql'),
  read('supabase/functions/system-health/index.ts'),
  read('src/infrastructure/supabase/functionsClient.js'),
  read('src/hooks/useSystemHealth.ts'),
]);
assert.match(migration,/system\.health\.view/);
assert.match(migration,/r\.name in \('ADMIN','MANAGER'\)/);
assert.match(migration,/enable row level security/g);
assert.match(migration,/revoke all on public\.system_api_events/);
assert.match(endpoint,/has_pos_permission/);
assert.match(endpoint,/return jsonResponse\(403/);
assert.doesNotMatch(endpoint,/password|credit.card|refresh.token/i);
assert.match(endpoint,/Promise\.all/);
assert.match(endpoint,/TIMEOUT/);
assert.match(client,/x-correlation-id/);
assert.doesNotMatch(client,/recordApiTelemetry\([^)]*body/s);
assert.match(hook,/45_000|SYSTEM_HEALTH_CONFIG\.refreshMs/);
assert.match(hook,/activeRequest/);
console.log('System health security and integration contracts passed.');
