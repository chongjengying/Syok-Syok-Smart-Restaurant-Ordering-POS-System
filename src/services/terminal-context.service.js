import { accountSupabase, operatorSupabase, supabase, setOperatorMode, isOperatorMode } from '../infrastructure/supabase/client';
export { storeDeviceCredential, clearDeviceCredential } from '../infrastructure/supabase/deviceCredential';
// Physical identity and the secret device proof are distinct after activation.
const deviceKey = 'pos.registered-device.v1';
export function getDeviceIdentifier() {
  let id = globalThis.localStorage.getItem(deviceKey);
  if (!id || id.length < 32) {
    id = crypto.randomUUID() + crypto.randomUUID();
    globalThis.localStorage.setItem(deviceKey, id);
  }
  return id;
}
export function getDeviceDisplayName() {
  const nav = globalThis.navigator;
  const agent = String(nav?.userAgent || '');
  const browser = agent.includes('Edg/') ? 'Edge'
    : agent.includes('Firefox/') ? 'Firefox'
      : agent.includes('Chrome/') ? 'Chrome'
        : agent.includes('Safari/') ? 'Safari'
          : 'Browser';
  const platform = nav?.userAgentData?.platform || (agent.includes('Mac OS') ? 'macOS'
    : agent.includes('Windows') ? 'Windows'
      : agent.includes('Android') ? 'Android'
        : /iPhone|iPad/.test(agent) ? 'iOS'
          : nav?.platform || 'Device');
  return `${browser} / ${platform}`.slice(0, 120);
}
export async function resolveTerminal() {
  return accountSupabase.rpc('resolve_authenticated_terminal', { p_device_identifier: getDeviceIdentifier() });
}
export async function endOperatorSession({ handoff = false } = {}) {
  if (isOperatorMode()) {
    const result = await operatorSupabase.rpc(handoff ? 'switch_terminal_staff_session' : 'end_terminal_staff_session');
    if (result.error) return result;
    // Both clients currently hold the terminal JWT. Revoking it would also log out the device.
    await operatorSupabase.auth.stopAutoRefresh();
  }
  setOperatorMode(false);
  return { error: null };
}
export const lockOperatorSession = () => isOperatorMode() ? supabase.rpc('lock_terminal_staff_session') : Promise.resolve({ error: null });
export const getOperatorSession = () => supabase.rpc('current_terminal_staff_session');
