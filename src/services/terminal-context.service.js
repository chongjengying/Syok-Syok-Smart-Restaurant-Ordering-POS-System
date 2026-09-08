import { accountSupabase, operatorSupabase, supabase, setOperatorMode, isOperatorMode } from '../infrastructure/supabase/client';
// Kept only for Admin terminal-registration UI compatibility. It is not used
// for operational authentication, which is bound to pos_terminals.auth_user_id.
const deviceKey = 'pos.registered-device.v1';
export function getDeviceIdentifier() {
  let id = globalThis.localStorage.getItem(deviceKey);
  if (!id) { id = crypto.randomUUID() + crypto.randomUUID(); globalThis.localStorage.setItem(deviceKey, id); }
  return id;
}
export async function resolveTerminal() {
  return accountSupabase.rpc('resolve_authenticated_terminal');
}
export async function endOperatorSession() {
  if (isOperatorMode()) {
    const result = await operatorSupabase.rpc('end_terminal_staff_session');
    if (result.error) return result;
    await operatorSupabase.auth.signOut({ scope: 'local' });
  }
  setOperatorMode(false);
  return { error: null };
}
export const lockOperatorSession = () => isOperatorMode() ? supabase.rpc('lock_terminal_staff_session') : Promise.resolve({ error: null });
export const getOperatorSession = () => supabase.rpc('current_terminal_staff_session');
