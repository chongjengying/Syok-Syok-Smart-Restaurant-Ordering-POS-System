import { supabase } from '../../infrastructure/supabase/client';

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

export function destroyAuthSession() {
  return supabase.auth.signOut();
}

export function fetchAuthUser() {
  return supabase.auth.getUser();
}

export function fetchAuthSession() {
  return supabase.auth.getSession();
}

export function subscribeToAuthState(onChange) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(onChange);
  return () => subscription.unsubscribe();
}

export function fetchProfile(userId) {
  return supabase
    .from('profiles')
    .select(profileColumns)
    .eq('id', userId)
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
