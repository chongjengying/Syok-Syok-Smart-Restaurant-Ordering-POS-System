const endpoints = { SANDBOX: 'https://preprod-api.myinvois.hasil.gov.my', PRODUCTION: 'https://api.myinvois.hasil.gov.my' } as const;
const timeoutMs = 15_000;
const encodeBase64 = (value: string) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
};
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('');

async function request(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
export async function myinvoisToken(environment: keyof typeof endpoints, clientId: string, clientSecret: string) {
  const response = await request(`${endpoints[environment]}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'InvoicingAPI' }) });
  if (!response.ok) throw new Error(`MYINVOIS_AUTH_${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}
export async function submitMyinvois(environment: keyof typeof endpoints, token: string, codeNumber: string, document: unknown) {
  const serialized = JSON.stringify(document);
  const documents = [{ format: 'JSON', documentHash: await sha256(serialized), codeNumber, document: encodeBase64(serialized) }];
  const response = await request(`${endpoints[environment]}/api/v1.0/documentsubmissions/`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ documents }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw Object.assign(new Error(`MYINVOIS_SUBMIT_${response.status}`), { payload });
  return payload;
}

export async function getMyinvoisSubmission(environment: keyof typeof endpoints, token: string, submissionUid: string) {
  const response = await request(`${endpoints[environment]}/api/v1.0/documentsubmissions/${encodeURIComponent(submissionUid)}?pageNo=1&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`MYINVOIS_STATUS_${response.status}`), { payload });
  return payload;
}
