import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

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

console.log('PASS security contracts');
