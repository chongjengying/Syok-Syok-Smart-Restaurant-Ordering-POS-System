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

const pinEndpoint = await read('supabase/functions/staff-pin-session/index.ts');
assert.match(pinEndpoint, /login_terminal_staff/, 'Server must atomically verify the staff PIN and create the terminal-bound staff session.');
assert.doesNotMatch(pinEndpoint, /generateLink|verifyOtp|access_token|refresh_token/, 'PIN exchange must not mint staff Auth credentials.');
assert.match(authRepository, /accountSupabase\.auth\.getSession\(\)/, 'Operator mode must reuse the terminal Auth session.');
assert.match(authRepository, /createAuthSession[\s\S]*setOperatorMode\(false\)[\s\S]*accountSupabase\.auth\.signInWithPassword/,
  'Email/password sign-in must leave operator mode and use the persistent account client.');
assert.match(authRepository, /createAnonymousSession[\s\S]*setOperatorMode\(false\)[\s\S]*accountSupabase\.auth\.signInAnonymously/,
  'Terminal device sign-in must use the persistent account client.');
assert.match(authRepository, /fetchProfile[\s\S]*accountSupabase[\s\S]*\.from\('profiles'\)/,
  'Administrator profile validation must use the account session, not the operator session.');

assert.match(adminUsersFunction, /const pin\s*=\s*temporaryPin\(\)/,
  'Admin-created staff accounts must generate a temporary PIN at the server boundary.');
assert.match(adminUsersFunction, /p_temporary_pin:\s*pin/,
  'The generated temporary PIN must be passed only to the controlled provisioning RPC.');
assert.match(adminUsersFunction, /pinMode\s*===\s*'ADMIN_TEMPORARY'[\s\S]*temporaryPin:\s*pin/,
  'Create staff response must include the temporary PIN only for administrator-managed PIN setup.');

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
assert.match(app, /onSignedIn=\{handleAuthenticatedLogin\}/,
  'Successful password sign-in must validate the session and route administrators to their workspace.');
assert.match(app, /function adminLandingUrl\(\)[\s\S]*\/admin\$\{hash\.startsWith\('#admin\/'\) \? hash : '#admin\/dashboard'\}/,
  'Admin sign-in and session restore must preserve an existing admin page.');
assert.match(app, /handleAuthenticatedLogin[\s\S]*staff\?\.role === 'ADMIN'[\s\S]*replaceState\(null, '', adminLandingUrl\(\)\)/,
  'Successful administrator login must route to the requested admin page.');
assert.match(app, /if \(!session \|\| profileLoading \|\| adminAccount \|\| \(session\.user\?\.is_anonymous && !isPosPath/,
  'Terminal restoration must wait for profile resolution and skip administrator sessions.');
assert.match(app, /onSwitchStaff=\{handleSwitchStaff\}/,
  'Authenticated POS screens must expose a staff PIN handoff action.');
assert.match(app, /handleSwitchStaff[\s\S]*setOperatorReady\(false\)/,
  'Switch Staff must return the terminal to the staff PIN selector without signing out.');

assert.match(staffSelector, /Create New PIN/,
  'PIN screen must show the create-new-PIN step.');
assert.match(staffSelector, /Confirm New PIN/,
  'PIN screen must show the confirm-new-PIN step.');
assert.match(staffSelector, /PIN reset requested/,
  'PIN screen must clearly identify an administrator-requested PIN reset.');
assert.match(staffSelector, /An administrator reset this PIN/,
  'PIN screen must explain how to use the temporary PIN.');
assert.match(staffSelector, /Temporary PIN accepted/,
  'PIN screen must explain the permanent-PIN stage after temporary PIN acceptance.');
assert.match(staffSelector, /PINs do not match/,
  'PIN screen must reject mismatched permanent PIN confirmation.');
assert.match(staffSelector, /Other Staff \(\$\{staff\.length-4\}\)/,
  'Other Staff must expand beyond the four quick-access staff accounts.');
assert.match(staffSelector, /Enter employee ID or search staff/,
  'The expanded staff directory must be searchable.');

assert.doesNotMatch(pinMigration, /insert\s+into\s+public\.staff_pin_credentials[\s\S]*values\s*\([^;]*p_pin(?![\s\S]*crypt)/i,
  'Permanent PIN must not be inserted into credentials as plaintext.');

console.log('PASS login flow contracts');
