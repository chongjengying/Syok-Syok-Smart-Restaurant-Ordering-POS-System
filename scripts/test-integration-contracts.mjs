import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  }));
  return nested.flat();
}

const srcRoot = path.join(root, 'src');
const files = await sourceFiles(srcRoot);
const contents = new Map(await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')])));
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');

const clientCreators = [...contents].filter(([, source]) => /\bcreateClient\s*\(/.test(source));
assert.deepEqual(
  clientCreators.map(([file]) => relative(file)),
  ['src/infrastructure/supabase/client.js'],
  'The browser Supabase client must be initialized exactly once.',
);

const directEnvReads = [...contents].filter(([, source]) => /import\.meta\.env/.test(source));
assert.deepEqual(
  directEnvReads.map(([file]) => relative(file)),
  ['src/config/env.js'],
  'Vite environment variables must only be read by the centralized environment module.',
);

const componentViolations = [...contents]
  .filter(([file, source]) => relative(file).startsWith('src/components/') && (
    /@supabase\/supabase-js|infrastructure\/supabase/.test(source)
    || /\bsupabase\s*\.(?:from|rpc|auth|channel)\s*\(/.test(source)
  ))
  .map(([file]) => relative(file));
assert.deepEqual(componentViolations, [], 'React components must not query Supabase directly.');

const transportPath = path.join(srcRoot, 'infrastructure', 'supabase', 'functionsClient.js');
const transport = contents.get(transportPath);
assert.match(transport, /apikey:\s*env\.supabaseKey\b/, 'Edge Function requests must send the configured publishable key.');
assert.doesNotMatch(transport, /env\.supabaseAnonKey\b/, 'Transport must not use an undefined environment property.');

const splitBillScreen = contents.get(path.join(srcRoot, 'components', 'SplitBillScreen.jsx'));
const splitBillErrorBoundary = splitBillScreen.indexOf("summaryError && !summary");
const splitBillLoadingBoundary = splitBillScreen.indexOf("loadingOrder || loadingSummary || !summary");
assert.ok(
  splitBillErrorBoundary >= 0 && splitBillErrorBoundary < splitBillLoadingBoundary,
  'Split-bill summary failures must render an error before the empty-summary loading state.',
);
assert.match(splitBillScreen, /finally\s*{\s*setBusy\(false\);\s*}/, 'Split-payment actions must always clear their busy state.');

const stagingEnv = await readFile(path.join(root, '.env.staging'), 'utf8');
const stagingUrl = stagingEnv.match(/^VITE_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const stagingAppEnv = stagingEnv.match(/^VITE_APP_ENV=(.+)$/m)?.[1]?.trim();
assert.ok(stagingUrl, 'Staging must define VITE_SUPABASE_URL.');
assert.equal(stagingAppEnv, 'staging', 'Staging must explicitly define VITE_APP_ENV=staging.');
assert.doesNotMatch(stagingUrl, /localhost|127\.0\.0\.1/i, 'Staging must not target a local Supabase instance.');
assert.match(stagingUrl, /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i, 'Staging must target an HTTPS Supabase project URL.');

console.log('PASS integration contracts');
