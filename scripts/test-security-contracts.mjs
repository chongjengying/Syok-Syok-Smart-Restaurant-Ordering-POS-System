import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const root = process.cwd();

const { hasPosCapability, POS_CAPABILITIES } = await import(pathToFileURL(
  path.join(root, 'src', 'shared', 'permissions.js'),
));
assert.equal(hasPosCapability('CASHIER', POS_CAPABILITIES.VIEW_REPORTS), false,
  'Cashier must not receive report/admin capabilities.');
assert.equal(hasPosCapability('KITCHEN', POS_CAPABILITIES.TAKE_PAYMENT), false,
  'Kitchen must not receive payment capabilities.');
assert.equal(hasPosCapability('WAITER', POS_CAPABILITIES.SERVE_ORDER), true,
  'Waiter must be allowed to perform serving operations.');
assert.equal(hasPosCapability('WAITER', POS_CAPABILITIES.OPERATE_KITCHEN), false,
  'Waiter must not receive kitchen operations.');
assert.equal(hasPosCapability('MANAGER', POS_CAPABILITIES.VIEW_REPORTS), true,
  'Manager must be able to view reports.');
assert.equal(hasPosCapability('MANAGER', POS_CAPABILITIES.HANDLE_EXCEPTIONS), true,
  'Manager must be able to handle operational exceptions.');
assert.equal(hasPosCapability('MANAGER', POS_CAPABILITIES.MANAGE_USERS), false,
  'Manager must not manage users.');
assert.equal(hasPosCapability('ADMIN', POS_CAPABILITIES.MANAGE_USERS), true,
  'Admin must be able to manage users.');
assert.equal(hasPosCapability('ADMIN', POS_CAPABILITIES.MANAGE_SYSTEM_SETTINGS), true,
  'Admin must be able to manage system settings.');

async function filesUnder(directory, pattern) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath, pattern);
    return pattern.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

const frontendFiles = await filesUnder(path.join(root, 'src'), /\.(?:js|jsx|ts|tsx)$/);
const frontend = (await Promise.all(frontendFiles.map((file) => readFile(file, 'utf8')))).join('\n');
assert.doesNotMatch(frontend, /sb_secret_[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE_ROLE_KEY|postgres(?:ql)?:\/\//i,
  'Server-only credentials must not appear in frontend source.');

const migrationFiles = await filesUnder(path.join(root, 'supabase', 'migrations'), /\.sql$/);
for (const file of migrationFiles) {
  const sql = await readFile(file, 'utf8');
  const definitions = sql.match(/create\s+or\s+replace\s+function\s+[\s\S]*?\$\$\s*;/gi) || [];
  for (const definition of definitions) {
    if (!/\bsecurity\s+definer\b/i.test(definition)) continue;
    const name = definition.match(/create\s+or\s+replace\s+function\s+([^\s(]+)/i)?.[1] || file;
    assert.match(definition, /\bset\s+search_path\s*=\s*public\b/i,
      `SECURITY DEFINER function ${name} must pin search_path.`);
  }
}

const functions = await filesUnder(path.join(root, 'supabase', 'functions'), /index\.ts$/);
for (const file of functions) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /Authorization/i, `${path.basename(path.dirname(file))} must require authorization.`);
  assert.match(source, /auth\.getUser\s*\(/, `${path.basename(path.dirname(file))} must validate the caller token.`);
  assert.match(source, /status\s*!==\s*'ACTIVE'/, `${path.basename(path.dirname(file))} must reject inactive profiles.`);
}

const paymentFunction = await readFile(
  path.join(root, 'supabase', 'functions', 'payments', 'index.ts'),
  'utf8',
);
assert.match(paymentFunction, /finalAmount\s*<=\s*0/,
  'The payment HTTP boundary must reject zero and negative amounts.');

const signupHardening = await readFile(
  path.join(root, 'supabase', 'migrations', '20260825140000_require_staff_activation.sql'),
  'utf8',
);
assert.match(signupHardening, /'INACTIVE'/, 'New staff profiles must require administrator activation.');

const permissionAudit = await readFile(
  path.join(root, 'supabase', 'migrations', '20260825141000_audit_profile_permission_changes.sql'),
  'utf8',
);
assert.match(permissionAudit, /after\s+update\s+of\s+role_id,\s*role_name,\s*status\s+on\s+public\.profiles/i,
  'Profile permission changes must have a database audit trigger.');
assert.match(permissionAudit, /previousRole[\s\S]*newRole[\s\S]*previousStatus[\s\S]*newStatus/,
  'Permission audits must include previous and new authorization state.');

const roleRls = await readFile(
  path.join(root, 'supabase', 'migrations', '20260815190000_phase15_rls_and_permissions.sql'),
  'utf8',
);
assert.match(roleRls, /public\.current_pos_role\(\)\s+in\s+\('MANAGER',\s*'CASHIER'\)/,
  'Only finance roles may read payment rows through RLS.');
assert.match(roleRls, /public\.current_pos_role\(\)\s+in\s+\('ADMIN',\s*'MANAGER'\)/,
  'Reports must enforce the manager/admin role boundary in the database.');
assert.match(roleRls, /staff_update_own_profile[\s\S]*id\s*=\s*auth\.uid\(\)/,
  'Non-admin staff profile writes must be limited to their own row.');

const adminRbac = await readFile(
  path.join(root, 'supabase', 'migrations', '20260826140000_admin_rbac_and_priority_one.sql'),
  'utf8',
);
assert.match(adminRbac, /create table if not exists public\.permissions/i,
  'Granular permissions must be stored in PostgreSQL.');
assert.match(adminRbac, /create table if not exists public\.role_permissions/i,
  'Role permission assignments must be stored in PostgreSQL.');
assert.match(adminRbac, /profile\.status\s*=\s*'ACTIVE'[\s\S]*permission\.code\s*=\s*p_permission/i,
  'Permission checks must require an active profile and database assignment.');
assert.match(adminRbac, /revoke insert, update, delete on public\.categories, public\.products from authenticated/i,
  'Catalog mutations must be forced through audited RPCs.');
assert.match(adminRbac, /LAST_ACTIVE_ADMIN_REQUIRED/i,
  'The last active administrator must not be removable.');

const adminPhaseB = await readFile(
  path.join(root, 'supabase', 'migrations', '20260826141000_admin_phase_b_reports_and_audit.sql'),
  'utf8',
);
assert.match(adminPhaseB, /has_pos_permission\('payment\.refund'\)/i,
  'Refunds must be protected by a granular database permission.');
assert.match(adminPhaseB, /old_value[\s\S]*new_value/i,
  'Authorization audits must retain old and new values.');

const adminUsersFunction = await readFile(path.join(root, 'supabase', 'functions', 'admin-users', 'index.ts'), 'utf8');
assert.match(adminUsersFunction, /auth\.admin\.inviteUserByEmail/i,
  'Staff creation must use the server-side Auth Admin API.');
assert.match(adminUsersFunction, /has_pos_permission/i,
  'The Admin user boundary must verify database permissions.');

const tableMoveRpc = await readFile(
  path.join(root, 'supabase', 'migrations', '20260812112000_bind_table_move_idempotency.sql'),
  'utf8',
);
assert.match(tableMoveRpc, /security\s+definer/i, 'Table moves must use a transactional RPC.');
assert.match(tableMoveRpc, /pg_advisory_xact_lock/i, 'Table moves must serialize idempotent retries.');
assert.match(tableMoveRpc, /move_pos_order_unbound/i, 'The public table-move boundary must delegate to the atomic worker.');

const tableLifecycle = await readFile(
  path.join(root, 'supabase', 'migrations', '20260812110000_production_table_lifecycle.sql'),
  'utf8',
);
assert.match(tableLifecycle, /create\s+unique\s+index[\s\S]*one_active_order_per_restaurant_table/i,
  'The database must prevent two active dine-in orders from claiming one table.');
assert.match(tableLifecycle, /where\s+id\s+in\s*\([\s\S]*order\s+by\s+id\s+for\s+update/i,
  'Table moves must lock source and destination in deterministic order.');

console.log('PASS security contracts');
