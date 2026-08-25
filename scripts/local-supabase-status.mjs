import { execFileSync } from 'node:child_process';

export function getLocalSupabaseStatus() {
  if (
    process.env.POS_TEST_API_URL
    && process.env.POS_TEST_ANON_KEY
    && process.env.POS_TEST_SERVICE_ROLE_KEY
  ) {
    return {
      API_URL: process.env.POS_TEST_API_URL,
      ANON_KEY: process.env.POS_TEST_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.POS_TEST_SERVICE_ROLE_KEY,
    };
  }

  const output = process.platform === 'win32'
    ? execFileSync(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', 'npx --no-install supabase status --output json'],
        { encoding: 'utf8' },
      )
    : execFileSync(
        'npx',
        ['--no-install', 'supabase', 'status', '--output', 'json'],
        { encoding: 'utf8' },
      );
  return JSON.parse(output);
}
