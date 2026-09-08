import { supabase, accountSupabase, operatorSupabase, setOperatorMode, subscribeEffectiveAuth } from '../../infrastructure/supabase/client';
import { env } from '../../config/env';

const profileColumns = 'id, name, username, email, role_name, status, created_at, updated_at, roles(name)';

export function createAuthAccount(email, password, fullName) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, name: fullName } },
  });
}

export function createAuthSession(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export function fetchMyStaffSession() {
  return supabase.rpc('get_my_staff_session');
}

export function fetchSelectableStaff() {
  return accountSupabase.rpc('list_authenticated_terminal_staff');
}

export function requestStaffPinExchange(userId, pin) {
  return accountSupabase.functions.invoke('staff-pin-session', { body: { staffId: userId, pin } });
}

export function persistOwnStaffPin(staffId, pin) {
  return supabase.rpc('set_authenticated_terminal_staff_pin', { p_staff_id: staffId, p_pin: pin });
}

export async function verifyStaffPinToken() {
  const { data, error } = await accountSupabase.auth.getSession();
  if (error || !data.session) return { data: null, error: error || new Error('TERMINAL_SESSION_EXPIRED') };
  // This is intentionally the terminal token, never a staff Auth token.
  const result = await operatorSupabase.auth.setSession(data.session);
  if (!result.error) setOperatorMode(true);
  return result;
}

export function fetchTerminalContext() {
  return accountSupabase.rpc('resolve_authenticated_terminal');
}

export async function probeAuthHealth(signal) {
  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/health`, {
      headers: { apikey: env.supabaseKey },
      signal,
    });
    return { data: response.ok, error: response.ok ? null : new Error('AUTH_HEALTH_UNAVAILABLE') };
  } catch (error) {
    return { data: false, error };
  }
}

export function resendSignupConfirmation(email) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

export function requestPasswordRecovery(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
}

export function replacePassword(password) {
  return supabase.auth.updateUser({ password });
}

export function recordSuccessfulLogin() {
  return supabase.rpc('record_my_login');
}

export async function destroyAuthSession() {
  await operatorSupabase.rpc('end_terminal_staff_session');
  await operatorSupabase.auth.signOut({ scope: 'local' });
  setOperatorMode(false);
  return accountSupabase.auth.signOut();
}

export function fetchAuthUser() {
  return supabase.auth.getUser();
}

export function fetchAuthSession() {
  return supabase.auth.getSession();
}

export function subscribeToAuthState(onChange) {
  return subscribeEffectiveAuth(onChange);
}

export function fetchProfile(userId) {
  return supabase
    .from('profiles')
    .select(profileColumns)
    .eq('id', userId)
    .single();
}

export function fetchStaffProfiles() {
  return supabase
    .from('profiles')
    .select(profileColumns)
    .order('created_at', { ascending: false });
}

export function patchStaffAccess(userId, values) {
  return supabase
    .from('profiles')
    .update(values)
    .eq('id', userId)
    .select(profileColumns)
    .single();
}

export function patchProfile(userId, values) {
  return supabase
    .from('profiles')
    .update(values)
    .eq('id', userId)
    .select(profileColumns)
    .single();
}

export function patchAuthMetadata(values) {
  return supabase.auth.updateUser({ data: values });
}
