import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import { consumeRateLimit } from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('POST, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !url || !anonKey || !serviceKey) return json(401, { error: 'Authentication is required.' });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'The session is invalid or expired.' });
  const { data: profile } = await caller.from('profiles').select('status,role_name').eq('id', auth.user.id).maybeSingle();
  if (!profile || profile.status !== 'ACTIVE' || profile.role_name !== 'ADMIN') return json(403, { error: 'An active Administrator account is required.' });
  const { data: allowed } = await caller.rpc('has_pos_permission', { p_permission: 'terminal.update' });
  if (!allowed) return json(403, { error: 'Terminal management permission is required.' });
  const rate = await consumeRateLimit(auth.user.id, 'terminal-auth-bind', 10, 300);
  if (!rate.allowed) return json(rate.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 503, { error: rate.error === 'RATE_LIMIT_EXCEEDED' ? 'Too many terminal binding attempts. Try again later.' : 'Terminal binding is temporarily unavailable.' });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: 'A valid JSON body is required.' }); }
  const terminalId = typeof body.terminalId === 'string' ? body.terminalId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[0-9a-f-]{36}$/i.test(terminalId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json(400, { error: 'A terminal and valid terminal account email are required.' });

  let page = 1;
  let terminalUser: { id: string; email?: string } | undefined;
  while (page <= 10 && !terminalUser) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json(503, { error: 'Terminal account lookup is temporarily unavailable.' });
    terminalUser = data.users.find((user) => user.email?.toLowerCase() === email);
    if (data.users.length < 1000) break;
    page += 1;
  }
  if (!terminalUser) return json(404, { error: 'No terminal account exists for that email.' });
  if (!terminalUser.email) return json(400, { error: 'The selected Auth account cannot be used as a terminal account.' });

  const { data, error } = await caller.rpc('bind_terminal_auth_account', { p_terminal_id: terminalId, p_auth_user_id: terminalUser.id });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || '';
    const messages: Record<string, string> = {
      INSUFFICIENT_PERMISSION: 'Administrator terminal-management permission is required.',
      TERMINAL_NOT_FOUND: 'The terminal was not found.',
      TERMINAL_SCOPE_DENIED: 'This terminal is outside your company.',
      TERMINAL_NOT_READY: 'Register, activate, and unlock the terminal before binding an account.',
      ADMIN_ACCOUNT_NOT_ALLOWED: 'An Administrator account cannot be used as a terminal account.',
      TERMINAL_AUTH_ALREADY_BOUND: 'That terminal account is already bound to another terminal.',
    };
    return json(code === 'INSUFFICIENT_PERMISSION' ? 403 : code === 'TERMINAL_NOT_FOUND' ? 404 : code === 'TERMINAL_SCOPE_DENIED' ? 403 : code === 'TERMINAL_AUTH_ALREADY_BOUND' ? 409 : 400, { error: messages[code] || 'Unable to bind the terminal account.', code: code || 'TERMINAL_BIND_FAILED' });
  }
  return json(200, { data });
});
