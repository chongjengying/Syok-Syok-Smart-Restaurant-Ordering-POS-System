export function normalizeEnvironment(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return ['LOCAL', 'DEVELOPMENT', 'STAGING', 'PRODUCTION'].includes(normalized) ? normalized : 'UNKNOWN';
}

export function environmentsMatch(frontend, backend) {
  const a = normalizeEnvironment(frontend);
  const b = normalizeEnvironment(backend);
  const local = value => value === 'LOCAL' || value === 'DEVELOPMENT';
  return a !== 'UNKNOWN' && b !== 'UNKNOWN' && (a === b || (local(a) && local(b)));
}

export function validateBrowserEnvironment({ appEnv, supabaseUrl, supabaseKey }) {
  const environment = normalizeEnvironment(appEnv);
  if (environment === 'UNKNOWN') throw new Error('Configure VITE_APP_ENV as local, development, staging, or production.');
  const url = new URL(supabaseUrl);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL without credentials.');
  }
  if (url.protocol !== 'https:' && !loopback) throw new Error('Remote Supabase connections require HTTPS.');
  if (['STAGING', 'PRODUCTION'].includes(environment) && loopback) {
    throw new Error('Staging and production must not connect to local Supabase.');
  }
  if (supabaseKey.startsWith('sb_secret_')) throw new Error('Browser configuration must use a publishable or anon key.');
  if (supabaseKey.split('.').length === 3) {
    let role;
    try {
      const payload = supabaseKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      role = JSON.parse(atob(payload)).role;
    } catch {
      throw new Error('The Supabase browser key is malformed.');
    }
    if (role !== 'anon') throw new Error('Browser configuration must use a publishable or anon key.');
  } else if (!supabaseKey.startsWith('sb_publishable_')) {
    throw new Error('Browser configuration must use a publishable or anon key.');
  }
}
