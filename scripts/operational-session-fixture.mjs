// Local integration tests deliberately provision a real auth-session binding.
// This does not weaken the production PIN endpoint or expose a client bypass.
export async function bindTestTerminal({ status, userId, accessToken, branchId }) {
  if (!['127.0.0.1','localhost'].includes(new URL(status.API_URL).hostname)) throw new Error('Local tests only');
  async function service(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(`${status.API_URL}/rest/v1/${path}`, { method, headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(JSON.stringify(data)); return data;
  }
  const response = await fetch(`${status.API_URL}/rest/v1/branches?id=eq.${branchId}&select=company_id`, { headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}` } });
  const [branch] = await response.json();
  const device = crypto.randomUUID()+crypto.randomUUID();
  const [profile] = await service(`profiles?id=eq.${userId}&select=role_id,name`, undefined);
  const [staff] = await service('staff', { staff_code:`TEST-${crypto.randomUUID().slice(0,8)}`, name:profile.name, company_id:branch.company_id, branch_id:branchId, role_id:profile.role_id, legacy_profile_id:userId, active:true });
  const [terminal] = await service('pos_terminals', { branch_id: branchId, company_id: branch.company_id, terminal_code: `TEST-${crypto.randomUUID().slice(0,8)}`, name:'Integration test terminal', status:'ACTIVE', terminal_type:'CASHIER', registration_status:'REGISTERED', device_identifier:device, auth_user_id:userId, authenticated_at:new Date().toISOString(), access_mode:'ALL_BRANCH_STAFF', allowed_roles:['ADMIN','MANAGER','WAITER','KITCHEN','CASHIER'] });
  await service('staff_branch_assignments', { staff_id:userId, branch_id:branchId, is_primary:true, status:'ACTIVE' });
  const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
  await service('rpc/begin_terminal_staff_session', { p_actor:userId,p_staff_id:userId,p_device_identifier:device,p_auth_session_id:claims.session_id });
  return {terminal,device};
}
