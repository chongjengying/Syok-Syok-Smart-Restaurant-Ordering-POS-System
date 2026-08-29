import {
  createAuthAccount,
  createAuthSession,
  destroyAuthSession,
  fetchAuthSession,
  fetchAuthUser,
  fetchMyStaffSession,
  fetchProfile,
  fetchStaffProfiles,
  patchAuthMetadata,
  replacePassword,
  requestPasswordRecovery,
  resendSignupConfirmation,
  patchProfile,
  patchStaffAccess,
  probeAuthHealth,
  recordSuccessfulLogin,
  subscribeToAuthState,
} from './authRepository';

export const AUTH_ERROR_CODES = Object.freeze({
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PROFILE_REQUIRED: 'PROFILE_REQUIRED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  UNKNOWN: 'UNKNOWN',
});

function authError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function mapAuthenticationError(error) {
  const message = String(error?.message || '').toLowerCase();
  const status = Number(error?.status || 0);
  if (!navigator.onLine || message.includes('fetch') || message.includes('network')) {
    return authError(AUTH_ERROR_CODES.CONNECTION_FAILED, 'Unable to reach the POS service. Check the connection and try again.');
  }
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    return authError(AUTH_ERROR_CODES.RATE_LIMITED, 'Too many sign-in attempts. Wait a moment and try again.');
  }
  if (message.includes('email not confirmed')) {
    return authError(AUTH_ERROR_CODES.EMAIL_NOT_CONFIRMED, 'Confirm your email address before signing in.');
  }
  if (message.includes('invalid login credentials') || status === 400) {
    return authError(AUTH_ERROR_CODES.INVALID_CREDENTIALS, 'The email or password is incorrect.');
  }
  if (status === 401 || message.includes('session') || message.includes('jwt')) {
    return authError(AUTH_ERROR_CODES.SESSION_EXPIRED, 'Your session has expired. Sign in again to continue.');
  }
  return authError(AUTH_ERROR_CODES.UNKNOWN, 'Sign-in could not be completed. Please try again.');
}

function validationError(message) {
  return { data: null, error: new Error(message) };
}

function mapProfile(profile, authUser) {
  return {
    id: profile.id,
    name: profile.name,
    username: profile.username || '',
    email: profile.email || authUser.email || '',
    role: profile.roles?.name || profile.role_name || '',
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

export async function signUp(email, password, fullName) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  if (!normalizedName) return validationError('Full name is required.');
  if (!normalizedEmail) return validationError('Email is required.');
  if (password.length < 8) return validationError('Password must be at least 8 characters long.');
  const result = await createAuthAccount(normalizedEmail, password, normalizedName);
  return result.error ? { data: null, error: mapAuthenticationError(result.error) } : result;
}

export async function signIn(email, password) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return validationError('Email and password are required.');
  const result = await createAuthSession(normalizedEmail, password);
  if (result.error) return { data: null, error: mapAuthenticationError(result.error) };

  const staffResult = await fetchMyStaffSession();
  const staff = staffResult.data;
  if (staffResult.error) {
    await destroyAuthSession();
    return { data: null, error: mapAuthenticationError(staffResult.error) };
  }
  if (!staff) {
    await destroyAuthSession();
    return { data: null, error: authError(AUTH_ERROR_CODES.PROFILE_REQUIRED, 'A staff profile is required. Contact a manager for access.') };
  }
  if (staff.status !== 'ACTIVE') {
    await destroyAuthSession();
    const locked = staff.status === 'LOCKED';
    return { data: null, error: authError(
      locked ? AUTH_ERROR_CODES.ACCOUNT_LOCKED : AUTH_ERROR_CODES.ACCOUNT_INACTIVE,
      locked ? 'This staff account is locked. Contact an administrator.' : 'This staff account is inactive. Contact a manager for access.'
    ) };
  }

  const audit = await recordSuccessfulLogin();
  if (audit.error) console.warn('Login audit could not be recorded.');
  return { data: { ...result.data, staff }, error: null };
}

export async function resendConfirmation(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  const result = await resendSignupConfirmation(normalizedEmail);
  return result.error ? { data: null, error: mapAuthenticationError(result.error) } : result;
}

export async function sendPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return validationError('Email is required.');
  const result = await requestPasswordRecovery(normalizedEmail);
  return result.error ? { data: null, error: mapAuthenticationError(result.error) } : result;
}

export async function updatePassword(password) {
  if (password.length < 8) return validationError('Password must be at least 8 characters long.');
  const result = await replacePassword(password);
  return result.error ? { data: null, error: mapAuthenticationError(result.error) } : result;
}

export async function signOut() {
  const { error } = await destroyAuthSession();
  return { error };
}

export const logout = signOut;

export function getSession() {
  return fetchAuthSession();
}

export async function getValidatedSession() {
  const sessionResult = await fetchAuthSession();
  if (sessionResult.error) return { data: { session: null }, error: mapAuthenticationError(sessionResult.error) };
  if (!sessionResult.data.session) return { data: { session: null }, error: null };
  const userResult = await fetchAuthUser();
  if (userResult.error || !userResult.data.user) {
    await destroyAuthSession();
    return { data: { session: null }, error: mapAuthenticationError(userResult.error) };
  }
  const staffResult = await fetchMyStaffSession();
  if (staffResult.error) {
    return { data: { session: null }, error: mapAuthenticationError(staffResult.error) };
  }
  if (!staffResult.data || staffResult.data.status !== 'ACTIVE') {
    await destroyAuthSession();
    const status = staffResult.data?.status;
    return {
      data: { session: null },
      error: authError(
        status === 'LOCKED' ? AUTH_ERROR_CODES.ACCOUNT_LOCKED : status === 'INACTIVE' ? AUTH_ERROR_CODES.ACCOUNT_INACTIVE : AUTH_ERROR_CODES.PROFILE_REQUIRED,
        status === 'LOCKED' ? 'This staff account is locked. Contact an administrator.' : status === 'INACTIVE' ? 'This staff account is inactive. Contact a manager for access.' : 'A staff profile is required. Contact a manager for access.'
      ),
    };
  }
  return { data: { session: sessionResult.data.session, staff: staffResult.data }, error: null };
}

export function onAuthStateChange(onChange) {
  return subscribeToAuthState(onChange);
}

export async function checkAuthConnection(signal) {
  if (!navigator.onLine) return { data: 'OFFLINE', error: null };
  const result = await probeAuthHealth(signal);
  return { data: result.data ? 'ONLINE' : 'UNAVAILABLE', error: result.error };
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

export async function getStaffSession() {
  const { data, error } = await fetchMyStaffSession();
  return { data, error: error ? mapAuthenticationError(error) : null };
}

export function listStaffProfiles() {
  return fetchStaffProfiles();
}

export function updateStaffAccess(userId, role, status) {
  const allowedRoles = ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN'];
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
