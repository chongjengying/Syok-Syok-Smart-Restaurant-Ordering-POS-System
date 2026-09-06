import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env';

console.info(`[POS] Environment: ${env.appEnv}`);
// Email/password administration and PIN operator tokens have separate lifetimes.
export const accountSupabase = createClient(env.supabaseUrl, env.supabaseKey);
export const operatorSupabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: { persistSession: false, detectSessionInUrl: false, storageKey: 'pos-operator-session' },
});
let operatorMode = false;
const listeners = new Set();
export const isOperatorMode = () => operatorMode;
export function setOperatorMode(enabled) {
  operatorMode = enabled;
  void (enabled ? operatorSupabase : accountSupabase).auth.getSession().then(({ data }) => {
    listeners.forEach(callback => callback('SIGNED_IN', data.session));
    globalThis.dispatchEvent?.(new Event('pos-settings-updated'));
    globalThis.dispatchEvent?.(new Event('pos-permissions-changed'));
  });
}
export function subscribeEffectiveAuth(callback) {
  listeners.add(callback);
  const a = accountSupabase.auth.onAuthStateChange((event, session) => { if (!operatorMode) callback(event, session); });
  const o = operatorSupabase.auth.onAuthStateChange((event, session) => { if (operatorMode) callback(event, session); });
  return () => { listeners.delete(callback); a.data.subscription.unsubscribe(); o.data.subscription.unsubscribe(); };
}
export const supabase = new Proxy(accountSupabase, {
  get(_target, property) {
    const client = operatorMode ? operatorSupabase : accountSupabase;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
