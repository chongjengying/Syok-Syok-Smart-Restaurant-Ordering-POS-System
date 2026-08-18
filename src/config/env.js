function requiredEnvironmentValue(name, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const supabaseUrl = requiredEnvironmentValue('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);

try {
  new URL(supabaseUrl);
} catch {
  throw new Error('VITE_SUPABASE_URL must be a valid URL.');
}

export const env = Object.freeze({
  supabaseUrl,
  supabaseAnonKey: requiredEnvironmentValue('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
});
