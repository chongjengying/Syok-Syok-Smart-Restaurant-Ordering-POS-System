import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLocalSupabaseStatus } from './local-supabase-status.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const appUrl = 'http://127.0.0.1:5173';
const reportDir = resolve(root, 'test-results/system-local');
const startedAt = new Date().toISOString();
const checks = [];
const browserEnabled = !process.argv.includes('--no-browser');
let localStatus, devServer;
const secrets = [];
const redact = value => {
  let text = String(value).replace(/\u001b\[[0-9;]*m/g, '');
  for (const secret of secrets) if (secret) text = text.split(secret).join('[REDACTED]');
  return text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED JWT]')
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, '[REDACTED KEY]')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, '[REDACTED DATABASE URL]');
};
function localUrl(value) {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('System checks require a local target with no credentials in its URL.');
  }
  return url;
}
async function record(name, command, run, coverage) {
  const start = Date.now();
  let result;
  try {
    const output = await run();
    result = { name, command, verification: 'VERIFIED PASS', coverage, durationMs: Date.now() - start, output: redact(output).slice(-12000) };
  } catch (error) {
    result = { name, command, verification: 'VERIFIED FAIL', coverage, durationMs: Date.now() - start, output: redact(error.message).slice(-12000) };
  }
  checks.push(result);
  console.log(`${result.verification}: ${name}`);
  if (result.verification === 'VERIFIED FAIL') console.log(result.output.slice(-2500));
  return result.verification === 'VERIFIED PASS';
}
function command(file, args, timeout = 120000) {
  return new Promise((done, reject) => {
    const child = spawn(file, args, {
      cwd: root, detached: process.platform !== 'win32',
      env: { ...process.env, ...(localStatus ? {
        POS_TEST_API_URL: localStatus.API_URL,
        POS_TEST_ANON_KEY: localStatus.ANON_KEY,
        POS_TEST_SERVICE_ROLE_KEY: localStatus.SERVICE_ROLE_KEY,
      } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', timedOut = false;
    const stop = () => {
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch { /* Already exited. */ }
    };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    const collect = chunk => { output = (output + chunk.toString()).slice(-100000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut || code !== 0) reject(new Error(`${timedOut ? 'Command timed out' : `Exit ${code}`}\n${output}`));
      else done(output);
    });
  });
}
async function reachable(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
}
async function prepareBrowser() {
  if (!await reachable(appUrl)) {
    devServer = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'development', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
      cwd: root, stdio: 'ignore', detached: process.platform !== 'win32',
    });
    devServer.on('error', () => {});
    const deadline = Date.now() + 20000;
    while (!await reachable(appUrl)) {
      if (devServer.exitCode !== null || Date.now() >= deadline) throw new Error('Local Vite server could not start on port 5173.');
      await new Promise(done => setTimeout(done, 250));
    }
  }
  const response = await fetch(`${appUrl}/src/config/env.js`, { signal: AbortSignal.timeout(5000) });
  const source = await response.text();
  const injected = source.match(/import\.meta\.env\s*=\s*(\{[^\n]+?\});/);
  if (!injected) throw new Error('Cannot verify the running app environment; authenticated browser checks were withheld.');
  const config = JSON.parse(injected[1]);
  const browserApi = localUrl(config.VITE_SUPABASE_URL);
  const expectedApi = localUrl(localStatus.API_URL);
  if (browserApi.port !== expectedApi.port || browserApi.pathname !== expectedApi.pathname) {
    throw new Error('The browser backend does not match the local Supabase test target.');
  }
  if (!['local', 'development'].includes(String(config.VITE_APP_ENV || config.MODE || '').toLowerCase())) {
    throw new Error('The app on port 5173 is not configured for local development.');
  }
  return 'Local frontend and Supabase API verified before authenticated browser tests.';
}
const staticScripts = [
  'test:login-flow', 'test:integration-contracts', 'test:security-contracts',
  'test:cash-shifts-contracts', 'test:split-money', 'test:checkout-drafts',
  'test:start-order-contracts', 'test:branch-menu-pricing-contracts',
  'test:terminal-access-ui', 'test:terminal-device-proof', 'test:staff-presentation',
  'test:shift-presentation', 'test:system-health', 'test:system-administration',
];
const databaseScripts = [
  'test:company-role-local', 'test:discount-tenant-local', 'test:inventory-tenant-local',
  'test:terminal-device-local', 'test:staff-detail-local', 'test:shift-management-local',
  'test:inventory-sale-local', 'test:ready-serving-local', 'test:shift-concurrency-local',
];
const browserScripts = ['test:terminal-setup-ui-local', 'test:shift-ui-local'];
function skipped(name, command, reason, coverage) {
  checks.push({ name, command, verification: 'NOT VERIFIED', coverage, durationMs: 0, output: reason });
  console.log(`NOT VERIFIED: ${name} (${reason})`);
}
try {
  const localReady = await record('Local database and API target', 'local Supabase status + Docker database readiness', async () => {
    localStatus = getLocalSupabaseStatus();
    secrets.push(...Object.entries(localStatus).filter(([key]) => /KEY|SECRET|PASSWORD|DB_URL/.test(key)).map(([, value]) => value));
    localUrl(localStatus.API_URL);
    if (!localStatus.ANON_KEY || !localStatus.SERVICE_ROLE_KEY) throw new Error('Local API test credentials are unavailable.');
    await command('docker', ['exec', 'supabase_db_Pos_Order', 'pg_isready', '-U', 'postgres', '-d', 'postgres']);
    if (!await reachable(`${localStatus.API_URL}/auth/v1/health`)) throw new Error('Local Auth API is unavailable.');
    return 'Local database and Auth API reachable.';
  }, 'Environment readiness');
  for (const script of staticScripts) await record(script, `npm run ${script}`, () => command('npm', ['run', script]), 'Source contracts or deterministic state tests; no live authorization claim');
  await record('Browser environment validation', 'node scripts/test-environment.mjs', () => command(process.execPath, ['scripts/test-environment.mjs']), 'Reject incorrect environment and server keys in browser config');
  if (localReady) {
    for (const script of databaseScripts) await record(script, `npm run ${script}`, () => command('npm', ['run', script]), script === 'test:shift-concurrency-local'
      ? 'Database unique constraint across separate connections; temporary terminal cleaned; all shift writes rolled back'
      : 'Local SQL fixtures and financial transactions rolled back');
    await record('Current database integrity', 'scripts/audit-pos-integrity-local.sql via local psql', async () => {
      await command('docker', ['cp', 'scripts/audit-pos-integrity-local.sql', 'supabase_db_Pos_Order:/tmp/audit-pos-integrity-local.sql']);
      return command('docker', ['exec', 'supabase_db_Pos_Order', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/tmp/audit-pos-integrity-local.sql']);
    }, 'Read-only tenant, relationship, financial, and RLS integrity audit');
  } else {
    for (const script of databaseScripts) skipped(script, `npm run ${script}`, 'Local environment preflight failed', 'Database');
    skipped('Current database integrity', 'scripts/audit-pos-integrity-local.sql via local psql', 'Local environment preflight failed', 'Database');
  }

  const browserReady = localReady && browserEnabled && await record('Local browser target', 'verify/start local Vite development server', prepareBrowser, 'Ensure browser tests cannot target a staging backend');
  if (browserReady) {
    await record('Authenticated API and health screen', 'node scripts/test-admin-api-health-local.mjs', () => command(process.execPath, ['scripts/test-admin-api-health-local.mjs']), 'Real local Edge requests and signed-in admin browser; temporary identity cleaned');
    for (const script of browserScripts) await record(script, `npm run ${script}`, () => command('npm', ['run', script]), 'Real local authentication plus fixture-driven UI error/detail states; temporary identities cleaned');
  } else {
    const reason = browserEnabled ? 'Local browser preflight unavailable' : '--no-browser selected';
    skipped('Authenticated API and health screen', 'node scripts/test-admin-api-health-local.mjs', reason, 'Browser and API');
    for (const script of browserScripts) skipped(script, `npm run ${script}`, reason, 'Browser');
  }
  await record('Lint', 'npm run lint', () => command('npm', ['run', 'lint']), 'Frontend lint');
  await record('Local production build', 'npm run build:local', () => command('npm', ['run', 'build:local']), 'Local environment build, no deployment');
} catch (error) {
  checks.push({ name: 'System check runner', command: 'node scripts/check-system-local.mjs', verification: 'VERIFIED FAIL', coverage: 'Runner execution', durationMs: 0, output: redact(error.message) });
  console.log(`VERIFIED FAIL: System check runner\n${redact(error.message)}`);
} finally {
  if (devServer?.pid) {
    try { process.kill(process.platform === 'win32' ? devServer.pid : -devServer.pid, 'SIGTERM'); } catch { /* Already exited. */ }
  }
  const failed = checks.filter(check => check.verification === 'VERIFIED FAIL').length;
  const report = {
    verification: failed ? 'VERIFIED FAIL' : 'PARTIALLY VERIFIED',
    suiteVerification: failed ? 'VERIFIED FAIL' : checks.some(check => check.verification === 'NOT VERIFIED') ? 'PARTIALLY VERIFIED' : 'VERIFIED PASS',
    environment: 'local', startedAt, finishedAt: new Date().toISOString(),
    version: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version,
    passed: checks.filter(check => check.verification === 'VERIFIED PASS').length,
    failed, notVerified: checks.filter(check => check.verification === 'NOT VERIFIED').length,
    limitations: [
      'No staging or production test or deployment.',
      'Cashier payment and serving are verified through authenticated database sessions; a full signed-in cashier browser journey is not covered.',
      'Shift opening concurrency is covered; payment/refund concurrency and external payment gateway confirmation are not covered.',
      'Browser UI checks include mocked detail/error responses; they do not establish that every module works end to end.',
    ], checks,
  };
  await mkdir(reportDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const markdown = `# Local POS system check\n\n${report.verification}; automated suite: ${report.suiteVerification}.\n\n${report.passed} passed, ${failed} failed, ${report.notVerified} not verified.\n\n| Check | Result | Command |\n|---|---|---|\n${checks.map(check => `| ${check.name} | ${check.verification} | \`${check.command}\` |`).join('\n')}\n\n## Coverage limits\n\n${report.limitations.map(item => `- ${item}`).join('\n')}\n`;
  for (const name of [stamp, 'latest']) {
    await writeFile(resolve(reportDir, `${name}.json`), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(reportDir, `${name}.md`), markdown);
  }
  console.log(`\n${report.verification}: ${report.passed} checks passed, ${failed} failed, ${report.notVerified} not verified.`);
  console.log(`Report: ${resolve(reportDir, 'latest.md')}`);
  process.exitCode = failed ? 1 : 0;
}
