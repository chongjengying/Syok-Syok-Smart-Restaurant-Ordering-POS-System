import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

const [
  authRepository,
  authService,
  app,
  staffSelector,
  staffHandoff,
  adminUsersFunction,
  pinMigration,
] = await Promise.all([
  read('src/features/auth/authRepository.js'),
  read('src/features/auth/authService.js'),
  read('src/app/App.jsx'),
  read('src/components/StaffSelectorScreen.jsx'),
  read('src/hooks/useStaffHandoff.js'),
  read('supabase/functions/admin-users/index.ts'),
  read('supabase/migrations/20260829110000_staff_pin_handoff.sql'),
]);

assert.match(authRepository, /verifyOtp\(\{\s*token_hash:\s*tokenHash,\s*type:\s*'email'\s*\}\)/,
  'Staff PIN token exchange must verify the generated email token hash.');

assert.match(adminUsersFunction, /temporaryPin\s*=\s*pinData\?\.temporaryPin\s*\|\|\s*null/,
  'Admin-created staff accounts must return the generated temporary PIN once.');
assert.match(adminUsersFunction, /data:\s*\{\s*\.\.\.data,\s*temporaryPin\s*\}/,
  'Create staff response must include the temporary PIN for admin handoff.');

assert.match(pinMigration, /status\s+text\s+not\s+null\s+default\s+'SETUP_REQUIRED'[\s\S]*'TEMPORARY_RESET'[\s\S]*'ACTIVE'/,
  'PIN credentials must support a temporary reset state.');
assert.match(pinMigration, /temporary_pin\s*:=\s*lpad[\s\S]*% 1000000/,
  'Reset/create flow must generate a six-digit temporary PIN.');
assert.match(pinMigration, /crypt\(temporary_pin,\s*gen_salt\('bf',\s*12\)\)/,
  'Temporary PIN must be stored only as a bcrypt hash.');
assert.match(pinMigration, /crypt\(p_pin,\s*gen_salt\('bf',\s*12\)\)/,
  'Permanent staff PIN must be stored only as a bcrypt hash.');
assert.match(pinMigration, /pinResetRequired[\s\S]*credential\.status\s*=\s*'TEMPORARY_RESET'/,
  'Successful temporary PIN verification must force permanent PIN setup.');

assert.match(authService, /pinResetRequired\s*=\s*Boolean\(exchange\.data\?\.data\?\.pinResetRequired\)/,
  'Frontend service must preserve the backend permanent-PIN-required flag.');
assert.match(staffHandoff, /setPinResetRequired\(mustResetPin\)/,
  'Staff handoff state must remember that a permanent PIN is required.');
assert.match(app, /setOperatorReady\(!result\.pinResetRequired\)/,
  'App must not unlock POS after temporary PIN until the permanent PIN is saved.');
assert.match(app, /onSignedIn=\{refreshSession\}/,
  'Successful password sign-in must explicitly refresh the validated app session.');
assert.match(app, /onSwitchStaff=\{handleSwitchStaff\}/,
  'Authenticated POS screens must expose a staff PIN handoff action.');
assert.match(app, /handleSwitchStaff[\s\S]*setOperatorReady\(false\)/,
  'Switch Staff must return the terminal to the staff PIN selector without signing out.');

assert.match(staffSelector, /Create New PIN/,
  'PIN screen must show the create-new-PIN step.');
assert.match(staffSelector, /Confirm New PIN/,
  'PIN screen must show the confirm-new-PIN step.');
assert.match(staffSelector, /PINs do not match/,
  'PIN screen must reject mismatched permanent PIN confirmation.');
assert.match(staffSelector, /Other Staff \(\$\{staff\.length-4\}\)/,
  'Other Staff must expand beyond the four quick-access staff accounts.');
assert.match(staffSelector, /Search staff by name or role/,
  'The expanded staff directory must be searchable.');

assert.doesNotMatch(pinMigration, /insert\s+into\s+public\.staff_pin_credentials[\s\S]*values\s*\([^;]*p_pin(?![\s\S]*crypt)/i,
  'Permanent PIN must not be inserted into credentials as plaintext.');

console.log('PASS login flow contracts');
