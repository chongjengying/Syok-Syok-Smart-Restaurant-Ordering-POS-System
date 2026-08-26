function requiredEnvironmentValue(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

const supabaseUrl = requiredEnvironmentValue(
  'VITE_SUPABASE_URL',
  import.meta.env.VITE_SUPABASE_URL
);

const supabaseKey = requiredEnvironmentValue(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
);

const appEnv =
  import.meta.env.VITE_APP_ENV?.trim() ||
  import.meta.env.MODE;

try {
  new URL(supabaseUrl);
} catch {
  throw new Error('VITE_SUPABASE_URL must be a valid URL.');
}

export const env = Object.freeze({
  appEnv,
  supabaseUrl,
  supabaseKey,
});