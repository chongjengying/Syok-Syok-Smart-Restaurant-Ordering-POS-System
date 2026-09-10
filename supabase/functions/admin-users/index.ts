import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import { consumeRateLimit } from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('GET, POST, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);
const roles = new Set(['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']);
const temporaryPin = () => Array.from(crypto.getRandomValues(new Uint32Array(1)))[0].toString().padStart(10, '0').slice(-6);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !url || !anonKey || !serviceKey) return json(401, { error: 'Authentication is required.' });
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'The session is invalid or expired.' });
  const { data: profile } = await caller.from('profiles').select('company_id,status').eq('id', auth.user.id).maybeSingle();
  if (!profile || profile.status !== 'ACTIVE') return json(403, { error: 'An active administrator profile is required.' });
  const permission = request.method === 'GET' ? 'user.view' : 'user.create';
  const { data: allowed } = await caller.rpc('has_pos_permission', { p_permission: permission });
  if (!allowed) return json(403, { error: 'Staff management permission is required.' });

  if (request.method === 'GET') {
    const search = new URL(request.url).searchParams.get('search')?.trim().toLowerCase() || '';
    const { data: staff, error } = await admin.from('staff').select('id,staff_code,name,company_id,branch_id,active,created_at,roles(name),branches(code,name),staff_pin_credentials_v2(status)').eq('company_id', profile.company_id).order('created_at', { ascending: false });
    if (error) return json(500, { error: 'Unable to load staff.' });
    const users = (staff || []).map((row: Record<string, unknown>) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
      const credential = Array.isArray(row.staff_pin_credentials_v2) ? row.staff_pin_credentials_v2[0] : row.staff_pin_credentials_v2;
      return { id: row.id, staff_code: row.staff_code, username: row.staff_code, name: row.name, role_name: (role as { name?: string } | null)?.name || '', branch_id: row.branch_id, branch: branch || null, status: row.active ? 'ACTIVE' : 'INACTIVE', pin_status: (credential as { status?: string } | null)?.status || 'SETUP_REQUIRED', auth_linked: false };
    }).filter((row) => !search || [row.name,row.staff_code,row.role_name,(row.branch as { code?: string } | null)?.code].some(value => String(value || '').toLowerCase().includes(search)));
    return json(200, { data: { users, pagination: { page: 1, pageSize: users.length, total: users.length } } });
  }

  const rate = await consumeRateLimit(auth.user.id, 'admin-staff-create', 20, 60);
  if (!rate.allowed) return json(rate.error === 'RATE_LIMIT_EXCEEDED' ? 429 : 503, { error: rate.error === 'RATE_LIMIT_EXCEEDED' ? 'Too many staff changes. Try again shortly.' : 'Administrative protection is temporarily unavailable.' });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json(400, { error: 'A valid JSON body is required.' }); }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const staffCode = typeof body.staffCode === 'string' ? body.staffCode.trim().toUpperCase() : typeof body.username === 'string' ? body.username.trim().toUpperCase() : '';
  const role = typeof body.role === 'string' ? body.role.toUpperCase() : '';
  const branchId = typeof body.branchId === 'string' ? body.branchId : '';
  if (!name || name.length > 150 || !/^[A-Z0-9_-]{2,50}$/.test(staffCode) || !roles.has(role) || !/^[0-9a-f-]{36}$/i.test(branchId)) return json(400, { error: 'Name, staff code, role, and branch are required.' });
  const { data: branch } = await admin.from('branches').select('id').eq('id', branchId).eq('company_id', profile.company_id).eq('status', 'ACTIVE').maybeSingle();
  if (!branch) return json(403, { error: 'The selected branch is not available in your company.' });
  const pin = temporaryPin();
  const { data, error } = await admin.rpc('create_admin_staff_record', { p_branch_id: branchId, p_staff_code: staffCode, p_name: name, p_role: role, p_temporary_pin: pin });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || '';
    return json(code === 'STAFF_CODE_EXISTS' ? 409 : 400, { error: code === 'STAFF_CODE_EXISTS' ? 'That staff code already exists.' : 'Unable to create staff.', code: code || 'STAFF_CREATE_FAILED' });
  }
  return json(201, { data: { ...data, temporaryPin: pin } });
});
