import {
  createAuthAccount,
  createAuthSession,
  destroyAuthSession,
  fetchAuthSession,
  fetchAuthUser,
  fetchProfile,
  fetchStaffProfiles,
  patchAuthMetadata,
  replacePassword,
  requestPasswordRecovery,
  resendSignupConfirmation,
  patchProfile,
  patchStaffAccess,
  recordSuccessfulLogin,
  subscribeToAuthState,
} from './authRepository';

function validationError(message) {
  return { data: null, error: new Error(message) };
}

function mapProfile(profile, authUser) {
  return {
    id: profile.id,
    name: profile.name,
    username: profile.username || '',
    email: profile.email || authUser.email || '',
    role: profile.role_name || profile.roles?.name || 'CASHIER',
    phone: authUser.user_metadata?.phone || '',
    avatar_url: authUser.user_metadata?.avatar_url || '',
    status: profile.status,
    created_at: profile.created_at,
  };
}

async function currentUser() {
  const { data, error } = await fetchAuthUser();
  if (error || !data.user) {
    return { data: null, error: error || new Error('No active user session.') };
  }
  return { data: data.user, error: null };
}

export function signUp(email, password, fullName) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  if (!normalizedName) return validationError('Full name is required.');
  if (!normalizedEmail) return validationError('Email is required.');
  if (password.length < 8) return validationError('Password must be at least 8 characters long.');
  return createAuthAccount(normalizedEmail, password, normalizedName);
}

export async function signIn(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return validationError('Email and password are required.');
  const result = await createAuthSession(normalizedEmail, password);
  if (!result.error) {
    const audit = await recordSuccessfulLogin();
    if (audit.error) console.error('Unable to record login audit', audit.error);
  }
  return result;
}

export function resendConfirmation(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  return resendSignupConfirmation(normalizedEmail);
}

export function sendPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  return requestPasswordRecovery(normalizedEmail);
}

export function updatePassword(password) {
  if (password.length < 8) return validationError('Password must be at least 8 characters long.');
  return replacePassword(password);
}

export function resendConfirmation(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  return resendSignupConfirmation(normalizedEmail);
}

export function sendPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  return requestPasswordRecovery(normalizedEmail);
}

export function updatePassword(password) {
  if (password.length < 8) return validationError('Password must be at least 8 characters long.');
  return replacePassword(password);
}

export async function signOut() {
  const { error } = await destroyAuthSession();
  return { error };
}

export const logout = signOut;

export function getSession() {
  return fetchAuthSession();
}

export function onAuthStateChange(onChange) {
  return subscribeToAuthState(onChange);
}

export async function getUserProfile() {
  const userResult = await currentUser();
  if (userResult.error) return userResult;
  return fetchProfile(userResult.data.id);
}

export async function getProfile() {
  const userResult = await currentUser();
  if (userResult.error) return userResult;
  const { data, error } = await fetchProfile(userResult.data.id);
  if (error) return { data: null, error };
  return { data: mapProfile(data, userResult.data), error: null };
}

export function listStaffProfiles() {
  return fetchStaffProfiles();
}

export function updateStaffAccess(userId, role, status) {
  const allowedRoles = ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN'];
  const allowedStatuses = ['ACTIVE', 'INACTIVE', 'LOCKED'];
  if (!userId) return validationError('Staff account is required.');
  if (!allowedRoles.includes(role)) return validationError('Select a valid staff role.');
  if (!allowedStatuses.includes(status)) return validationError('Select a valid account status.');
  return patchStaffAccess(userId, { role_name: role, status });
}

export async function updateProfile(formData) {
  const name = formData.name?.trim();
  const username = formData.username?.trim().toLowerCase();
  const phone = formData.phone?.trim() || '';
  const avatarUrl = formData.avatarUrl?.trim() || '';

  if (!name) return validationError('Name is required.');
  if (!username || !/^[a-z0-9._-]{3,50}$/.test(username)) {
    return validationError('Username must be 3-50 characters using letters, numbers, dots, dashes, or underscores.');
  }
  if (phone.length > 30) return validationError('Phone number is too long.');
  if (avatarUrl.length > 500) return validationError('Avatar URL is too long.');

  const userResult = await currentUser();
  if (userResult.error) return userResult;
  const user = userResult.data;

  const profileResult = await patchProfile(user.id, { name, username });
  if (profileResult.error) return { data: null, error: profileResult.error };

  const metadataResult = await patchAuthMetadata({
    phone,
    avatar_url: avatarUrl || user.user_metadata?.avatar_url || '',
    full_name: name,
    name,
  });
  if (metadataResult.error) {
    return {
      data: null,
      error: new Error('Profile details were saved, but contact metadata could not be updated. Please retry.'),
    };
  }

  return {
    data: mapProfile(profileResult.data, metadataResult.data.user || user),
    error: null,
  };
}
