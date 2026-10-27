import assert from 'node:assert/strict';
import { environmentsMatch, validateBrowserEnvironment } from '../src/config/environment.js';

const config = { appEnv: 'local', supabaseUrl: 'http://127.0.0.1:54321', supabaseKey: 'sb_publishable_fixture' };
assert.equal(environmentsMatch('local', 'DEVELOPMENT'), true);
assert.equal(environmentsMatch('staging', 'DEVELOPMENT'), false);
assert.equal(environmentsMatch('production', 'staging'), false);
assert.equal(environmentsMatch('invalid', 'invalid'), false);
assert.doesNotThrow(() => validateBrowserEnvironment(config));
assert.doesNotThrow(() => validateBrowserEnvironment({ ...config, appEnv: 'staging', supabaseUrl: 'https://fixture.supabase.co' }));
for (const change of [
  { appEnv: 'production' }, { appEnv: 'invalid' },
  { supabaseUrl: 'http://remote.example' },
  { supabaseUrl: 'https://user:pass@remote.example' },
  { supabaseKey: 'sb_secret_fixture' },
  { supabaseKey: 'invalid' },
  { supabaseKey: `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature` },
]) assert.throws(() => validateBrowserEnvironment({ ...config, ...change }));
assert.doesNotThrow(() => validateBrowserEnvironment({ ...config, supabaseKey: `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature` }));
console.log('Environment compatibility and browser configuration checks passed');
