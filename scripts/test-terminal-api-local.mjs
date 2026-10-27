import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';
const status = getLocalSupabaseStatus();
assert.ok(['localhost','127.0.0.1'].includes(new URL(status.API_URL).hostname), 'Local tests only');
let actor;
async function request(path, token, method = 'GET', body, headers = {}) {
  const response = await fetch(`${status.API_URL}${path}`, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = response.status === 204 ? null : await response.json();
  return { response,data };
}
try {
  const session = await request('/auth/v1/signup',status.ANON_KEY,'POST',{});
  assert.equal(session.response.status,200,'Anonymous local device authentication unavailable');
  actor = session.data.user.id;
  const token = session.data.access_token;
  const staffId = crypto.randomUUID();
  const pin = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  const denied = await request('/functions/v1/staff-pin-session',token,'POST',{ staffId,pin });
  assert.equal(denied.response.status,403,'Unbound device API request should be denied');
  assert.equal(denied.data.code,'DEVICE_NOT_ACTIVATED');
  const forged = await request('/functions/v1/staff-pin-session',token,'POST',{ staffId,pin },{ 'x-pos-device-credential': crypto.randomUUID()+crypto.randomUUID() });
  assert.equal(forged.response.status,403);
  assert.equal(forged.data.code,'DEVICE_NOT_ACTIVATED');
  const hidden = await request('/rest/v1/terminal_device_assignments?select=credential_hash',token);
  assert.equal(hidden.response.status,403,'Device hash is readable by browser Auth role');
  const physical = await request('/rest/v1/pos_terminals?select=device_identifier',token);
  assert.equal(physical.response.status,403,'Legacy proof is readable by browser Auth role');
  const activation = await request('/rest/v1/rpc/activate_terminal_with_code',token,'POST',{ p_code:'invalid-format',p_device_identifier:crypto.randomUUID()+crypto.randomUUID(),p_device_name:'Rejected test' });
  assert.equal(activation.response.status,200);
  assert.equal(activation.data.code,'INVALID_ACTIVATION_REQUEST');
  const cors = await fetch(`${status.API_URL}/functions/v1/staff-pin-session`, { method:'OPTIONS',headers:{ Origin:'http://127.0.0.1:5173','Access-Control-Request-Headers':'x-pos-device-credential' } });
  assert.ok(cors.headers.get('access-control-allow-headers')?.includes('x-pos-device-credential'));
  console.log('VERIFIED PASS: local Auth → Edge PIN API → database denial, forged device proof denied, credential columns forbidden, CORS forwarding allowed');
} finally {
  if (actor) {
    const cache = await request(`/rest/v1/api_rate_limit_windows?subject_key=like.${actor}:*&action=eq.staff-pin-session`,status.SERVICE_ROLE_KEY,'DELETE');
    assert.ok(cache.response.ok,'Temporary PIN rate-limit fixture cleanup failed');
    const activationCache = await request(`/rest/v1/api_rate_limit_windows?subject_key=eq.${actor}&action=eq.terminal.activate`,status.SERVICE_ROLE_KEY,'DELETE');
    assert.ok(activationCache.response.ok,'Temporary activation rate-limit fixture cleanup failed');
    const cleanup = await request(`/auth/v1/admin/users/${actor}`,status.SERVICE_ROLE_KEY,'DELETE');
    assert.ok(cleanup.response.ok,'Temporary local Auth user cleanup failed');
  }
}
