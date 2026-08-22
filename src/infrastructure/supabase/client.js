import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

console.info(`[POS] Environment: ${env.appEnv}`);
console.info(`[POS] Supabase: ${env.supabaseUrl}`);

export const supabase = createClient(env.supabaseUrl, env.supabaseKey);
