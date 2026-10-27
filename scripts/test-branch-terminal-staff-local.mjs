import assert from 'node:assert/strict';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const status = getLocalSupabaseStatus();
let token = status.SERVICE_ROLE_KEY;
const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();

async function request(path, { body, method = body === undefined ? 'GET' : 'POST', service = false } = {}) {
  const response = await fetch(`${status.API_URL}${path}`, {
    method,
    headers: {
      apikey: status.ANON_KEY,
      Authorization: `Bearer ${service ? status.SERVICE_ROLE_KEY : token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, { body });
const [main] = await request('/rest/v1/branches?status=eq.ACTIVE&select=id,company_id&order=created_at.asc&limit=1', { service: true });
assert.ok(main?.id, 'Expected an active local branch');

async function createUser(role) {
  const email = `branch-terminal-${role.toLowerCase()}-${suffix}@example.com`;
  const password = `Branch-${suffix}!`;
  const auth = await request('/auth/v1/signup', { body: { email, password } });
  const [roleRecord] = await request(`/rest/v1/roles?name=eq.${role}&select=id`, { service: true });
  assert.ok(roleRecord?.id, `Expected the seeded ${role} role`);
  await request(`/rest/v1/profiles?id=eq.${auth.user.id}`, {
    method: 'PATCH',
    service: true,
    body: {
      id: auth.user.id,
      company_id: main.company_id,
      email,
      name: `${role} branch test`,
      role_name: role,
      role_id: roleRecord.id,
      status: 'ACTIVE',
    },
  });
  return { ...auth.user, access_token: auth.access_token, email, password };
}

const admin = await createUser('ADMIN');
token = admin.access_token;
const staff = await createUser('WAITER');
const branch = await rpc('save_branch', {
  p_id: null,
  p_payload: { code: `T-${suffix}`, name: `Terminal test ${suffix}`, address: 'Local test address', phone: '+60123456789', timezone: 'Asia/Kuala_Lumpur', status: 'ACTIVE' },
  p_expected_revision: null,
});
const editedBranch = await rpc('save_branch', {
  p_id: branch.id,
  p_payload: {
    ...branch,
    name: `Edited terminal test ${suffix}`,
    operating_model: 'QUICK_SERVICE',
    manager_name: 'Test Manager',
    country: 'Malaysia',
    tax_rate: 6,
  },
  p_expected_revision: branch.revision,
});
assert.equal(editedBranch.name, `Edited terminal test ${suffix}`);
assert.equal(editedBranch.configuration.operating_model, 'QUICK_SERVICE');
assert.equal(editedBranch.configuration.manager_name, 'Test Manager');
const terminal = await rpc('save_pos_terminal', {
  p_id: null,
  p_branch_id: branch.id,
  p_code: `POS-${suffix}`,
  p_name: 'Branch assignment test terminal',
  p_type: 'CASHIER',
});
assert.equal(terminal.branch_id, branch.id);
assert.equal(terminal.registration_status, 'UNREGISTERED');

const assignment = await rpc('assign_user_branch', {
  p_user_id: staff.id,
  p_branch_id: branch.id,
  p_is_primary: true,
});
assert.equal(assignment.staff_id, staff.id);
assert.equal(assignment.branch_id, branch.id);
assert.equal(assignment.status, 'ACTIVE');
assert.equal(assignment.is_primary, true);

const [assignedProfile] = await request(`/rest/v1/profiles?id=eq.${staff.id}&select=id,branch_id,default_branch_id,role_name,status`, { service: true });
assert.equal(assignedProfile.branch_id, branch.id);
assert.equal(assignedProfile.default_branch_id, branch.id);
assert.equal(assignedProfile.role_name, 'WAITER');
assert.equal(assignedProfile.status, 'ACTIVE');
const activeAssignments = await request(`/rest/v1/staff_branch_assignments?staff_id=eq.${staff.id}&status=eq.ACTIVE&select=branch_id`, { service: true });
assert.deepEqual(activeAssignments.map((item) => item.branch_id), [branch.id], 'Moving a staff member must remove their old active branch assignment.');

await rpc('save_terminal_access', {
  p_terminal_id: terminal.id,
  p_access_mode: 'ALL_BRANCH_STAFF',
  p_allowed_roles: [],
  p_staff_ids: [],
});
const [access] = await request(`/rest/v1/pos_terminals?id=eq.${terminal.id}&select=id,branch_id,access_mode,allowed_roles`, { service: true });
assert.equal(access.branch_id, branch.id);
assert.equal(access.access_mode, 'ALL_BRANCH_STAFF');
assert.deepEqual(access.allowed_roles, []);

console.log('PASS branch creation, POS terminal creation, staff assignment, primary branch sync, and all-branch-staff terminal access');
