import { createClient } from 'npm:@supabase/supabase-js@2';
import { callerHeaders, buildCorsHeaders, jsonResponse as respond } from '../_shared/http.ts';
import { consumeRateLimit } from '../_shared/rateLimit.ts';

const cors = buildCorsHeaders('GET, POST, OPTIONS');
const json = (status: number, body: Record<string, unknown>) => respond(status, body, cors);
const temporaryPin = () => Array.from(crypto.getRandomValues(new Uint32Array(1)))[0].toString().padStart(10, '0').slice(-6);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!['GET', 'POST'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
  const authorization = request.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL'), anonKey = Deno.env.get('SUPABASE_ANON_KEY'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !url || !anonKey || !serviceKey) return json(401, { error: 'Authentication is required.' });
  const caller = createClient(url, anonKey, { global: { headers: callerHeaders(request, authorization) }, auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await caller.auth.getUser();
  if (authError || !auth.user) return json(401, { error: 'The session is invalid or expired.' });
  const { data: profile } = await caller.from('profiles').select('company_id,status').eq('id', auth.user.id).maybeSingle();
  if (!profile || profile.status !== 'ACTIVE') return json(403, { error: 'An active administrator profile is required.' });
  const permission = request.method === 'GET' ? 'user.view' : 'user.create';
  const { data: allowed } = await caller.rpc('has_pos_permission', { p_permission: permission });
  if (!allowed) return json(403, { error: 'Staff management permission is required.' });
  const {data:companyId,error:companyError}=await caller.rpc('current_user_company_id');
  if (companyError || !companyId) return json(403,{error:'An active company context is required.'});

  if (request.method === 'GET') {
    const search = new URL(request.url).searchParams.get('search')?.trim().toLowerCase() || '';
    const { data: staff, error } = await admin.from('staff').select('id,legacy_profile_id,staff_code,name,company_id,branch_id,active,created_at,roles(name,is_active),profiles!staff_legacy_profile_id_fkey(status),branches(code,name),staff_pin_credentials_v2(status,locked_until)').eq('company_id', companyId).order('created_at', { ascending: false });
    if (error) return json(500, { error: 'Unable to load staff.' });
    const profileIds = (staff || []).map((row: Record<string, unknown>) => row.legacy_profile_id).filter((value): value is string => typeof value === 'string');
    const { data: assignments, error: assignmentError } = profileIds.length ? await admin.from('staff_branch_assignments').select('staff_id,branch_id,is_primary,status,removed_at,branches(code,name,status)').in('staff_id', profileIds) : { data: [], error: null };
    if (assignmentError) return json(500, { error: 'Unable to load staff branch access.' });
    const {data: terminals,error: terminalError}=await admin.from('pos_terminals').select('id,branch_id,access_mode').eq('company_id',companyId).eq('status','ACTIVE').eq('registration_status','REGISTERED').eq('lock_status','UNLOCKED');
    if (terminalError) return json(500,{error:'Unable to verify POS access.'});
    const terminalIds=(terminals||[]).map(terminal=>terminal.id);
    const {data: terminalAssignments,error: terminalAssignmentError}=terminalIds.length ? await admin.from('terminal_staff_access').select('terminal_id,staff_id').in('terminal_id',terminalIds) : {data:[],error:null};
    if (terminalAssignmentError) return json(500,{error:'Unable to verify terminal staff restrictions.'});
    const assignmentsByStaff = new Map<string, Record<string, unknown>[]>();
    for (const assignment of assignments || []) {
      const list = assignmentsByStaff.get(String(assignment.staff_id)) || [];
      list.push(assignment as Record<string, unknown>);
      assignmentsByStaff.set(String(assignment.staff_id), list);
    }
    const users = (staff || []).map((row: Record<string, unknown>) => {
      const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
      const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
      const credential = Array.isArray(row.staff_pin_credentials_v2) ? row.staff_pin_credentials_v2[0] : row.staff_pin_credentials_v2;
      const staffAssignments = (assignmentsByStaff.get(String(row.legacy_profile_id)) || []).filter((item) => item.status === 'ACTIVE' || (item.status === 'INACTIVE' && item.removed_at === null));
      const linkedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const eligibleBranches=staffAssignments.filter(item=>item.status==='ACTIVE' && (item.branches as {status?:string}|null)?.status==='ACTIVE').map(item=>item.branch_id);
      const hasTerminal=(terminals||[]).some(terminal=>eligibleBranches.includes(terminal.branch_id) && (terminal.access_mode==='ALL_BRANCH_STAFF' || (terminal.access_mode==='SELECTED_STAFF' && (terminalAssignments||[]).some(assignment=>assignment.terminal_id===terminal.id && assignment.staff_id===row.id))));
      return {
        id: row.id,
        legacy_profile_id: row.legacy_profile_id,
        staff_code: row.staff_code,
        username: row.staff_code,
        name: row.name,
        role_name: (role as { name?: string } | null)?.name || '',
        branch_id: row.branch_id,
        branch: branch || null,
        branches: staffAssignments.map((item: Record<string, unknown>) => { const assignedBranch = Array.isArray(item.branches) ? item.branches[0] : item.branches; return { branch_id: item.branch_id, code: (assignedBranch as { code?: string } | null)?.code, name: (assignedBranch as { name?: string } | null)?.name, is_primary: item.is_primary === true }; }),
        assignedBranchIds: staffAssignments.map((item: Record<string, unknown>) => item.branch_id),
        status: row.active && (linkedProfile as {status?:string}|null)?.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
        roleActive: (role as { is_active?: boolean } | null)?.is_active === true,
        pinLocked: Boolean((credential as {locked_until?:string}|null)?.locked_until && new Date(String((credential as {locked_until?:string}).locked_until)).getTime() > Date.now()),
        pos_status: !eligibleBranches.length ? 'Branch Required' : hasTerminal ? 'POS Ready' : 'No Eligible Terminal',
        pin_status: (credential as { status?: string } | null)?.status || 'SETUP_REQUIRED',
        auth_linked: false,
      };
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
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const additionalBranches = Array.isArray(body.additionalBranches) ? body.additionalBranches.filter((value): value is string => typeof value === 'string') : [];
  const status = body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const pinMode = body.pinMode === 'STAFF_SET' ? 'STAFF_SET' : 'ADMIN_TEMPORARY';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'Enter a valid email address.' });
  if (phone.length > 40) return json(400, { error: 'Phone number is too long.' });
  if (!name || name.length > 150 || !/^[A-Z0-9_-]{2,50}$/.test(staffCode) || !/^[A-Z][A-Z0-9_]{1,49}$/.test(role) || role === 'ADMIN' || !/^[0-9a-f-]{36}$/i.test(branchId)) return json(400, { error: 'Name, staff code, role, and branch are required.' });
  const { data: selectedRole } = await admin.from('roles').select('id').eq('name', role).eq('company_id', companyId).eq('scope', 'COMPANY').eq('is_active', true).eq('is_system_locked', false).maybeSingle();
  if (!selectedRole) return json(400, { error: 'The selected role does not exist.', code: 'INVALID_STAFF_ROLE' });
  const { data: branch } = await admin.from('branches').select('id').eq('id', branchId).eq('company_id', companyId).eq('status', 'ACTIVE').maybeSingle();
  if (!branch) return json(403, { error: 'The selected branch is not available in your company.' });
  const pin = temporaryPin();
  const { data, error } = await admin.rpc('create_admin_staff_record', { p_branch_id: branchId, p_staff_code: staffCode, p_name: name, p_role: role, p_temporary_pin: pin, p_email: email || null, p_phone: phone || null, p_additional_branch_ids: additionalBranches, p_status: status, p_pin_mode: pinMode });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || '';
    return json(code === 'STAFF_CODE_EXISTS' ? 409 : 400, { error: code === 'STAFF_CODE_EXISTS' ? 'That staff code already exists.' : 'Unable to create staff.', code: code || 'STAFF_CREATE_FAILED' });
  }
  return json(201, { data: { ...data, ...(pinMode === 'ADMIN_TEMPORARY' ? { temporaryPin: pin } : {}) } });
});
