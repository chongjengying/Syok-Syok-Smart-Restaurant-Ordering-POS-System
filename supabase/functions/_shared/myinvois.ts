const endpoints = { SANDBOX: 'https://preprod-api.myinvois.hasil.gov.my', PRODUCTION: 'https://api.myinvois.hasil.gov.my' } as const;
export async function myinvoisToken(environment: keyof typeof endpoints, clientId: string, clientSecret: string) {
  const response = await fetch(`${endpoints[environment]}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'InvoicingAPI' }) });
  if (!response.ok) throw new Error(`MYINVOIS_AUTH_${response.status}`);
  return response.json() as Promise<{ access_token: string; expires_in: number }>;
}
export async function submitMyinvois(environment: keyof typeof endpoints, token: string, documents: unknown[]) {
  const response = await fetch(`${endpoints[environment]}/api/v1.0/documentsubmissions/`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ documents }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw Object.assign(new Error(`MYINVOIS_SUBMIT_${response.status}`), { payload });
  return payload;
}
