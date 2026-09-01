import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import {consumeRateLimit} from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('GET, POST, PATCH, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);
const roles = new Set(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']);

async function bodyOf(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication is required.' });
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'Server configuration is incomplete.' });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: userResult, error: userError } = await caller.auth.getUser();
  if (userError || !userResult.user) return json(401, { error: 'The session is invalid or expired.' });
  const { data: callerProfile } = await caller.from('profiles').select('status').eq('id', userResult.user.id).single();
  if (!callerProfile || callerProfile.status !== 'ACTIVE') return json(403, { error: 'An active staff profile is required.' });
  const permission = request.method === 'GET' ? 'user.view' : request.method === 'POST' ? 'user.create' : 'user.edit';
  const { data: allowed } = await caller.rpc('has_pos_permission', { p_permission: permission });
  if (!allowed) return json(403, { error: 'You do not have permission to manage staff.' });

  if (request.method === 'GET') {
    const requestUrl = new URL(request.url);
    const search = requestUrl.searchParams.get('search')?.trim().slice(0, 100) || '';
    const page = Math.max(1, Number(requestUrl.searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(requestUrl.searchParams.get('pageSize')) || 25));
    const { data: profiles, error: profileError } = await admin.from('profiles')
      .select('id,name,username,email,role_name,status,branch_id,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (profileError) {
      console.error('Admin profile listing failed', profileError);
      return json(500, { error: 'Unable to load staff accounts.' });
    }

    const authUsers = [];
    for (let authPage = 1; authPage <= 10; authPage += 1) {
      const { data: authPageData, error: authError } = await admin.auth.admin.listUsers({ page: authPage, perPage: 1000 });
      if (authError) {
        console.error('Admin Auth user listing failed', authError);
        return json(500, { error: 'Unable to verify staff authentication accounts.' });
      }
      authUsers.push(...authPageData.users);
      if (authPageData.users.length < 1000) break;
    }

    const authById = new Map(authUsers.map((authUser) => [authUser.id, authUser]));
    const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
    const linkedUsers = (profiles || []).map((profile) => {
      const authUser = authById.get(profile.id);
      return {
        ...profile,
        auth_linked: Boolean(authUser),
        email_confirmed: Boolean(authUser?.email_confirmed_at),
        email_confirmed_at: authUser?.email_confirmed_at || null,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        auth_created_at: authUser?.created_at || null,
      };
    });
    for (const authUser of authUsers) {
      if (profileById.has(authUser.id)) continue;
      linkedUsers.push({
        id: authUser.id,
        name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Auth user',
        username: '',
        email: authUser.email || '',
        role_name: null,
        status: 'MISSING_PROFILE',
        branch_id: null,
        created_at: authUser.created_at,
        updated_at: authUser.updated_at || authUser.created_at,
        auth_linked: true,
        email_confirmed: Boolean(authUser.email_confirmed_at),
        email_confirmed_at: authUser.email_confirmed_at || null,
        last_sign_in_at: authUser.last_sign_in_at || null,
        auth_created_at: authUser.created_at,
      });
    }

    const normalizedSearch = search.toLowerCase();
    const filtered = normalizedSearch
      ? linkedUsers.filter((user) => [user.name, user.email, user.username, user.role_name]
        .some((value) => String(value || '').toLowerCase().includes(normalizedSearch)))
      : linkedUsers;
    filtered.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
    const start = (page - 1) * pageSize;
    return json(200, {
      data: {
        users: filtered.slice(start, start + pageSize),
        pagination: { page, pageSize, total: filtered.length },
      },
    });
  }

  const rateLimit=await consumeRateLimit(userResult.user.id,'admin-user-mutation',20,60);
  if(!rateLimit.allowed)return json(rateLimit.error==='RATE_LIMIT_EXCEEDED'?429:503,{error:rateLimit.error==='RATE_LIMIT_EXCEEDED'?'Too many staff changes. Try again shortly.':'Administrative protection is temporarily unavailable.',code:rateLimit.error||'RATE_LIMIT_UNAVAILABLE'});

  const body = await bodyOf(request);
  if (!body) return json(400, { error: 'A valid JSON body is required.' });

  if (request.method === 'POST') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = typeof body.role === 'string' ? body.role.toUpperCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 150 || !roles.has(role)) return json(400, { error: 'Valid name, email, and role are required.' });
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name, name } });
    if (inviteError || !invited.user) {
      console.error('Staff invitation failed', inviteError);
      return json(inviteError?.message?.toLowerCase().includes('already') ? 409 : 500, { error: inviteError?.message?.toLowerCase().includes('already') ? 'A staff account already uses this email.' : 'Unable to invite staff.' });
    }
    const enablePosAccess = body.enablePosAccess !== false;
    const { data, error } = await caller.rpc('admin_update_staff', { p_user_id: invited.user.id, p_payload: { name, role, status: 'ACTIVE' } });
    if (error) {
      console.error('Invited Auth user profile setup failed', error);
      await admin.auth.admin.deleteUser(invited.user.id);
      return json(500, { error: 'The staff invitation could not be completed.' });
    }
    const { error: auditError } = await caller.rpc('record_user_admin_action', { p_user_id: invited.user.id, p_action: 'USER_CREATED' });
    if (auditError) console.error('Unable to audit staff invitation', auditError);
    let temporaryPin = null;
    if (enablePosAccess) {
      const { data: pinData, error: pinError } = await caller.rpc('require_staff_pin_setup', { p_user_id: invited.user.id });
      if (pinError) console.error('Unable to enable POS PIN setup for invited user', pinError);
      temporaryPin = pinData?.temporaryPin || null;
    }
    return json(201, { data: { ...data, temporaryPin } });
  }

  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) return json(400, { error: 'userId is required.' });
  if (body.action === 'reset-password') {
    const { data: target } = await admin.from('profiles').select('email').eq('id', userId).single();
    if (!target?.email) return json(404, { error: 'Staff account was not found.' });
    const { error } = await admin.auth.resetPasswordForEmail(target.email);
    if (error) { console.error('Password reset request failed', error); return json(500, { error: 'Unable to send password reset instructions.' }); }
    const { error: auditError } = await caller.rpc('record_user_admin_action', { p_user_id: userId, p_action: 'USER_PASSWORD_RESET_REQUESTED' });
    if (auditError) console.error('Unable to audit password reset request', auditError);
    return json(200, { data: { resetRequested: true } });
  }
  if (body.action === 'require-pin-setup') {
    const { data: resetData, error } = await caller.rpc('require_staff_pin_setup', { p_user_id: userId });
    if (error) {
      const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'PIN_SETUP_FAILED';
      return json(code === 'INSUFFICIENT_PERMISSION' ? 403 : code === 'USER_NOT_FOUND' ? 404 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    const { error: auditError } = await caller.rpc('record_user_admin_action', { p_user_id: userId, p_action: 'USER_PIN_SETUP_REQUIRED' });
    if (auditError) console.error('Unable to audit PIN setup requirement', auditError);
    return json(200, { data: { pinSetupRequired: true, temporaryPin: resetData?.temporaryPin || null } });
  }
  const payload = { name: body.name, username: body.username, role: body.role, status: body.status, branchId: body.branchId };
  const { data, error } = await caller.rpc('admin_update_staff', { p_user_id: userId, p_payload: payload });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'USER_UPDATE_FAILED';
    return json(code === 'INSUFFICIENT_PERMISSION' ? 403 : code === 'USER_NOT_FOUND' ? 404 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
  }
  return json(200, { data });
});
