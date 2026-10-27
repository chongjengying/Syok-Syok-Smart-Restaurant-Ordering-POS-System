import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const local = getLocalSupabaseStatus();
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(local.API_URL).hostname), 'Local Supabase only');
async function request(path, method = 'GET', body) {
  const response = await fetch(`${local.API_URL}${path}`, {
    method,
    headers: { apikey: local.ANON_KEY, Authorization: `Bearer ${local.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status} ${result?.code || result?.message || ''}`);
  return result;
}
const [home] = await request('/rest/v1/branches?code=eq.MAIN&select=company_id');
let retiredActors = 0;
for (const profile of await request(`/rest/v1/profiles?company_id=eq.${home.company_id}&role_name=eq.ADMIN&status=eq.ACTIVE&select=id,email,name`)) {
  if (profile.name !== 'Local acceptance administrator' || !/^acceptance-admin-[a-f0-9]{8}@example\.invalid$/.test(profile.email || '')) continue;
  await request(`/rest/v1/profiles?id=eq.${profile.id}`, 'PATCH', { status: 'INACTIVE' });
  await request(`/auth/v1/admin/users/${profile.id}`, 'DELETE');
  retiredActors += 1;
}
let retiredCompanies = 0;
for (const company of await request('/rest/v1/companies?code=like.QB*&status=eq.ACTIVE&select=id,code,name')) {
  if (!/^QB[A-F0-9]{8}$/.test(company.code) || !/^Other-company acceptance [A-F0-9]{8}$/.test(company.name)) continue;
  await request(`/rest/v1/companies?id=eq.${company.id}`, 'PATCH', { status: 'INACTIVE' });
  retiredCompanies += 1;
}
console.log(JSON.stringify({ verification: 'VERIFIED PASS', environment: 'local', retiredActors, retiredCompanies }));
