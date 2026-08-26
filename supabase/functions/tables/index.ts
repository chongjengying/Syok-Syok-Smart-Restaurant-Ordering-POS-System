import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as createJsonResponse } from '../_shared/http.ts';
import { TableRepository } from '../_shared/repositories/tableRepository.ts';

const corsHeaders = buildCorsHeaders('GET, POST, PATCH, DELETE, OPTIONS');
const statuses = new Set(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED']);

const jsonResponse = (status: number, body?: Record<string, unknown>) =>
  createJsonResponse(status, body, corsHeaders);

async function readBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? { data: body as Record<string, unknown>, error: null }
      : { data: null, error: 'Request body must be a JSON object.' };
  } catch {
    return { data: null, error: 'Request body must be valid JSON.' };
  }
}

function validateTable(body: Record<string, unknown>, partial = false, allowOperationalState = false) {
  const output: Record<string, unknown> = {};
  if (!partial || body.tableNumber !== undefined) {
    if (typeof body.tableNumber !== 'string' || !body.tableNumber.trim() || body.tableNumber.trim().length > 20) {
      return { data: null, error: 'tableNumber is required and must not exceed 20 characters.' };
    }
    output.table_number = body.tableNumber.trim().toUpperCase();
  }
  if (!partial || body.capacity !== undefined) {
    if (!Number.isInteger(body.capacity) || (body.capacity as number) < 1 || (body.capacity as number) > 100) {
      return { data: null, error: 'capacity must be an integer from 1 to 100.' };
    }
    output.capacity = body.capacity;
  }
  if (body.tableName !== undefined) {
    if (body.tableName !== null && (typeof body.tableName !== 'string' || body.tableName.trim().length > 100)) {
      return { data: null, error: 'tableName must not exceed 100 characters.' };
    }
    output.table_name = typeof body.tableName === 'string' ? body.tableName.trim() || null : null;
  }
  if (!partial || body.area !== undefined) {
    if (typeof body.area !== 'string' || !body.area.trim() || body.area.trim().length > 100) {
      return { data: null, error: 'area is required and must not exceed 100 characters.' };
    }
    output.area = body.area.trim();
  }
  if (body.status !== undefined) {
    if (!allowOperationalState) {
      return { data: null, error: 'Use the table status transition endpoint to change status.' };
    }
    if (typeof body.status !== 'string' || !statuses.has(body.status.toUpperCase())) {
      return { data: null, error: 'status is invalid.' };
    }
    if (!['AVAILABLE', 'RESERVED', 'DISABLED'].includes(body.status.toUpperCase())) {
      return { data: null, error: 'A new table must start as AVAILABLE, RESERVED, or DISABLED.' };
    }
    output.status = body.status.toUpperCase();
    output.is_active = output.status !== 'DISABLED';
  }
  if (body.qrCode !== undefined) {
    if (body.qrCode !== null && (typeof body.qrCode !== 'string' || body.qrCode.length > 2000)) {
      return { data: null, error: 'qrCode must not exceed 2000 characters.' };
    }
    output.qr_code = body.qrCode || null;
  }
  if (body.isActive !== undefined) {
    if (!allowOperationalState) {
      return { data: null, error: 'Use the table status transition endpoint to enable or disable a table.' };
    }
    if (typeof body.isActive !== 'boolean') return { data: null, error: 'isActive must be boolean.' };
    if (output.status === 'DISABLED' && body.isActive) {
      return { data: null, error: 'A DISABLED table cannot be active.' };
    }
    output.is_active = body.isActive;
    if (!body.isActive) output.status = 'DISABLED';
  }
  if (partial && Object.keys(output).length === 0) return { data: null, error: 'No supported fields were provided.' };
  return { data: output, error: null };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse(401, { error: 'Authentication is required.' });
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Server configuration is incomplete.' });

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return jsonResponse(401, { error: 'The session is invalid or expired.' });
  const { data: callerProfile } = await caller.from('profiles').select('role_name, status').eq('id', userData.user.id).single();
  if (!callerProfile || callerProfile.status !== 'ACTIVE') {
    return jsonResponse(403, { error: 'An active staff profile is required.' });
  }

  const pathParts = new URL(request.url).pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.lastIndexOf('tables');
  const tableId = functionIndex >= 0 ? pathParts[functionIndex + 1] || null : null;
  const tableAction = functionIndex >= 0 ? pathParts[functionIndex + 2] || null : null;
  const callerRepository = new TableRepository(caller);

  if (request.method === 'GET') {
    if (tableId) {
      if (tableId.length > 128 || tableAction) return jsonResponse(400, { error: 'A valid table ID is required.' });
      const { data, error } = await callerRepository.getById(tableId);
      if (error) return jsonResponse(500, { error: 'Unable to load restaurant table.' });
      if (!data) return jsonResponse(404, { error: 'Restaurant table was not found.' });
      return jsonResponse(200, { data });
    }

    const requestedStatus = new URL(request.url).searchParams.get('status')?.toUpperCase() || null;
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
    if (requestedStatus && !statuses.has(requestedStatus)) {
      return jsonResponse(400, { error: 'status is invalid.' });
    }
    if (includeInactive) {
      if (!['ADMIN', 'MANAGER'].includes(callerProfile.role_name)) {
        return jsonResponse(403, { error: 'Administrator or manager access is required to include inactive tables.' });
      }
    }
    const { data, error } = await callerRepository.list(requestedStatus, includeInactive);
    if (error) return jsonResponse(500, { error: 'Unable to load restaurant tables.' });
    return jsonResponse(200, { data });
  }

  if (request.method === 'PATCH' && tableAction === 'status') {
    if (!tableId || tableId.length > 128) return jsonResponse(400, { error: 'A valid table ID is required.' });
    const body = await readBody(request);
    if (body.error) return jsonResponse(400, { error: body.error });
    const status = typeof body.data?.status === 'string' ? body.data.status.toUpperCase() : '';
    if (!statuses.has(status)) return jsonResponse(400, { error: 'status is invalid.' });
    if (Object.keys(body.data || {}).some((key) => key !== 'status')) {
      return jsonResponse(400, { error: 'Only status may be provided for a table transition.' });
    }

    const { data, error } = await caller.rpc('transition_restaurant_table', {
      p_table_id: tableId,
      p_new_status: status,
    });
    if (error) {
      const message = error.message || 'Unable to transition restaurant table.';
      const statusCode = message.includes('TABLE_NOT_FOUND')
        ? 404
        : message.includes('INSUFFICIENT_PERMISSION')
          ? 403
          : 409;
      return jsonResponse(statusCode, { error: message, code: message.split(':')[0] || 'TABLE_TRANSITION_REJECTED' });
    }
    return jsonResponse(200, { data });
  }

  if (request.method === 'POST' && tableId && tableAction) {
    const body = await readBody(request);
    if (body.error) return jsonResponse(400, { error: body.error });
    const operationKey = typeof body.data?.operationKey === 'string'
      ? body.data.operationKey.trim().slice(0, 128)
      : null;
    if (!operationKey) return jsonResponse(400, { error: 'operationKey is required.' });
    let rpcName = '';
    let parameters: Record<string, unknown> = { p_table_id: tableId, p_operation_key: operationKey };
    if (tableAction === 'start-cleaning') rpcName = 'start_table_cleaning';
    else if (tableAction === 'complete-cleaning') rpcName = 'complete_table_cleaning';
    else if (tableAction === 'out-of-service') {
      rpcName = 'set_table_out_of_service';
      parameters = {
        ...parameters,
        p_reason: typeof body.data?.reason === 'string' ? body.data.reason.trim().slice(0, 500) : null,
      };
    } else if (tableAction === 'restore') rpcName = 'restore_pos_table';
    else return jsonResponse(404, { error: 'Table operation was not found.' });

    const { data, error } = await caller.rpc(rpcName, parameters);
    if (error) {
      const message = error.message || 'Table operation failed.';
      const code = message.match(/[A-Z][A-Z_]+/)?.[0] || 'TABLE_OPERATION_FAILED';
      const statusCode = code === 'TABLE_NOT_FOUND' ? 404 : code === 'INSUFFICIENT_PERMISSION' ? 403 : 409;
      return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(200, { data });
  }

  if (request.method === 'POST' && tableId === 'move-order' && !tableAction) {
    const body = await readBody(request);
    if (body.error) return jsonResponse(400, { error: body.error });
    const orderId = typeof body.data?.orderId === 'string' ? body.data.orderId.trim() : '';
    const destinationTableId = typeof body.data?.destinationTableId === 'string'
      ? body.data.destinationTableId.trim()
      : '';
    const expectedSourceTableId = typeof body.data?.expectedSourceTableId === 'string'
      ? body.data.expectedSourceTableId.trim()
      : '';
    if (!orderId || !destinationTableId || !expectedSourceTableId) {
      return jsonResponse(400, { error: 'orderId, destinationTableId and expectedSourceTableId are required.' });
    }
    const operationKey = typeof body.data?.operationKey === 'string'
      ? body.data.operationKey.trim().slice(0, 128)
      : '';
    if (!operationKey) return jsonResponse(400, { error: 'operationKey is required.' });
    const { data, error } = await caller.rpc('move_pos_order', {
      p_order_id: orderId,
      p_destination_table_id: destinationTableId,
      p_operation_key: operationKey,
      p_expected_source_table_id: expectedSourceTableId,
    });
    if (error) {
      const message = error.message || 'Unable to move the order.';
      const code = message.match(/[A-Z][A-Z_]+/)?.[0] || 'ORDER_MOVE_FAILED';
      const statusCode = code === 'ORDER_NOT_FOUND' || code === 'TABLE_NOT_FOUND'
        ? 404
        : code === 'INSUFFICIENT_PERMISSION'
          ? 403
          : 409;
      return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(200, { data });
  }

  const { data: canManageTables } = await caller.rpc('has_pos_permission', { p_permission: 'table.manage' });
  if (!canManageTables) return jsonResponse(403, { error: 'Table management permission is required.' });
  if (!serviceKey) return jsonResponse(500, { error: 'Server configuration is incomplete.' });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const adminRepository = new TableRepository(admin);

  if (request.method === 'POST') {
    const body = await readBody(request);
    if (body.error) return jsonResponse(400, { error: body.error });
    const validation = validateTable(body.data!, false, true);
    if (validation.error) return jsonResponse(400, { error: validation.error });
    const { data, error } = await adminRepository.create(validation.data!);
    if (error?.code === '23505') return jsonResponse(409, { error: 'Table number or QR code already exists.' });
    if (error) return jsonResponse(500, { error: 'Unable to create restaurant table.' });
    const { error: auditError } = await caller.rpc('record_table_admin_action', { p_table_id: data.id, p_action: 'TABLE_CREATED', p_details: validation.data });
    if (auditError) console.error('Unable to audit table creation', auditError);
    return jsonResponse(201, { data });
  }

  if (!tableId || tableId.length > 128 || tableAction) return jsonResponse(400, { error: 'A valid table ID is required.' });

  if (request.method === 'PATCH') {
    const body = await readBody(request);
    if (body.error) return jsonResponse(400, { error: body.error });
    const validation = validateTable(body.data!, true);
    if (validation.error) return jsonResponse(400, { error: validation.error });
    const { data, error } = await adminRepository.update(tableId, validation.data!);
    if (error?.code === '23505') return jsonResponse(409, { error: 'Table number or QR code already exists.' });
    if (error) return jsonResponse(500, { error: 'Unable to update restaurant table.' });
    if (!data) return jsonResponse(404, { error: 'Restaurant table was not found.' });
    const { error: auditError } = await caller.rpc('record_table_admin_action', { p_table_id: tableId, p_action: 'TABLE_UPDATED', p_details: validation.data });
    if (auditError) console.error('Unable to audit table update', auditError);
    return jsonResponse(200, { data });
  }

  const { data, error } = await adminRepository.delete(tableId);
  if (error?.code === '23503') return jsonResponse(409, { error: 'Table has order history; disable it instead of deleting it.' });
  if (error) return jsonResponse(500, { error: 'Unable to delete restaurant table.' });
  if (!data) return jsonResponse(404, { error: 'Restaurant table was not found.' });
  return jsonResponse(204);
});
