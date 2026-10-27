import { createClient } from 'npm:@supabase/supabase-js@2';
import { callerHeaders, buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import { consumeRateLimit } from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('POST, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);

// A staff PIN never creates or exposes a staff Auth session. The terminal JWT
// identifies the Auth account; device proof and PostgreSQL bind it to staff server-side.
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey) return json(401, { error: 'Authentication is required.', code: 'AUTHENTICATION_REQUIRED' });

  let body: { staffId?: string; userId?: string; pin?: string };
  try { body = await request.json(); } catch { return json(400, { error: 'A valid request is required.', code: 'INVALID_REQUEST' }); }
  const staffId = String(body.staffId || body.userId || '');
  const pin = String(body.pin || '');
  if (!/^[0-9a-f-]{36}$/i.test(staffId) || !/^\d{6}$/.test(pin)) return json(400, { error: 'Enter a valid six-digit PIN.', code: 'INVALID_PIN' });

  const terminal = createClient(supabaseUrl, anonKey, { global: { headers: callerHeaders(request, authorization) }, auth: { persistSession: false } });
  const { data: callerAuth, error: callerError } = await terminal.auth.getUser();
  if (callerError || !callerAuth.user) return json(401, { error: 'The terminal session expired.', code: 'SESSION_EXPIRED' });
  const limit = await consumeRateLimit(`${callerAuth.user.id}:${staffId}`, 'staff-pin-session', 5, 300);
  if (!limit.allowed) return json(limit.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 503, { error: limit.error === 'RATE_LIMIT_EXCEEDED' ? 'Too many PIN attempts. Try again later.' : 'PIN verification is temporarily unavailable.', code: limit.error || 'RATE_LIMIT_UNAVAILABLE' });

  const { data: verification, error: verificationError } = await terminal.rpc('login_terminal_staff', { p_staff_id: staffId, p_pin: pin });
  if (verificationError) return json(500, { error: 'PIN verification is temporarily unavailable.', code: 'SERVER_ERROR' });
  if (!verification?.ok) {
    const code = String(verification?.code || 'INVALID_PIN');
    const messages: Record<string,string> = {
      STAFF_NOT_FOUND: 'Staff was not found.', STAFF_INACTIVE: 'Staff is inactive.',
      STAFF_ROLE_INACTIVE: 'The staff role is inactive. Contact an administrator.',
      TERMINAL_NOT_FOUND: 'Terminal was not found.', TERMINAL_LOCKED: 'Terminal is locked.',
      TERMINAL_UNAVAILABLE: 'Terminal is disabled or not activated.', BRANCH_INACTIVE: 'Branch is inactive.',
      COMPANY_INACTIVE: 'Company is inactive.', STAFF_COMPANY_ACCESS_DENIED: 'Staff belongs to another company.',
      DEVICE_NOT_ACTIVATED: 'Device is not activated.', DEVICE_REVOKED: 'Device access has been revoked.',
      DEVICE_AUTHENTICATION_INVALID: 'Device authentication is invalid. Activate this device again.',
      STAFF_OUTLET_ACCESS_DENIED: 'Staff does not have access to this branch.',
      STAFF_TERMINAL_ACCESS_DENIED: 'Staff is not assigned to this terminal.',
      PIN_LOCKED: 'This PIN is temporarily locked. Try again in five minutes.',
      PIN_SETUP_REQUIRED: 'Set a staff PIN before signing in.', INVALID_PIN: 'The PIN is incorrect.',
    };
    return json(code === 'PIN_LOCKED' ? 423 : code === 'PIN_SETUP_REQUIRED' ? 409 : code === 'INVALID_PIN' ? 401 : 403, { error: messages[code] || 'Staff login was denied.', code });
  }
  const staffSession = verification.staffSession;
  if (!staffSession) return json(403, { error: 'The branch, terminal or staff is unavailable.', code: 'TERMINAL_SESSION_REJECTED' });
  return json(200, { data: { staffSession, pinResetRequired: Boolean(verification.pinResetRequired) } });
});
