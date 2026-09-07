import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import { consumeRateLimit } from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('POST, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication is required.', code: 'AUTHENTICATION_REQUIRED' });
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: 'Server configuration is incomplete.', code: 'SERVER_ERROR' });

  let body: { userId?: string; pin?: string; deviceIdentifier?: string };
  try { body = await request.json(); } catch { return json(400, { error: 'A valid request is required.', code: 'INVALID_REQUEST' }); }
  const userId = String(body.userId || '');
  const pin = String(body.pin || '');
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^\d{6}$/.test(pin)) return json(400, { error: 'Enter a valid six-digit PIN.', code: 'INVALID_PIN' });

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: callerAuth, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerAuth.user) return json(401, { error: 'The terminal session expired.', code: 'SESSION_EXPIRED' });
  const { data: callerProfile, error: profileError } = await caller.from('profiles').select('status').eq('id', callerAuth.user.id).single();
  if (profileError || !callerProfile || callerProfile.status !== 'ACTIVE') {
    return json(403, { error: 'An active terminal session is required.', code: 'ACTIVE_PROFILE_REQUIRED' });
  }

  const limit = await consumeRateLimit(`${callerAuth.user.id}:${userId}`, 'staff-pin-session', 5, 300);
  if (!limit.allowed) return json(limit.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 503, {
    error: limit.error === 'RATE_LIMIT_EXCEEDED' ? 'Too many PIN attempts. Try again later.' : 'PIN verification is temporarily unavailable.',
    code: limit.error || 'RATE_LIMIT_UNAVAILABLE',
  });

  const { data: terminal } = await admin.from('pos_terminals').select('id,company_id,branch_id,status,registration_status,lock_status').eq('device_identifier', String(body.deviceIdentifier || '')).maybeSingle();
  const { data: targetProfile } = await admin.from('profiles').select('company_id,status').eq('id', userId).maybeSingle();
  const { data: assignment } = terminal && targetProfile
    ? await admin.from('staff_branch_assignments').select('staff_id').eq('staff_id', userId).eq('branch_id', terminal.branch_id).eq('status', 'ACTIVE').maybeSingle()
    : { data: null };
  if (!terminal || terminal.status !== 'ACTIVE' || terminal.registration_status !== 'REGISTERED' || terminal.lock_status === 'LOCKED') {
    return json(403, { error: 'This terminal is currently unavailable. Please contact an administrator.', code: 'TERMINAL_UNAVAILABLE' });
  }
  if (!targetProfile || targetProfile.status !== 'ACTIVE' || targetProfile.company_id !== terminal.company_id || !assignment) {
    return json(403, { error: 'Unable to sign in. Please verify your PIN or contact a manager.', code: 'STAFF_ACCESS_DENIED' });
  }

  const { data: exchange, error: exchangeError } = await admin.rpc('verify_staff_pin_exchange', { p_user_id: userId, p_pin: pin });
  if (exchangeError) {
    console.error('Staff PIN verification failed');
    return json(500, { error: 'PIN verification is temporarily unavailable.', code: 'SERVER_ERROR' });
  }
  if (!exchange?.ok) {
    const locked = exchange?.code === 'PIN_LOCKED';
    const setupRequired = exchange?.code === 'PIN_SETUP_REQUIRED';
    const authUnavailable = exchange?.code === 'STAFF_AUTH_UNAVAILABLE';
    return json(locked ? 423 : setupRequired ? 409 : authUnavailable ? 409 : 401, {
      error: locked
        ? 'This PIN is temporarily locked. Try again in five minutes.'
        : setupRequired
          ? 'Set your six-digit POS PIN before signing in.'
          : authUnavailable
            ? 'This staff profile is not linked to a sign-in account.'
            : 'The PIN is incorrect.',
      code: locked ? 'PIN_LOCKED' : setupRequired ? 'PIN_SETUP_REQUIRED' : authUnavailable ? 'STAFF_AUTH_UNAVAILABLE' : 'INVALID_PIN',
    });
  }

  const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(userId);
  if (targetAuthError || !targetAuth.user || targetAuth.user.email !== String(exchange.email)) {
    return json(409, { error: 'This staff profile is not linked to a sign-in account.', code: 'STAFF_AUTH_UNAVAILABLE' });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: String(exchange.email),
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('Staff session exchange failed');
    return json(500, { error: 'Unable to start the staff session.', code: 'SESSION_EXCHANGE_FAILED' });
  }
  // Exchange on the server so the database session is bound before credentials
  // reach the browser. The admin account session remains separate.
  const staffClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await staffClient.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (verifyError || !verified.session) return json(500, { error: 'Unable to start staff session.', code: 'SESSION_EXCHANGE_FAILED' });
  const claims = JSON.parse(atob(verified.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  const { error: bindingError } = await admin.rpc('begin_terminal_staff_session', {
    p_actor: callerAuth.user.id, p_staff_id: userId, p_device_identifier: body.deviceIdentifier,
    p_auth_session_id: claims.session_id,
  });
  if (bindingError) {
    await staffClient.auth.signOut({ scope: 'local' });
    return json(403, { error: 'The branch, terminal or staff is unavailable.', code: 'TERMINAL_SESSION_REJECTED' });
  }
  return json(200, { data: {
    session: { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token },
    pinResetRequired: Boolean(exchange.pinResetRequired),
  } });
});
