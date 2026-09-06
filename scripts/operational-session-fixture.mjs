// Local integration tests deliberately provision a real auth-session binding.
// This does not weaken the production PIN endpoint or expose a client bypass.
export async function bindTestTerminal({ status, userId, accessToken, branchId }) {
  if (!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname)) throw new Error('Local tests only');
  async function service(path, body) {
    const response = await fetch(`${status.API_URL}/rest/v1/${path}`, { method: 'POST', headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
  }
  const response = await fetch(`${status.API_URL}/rest/v1/branches?id=eq.${branchId}&select=company_id`, { headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}` } });
  const [branch] = await response.json();
  const device = crypto.randomUUID()+crypto.randomUUID();
  const [terminal] = await service('pos_terminals', { branch_id: branchId, company_id: branch.company_id, terminal_code: `TEST-${crypto.randomUUID().slice(0,8)}`, name:'Integration test terminal', status:'ACTIVE', terminal_type:'POS', registration_status:'REGISTERED', device_identifier:device });
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  await service('rpc/begin_terminal_staff_session', { p_actor:userId,p_staff_id:userId,p_device_identifier:device,p_auth_session_id:claims.session_id });
  return {terminal,device};
}
