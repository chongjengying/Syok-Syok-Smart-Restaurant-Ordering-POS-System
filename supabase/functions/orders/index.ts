import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildCorsHeaders, jsonResponse as createJsonResponse } from '../_shared/http.ts';

const corsHeaders = buildCorsHeaders('GET, POST, PATCH, OPTIONS');

const allowedPaymentMethods = new Set(['CASH', 'CARD', 'QR', 'EWALLET']);
const allowedDiningModes = new Set(['dine-in', 'takeaway']);
const allowedOrderStatuses = new Set(['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED']);

type OrderItemInput = {
  productId: string;
  quantity: number;
  optionIds: string[];
  specialRequest: string;
  serviceMode: 'DINE_IN' | 'TAKEAWAY';
};

type CreateOrderInput = {
  items: OrderItemInput[];
  paymentMethod: string;
  diningMode: string;
  tableId?: string | null;
  idempotencyKey?: string | null;
};

type AppendOrderInput = Pick<CreateOrderInput, 'items' | 'idempotencyKey'>;

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  createJsonResponse(status, body, corsHeaders);

function validationErrorCode(message: string) {
  if (message.toLowerCase().includes('quantity')) return 'INVALID_ITEM_QUANTITY';
  if (message.toLowerCase().includes('productid')) return 'PRODUCT_NOT_AVAILABLE';
  return 'INVALID_ORDER_REQUEST';
}

function validateCreateOrder(value: unknown):
  | { data: CreateOrderInput; error: null }
  | { data: null; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { data: null, error: 'Request body must be a JSON object.' };
  }

  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    return { data: null, error: 'items must contain between 1 and 100 entries.' };
  }

  const items: OrderItemInput[] = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const item = body.items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { data: null, error: `items[${index}] must be an object.` };
    }

    const candidate = item as Record<string, unknown>;
    if (typeof candidate.productId !== 'string' || !candidate.productId.trim() || candidate.productId.length > 128) {
      return { data: null, error: `items[${index}].productId is invalid.` };
    }
    if (!Number.isInteger(candidate.quantity) || (candidate.quantity as number) < 1 || (candidate.quantity as number) > 99) {
      return { data: null, error: `items[${index}].quantity must be an integer from 1 to 99.` };
    }

    items.push({
      productId: candidate.productId.trim(),
      quantity: candidate.quantity as number,
      optionIds: Array.isArray(candidate.optionIds)
        ? candidate.optionIds.filter((id): id is string => typeof id === 'string' && id.length <= 128)
        : [],
      specialRequest: typeof candidate.specialRequest === 'string' ? candidate.specialRequest.trim().slice(0, 1000) : '',
      serviceMode: candidate.serviceMode === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE_IN',
    });
    if (Array.isArray(candidate.optionIds) && items[index].optionIds.length !== candidate.optionIds.length) {
      return { data: null, error: `items[${index}].optionIds contains an invalid option ID.` };
    }
  }

  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.toUpperCase() : '';
  if (!allowedPaymentMethods.has(paymentMethod)) {
    return { data: null, error: 'paymentMethod must be CASH, CARD, QR, or EWALLET.' };
  }
  if (typeof body.diningMode !== 'string' || !allowedDiningModes.has(body.diningMode)) {
    return { data: null, error: 'diningMode must be dine-in or takeaway.' };
  }

  const tableId = typeof body.tableId === 'string' ? body.tableId.trim() : null;
  if (body.diningMode === 'dine-in' && !tableId) {
    return { data: null, error: 'tableId is required for dine-in orders.' };
  }
  if (tableId && tableId.length > 50) {
    return { data: null, error: 'tableId must not exceed 50 characters.' };
  }

  const idempotencyKey = typeof body.idempotencyKey === 'string'
    ? body.idempotencyKey.trim()
    : null;
  if (!idempotencyKey) {
    return { data: null, error: 'idempotencyKey is required.' };
  }
  if (idempotencyKey && idempotencyKey.length > 128) {
    return { data: null, error: 'idempotencyKey must not exceed 128 characters.' };
  }

  return {
    data: {
      items,
      paymentMethod,
      diningMode: body.diningMode,
      tableId,
      idempotencyKey,
    },
    error: null,
  };
}

function validateAppendOrder(value: unknown):
  | { data: AppendOrderInput; error: null }
  | { data: null; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { data: null, error: 'Request body must be a JSON object.' };
  }
  const validation = validateCreateOrder({
    ...(value as Record<string, unknown>),
    paymentMethod: 'CASH',
    diningMode: 'takeaway',
  });
  if (validation.error) return validation;
  return {
    data: {
      items: validation.data.items,
      idempotencyKey: validation.data.idempotencyKey,
    },
    error: null,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Authentication is required.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(500, { error: 'Server configuration is incomplete.' });
  }

  // Passing the caller's JWT keeps auth.uid() and RLS active inside the RPC.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse(401, { error: 'The session is invalid or expired.' });
  }
  const { data: callerProfile } = await supabase.from('profiles').select('role_name, status').eq('id', userData.user.id).single();
  if (!callerProfile || callerProfile.status !== 'ACTIVE') {
    return jsonResponse(403, { error: 'An active staff profile is required.' });
  }

  const pathParts = new URL(request.url).pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.lastIndexOf('orders');
  const orderId = functionIndex >= 0 ? pathParts[functionIndex + 1] || null : null;
  const orderAction = functionIndex >= 0 ? pathParts[functionIndex + 2] || null : null;
  const orderResourceId = functionIndex >= 0 ? pathParts[functionIndex + 3] || null : null;
  const orderResourceAction = functionIndex >= 0 ? pathParts[functionIndex + 4] || null : null;

  if (request.method === 'GET') {
    if (orderAction) return jsonResponse(404, { error: 'Order resource was not found.' });
    if (!orderId) {
      const scope = new URL(request.url).searchParams.get('scope');
      if (scope === 'unpaid') {
        if (!['ADMIN', 'MANAGER', 'WAITER', 'CASHIER'].includes(callerProfile.role_name)) {
          return jsonResponse(403, { error: 'Front-of-house access is required.' });
        }
        const { data, error } = await supabase
          .from('orders')
          .select('*, restaurant_tables(id, table_number, table_name, area), order_item_batches(*), order_items(*, order_item_options(*)), payments(*)')
          .eq('payment_status', 'UNPAID')
          .in('status', ['DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'])
          .order('created_at', { ascending: false });
        if (error) return jsonResponse(500, { error: 'Unable to load unpaid orders.' });
        return jsonResponse(200, { data });
      }
      if (scope === 'ready-to-serve') {
        if (!['ADMIN', 'MANAGER', 'WAITER'].includes(callerProfile.role_name)) {
          return jsonResponse(403, { error: 'Front-of-house access is required.' });
        }
        const { data, error } = await supabase
          .from('orders')
          .select('*, restaurant_tables(table_number, table_name, area), order_item_batches(*), order_items(*, products(id, product_name), order_item_options(*))')
          .in('payment_status', ['UNPAID', 'PAID'])
          .in('status', ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'])
          .order('created_at');
        if (error) return jsonResponse(500, { error: 'Unable to load ready orders.' });
        return jsonResponse(200, {
          data: (data || []).map((order) => ({
            ...order,
            order_items: (order.order_items || []).filter((item) => item.item_status === 'READY'),
          })).filter((order) => order.order_items.length > 0),
        });
      }
      if (!['ADMIN', 'MANAGER', 'KITCHEN', 'WAITER'].includes(callerProfile.role_name)) {
        return jsonResponse(403, { error: 'Kitchen or manager access is required.' });
      }
      const { data, error } = await supabase
        .from('orders')
        .select('*, restaurant_tables(table_number, table_name, area), order_item_batches(*), order_items(*, products(id, product_name), order_item_options(*))')
        .in('payment_status', ['UNPAID', 'PAID'])
        .in('status', ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'])
        .order('created_at');
      if (error) return jsonResponse(500, { error: 'Unable to load the kitchen queue.' });
      return jsonResponse(200, {
        data: (data || []).map((order) => ({
          ...order,
          order_item_batches: (order.order_item_batches || []).filter((batch) =>
            ['PENDING', 'PREPARING', 'READY'].includes(batch.status)),
          order_items: (order.order_items || []).filter((item) =>
            ['SUBMITTED', 'PREPARING', 'READY'].includes(item.item_status)),
        })).filter((order) => order.order_items.length > 0 && order.order_item_batches.length > 0),
      });
    }
    const [orderResult, historyResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*, restaurant_tables(id, table_number, table_name, area), order_item_batches(*), order_items(*, order_item_options(*)), payments(*)')
        .eq('id', orderId)
        .maybeSingle(),
      supabase.from('order_status_history').select('*').eq('order_id', orderId).order('changed_at'),
    ]);
    if (orderResult.error || historyResult.error) return jsonResponse(500, { error: 'Unable to load the order.' });
    if (!orderResult.data) return jsonResponse(404, { error: 'Order was not found.' });
    return jsonResponse(200, { data: { ...orderResult.data, statusHistory: historyResult.data } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Request body must be valid JSON.' });
  }

  if (request.method === 'PATCH') {
    if (!orderId || orderAction) return jsonResponse(400, { error: 'An order ID is required.' });
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse(400, { error: 'Request body must be a JSON object.' });
    const candidate = body as Record<string, unknown>;
    const status = typeof candidate.status === 'string' ? candidate.status.toUpperCase() : '';
    if (!allowedOrderStatuses.has(status)) return jsonResponse(400, { error: 'Order status is invalid.' });
    if (candidate.notes !== undefined && typeof candidate.notes !== 'string') return jsonResponse(400, { error: 'notes must be text.' });
    const { data, error } = await supabase.rpc('transition_pos_order', {
      p_order_id: orderId,
      p_new_status: status,
      p_notes: typeof candidate.notes === 'string' ? candidate.notes.trim().slice(0, 1000) : null,
    });
    if (error) {
      const message = error.message || 'Unable to transition the order.';
      const code = message.match(/[A-Z][A-Z_]+/)?.[0] || 'ORDER_TRANSITION_REJECTED';
      const statusCode = code === 'ORDER_NOT_FOUND'
        ? 404
        : ['INSUFFICIENT_PERMISSION', 'MANAGER_REQUIRED_FOR_LATE_CANCELLATION'].includes(code)
          ? 403
          : 409;
      return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(200, { data });
  }

  if (orderId) {
    if (orderAction === 'takeaway-packaging') {
      const candidate = body as Record<string, unknown>;
      const packaging = Array.isArray(candidate?.packaging) ? candidate.packaging : null;
      const allowedPackaging = new Set(['CUP_LID', 'PAPER_BAG', 'TAKEAWAY_BOX', 'CUTLERY', 'STRAW', 'SAUCE', 'NAPKIN']);
      if (!packaging || packaging.some((entry) => typeof entry !== 'string' || !allowedPackaging.has(entry.toUpperCase()))) {
        return jsonResponse(400, { error: 'takeaway packaging is invalid', code: 'INVALID_TAKEAWAY_PACKAGING' });
      }
      const { data, error } = await supabase.rpc('set_takeaway_packaging', {
        p_order_id: orderId,
        p_packaging: packaging.map((entry) => String(entry).toUpperCase()),
      });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'TAKEAWAY_PACKAGING_UPDATE_FAILED';
        return jsonResponse(code === 'ORDER_NOT_FOUND' ? 404 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction === 'batches') {
      if (!orderResourceId || !orderResourceAction || !['start', 'ready'].includes(orderResourceAction)) {
        return jsonResponse(404, { error: 'Kitchen batch action was not found.' });
      }
      const rpcName = orderResourceAction === 'start' ? 'start_kitchen_batch' : 'ready_kitchen_batch';
      const { data, error } = await supabase.rpc(rpcName, {
        p_order_id: orderId,
        p_batch_id: orderResourceId,
      });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'KITCHEN_BATCH_UPDATE_FAILED';
        const statusCode = code === 'ORDER_NOT_FOUND' || code === 'KITCHEN_BATCH_NOT_FOUND'
          ? 404
          : code === 'INSUFFICIENT_PERMISSION'
            ? 403
            : 409;
        return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction === 'serve') {
      const { data, error } = await supabase.rpc('serve_ready_order', { p_order_id: orderId });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'SERVE_ORDER_FAILED';
        const statusCode = code === 'ORDER_NOT_FOUND'
          ? 404
          : code === 'INSUFFICIENT_PERMISSION'
            ? 403
            : 409;
        return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction === 'start') {
      const { data, error } = await supabase.rpc('start_kitchen_order', { p_order_id: orderId });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'KITCHEN_START_FAILED';
        const statusCode = code === 'ORDER_NOT_FOUND'
          ? 404
          : code === 'INSUFFICIENT_PERMISSION'
            ? 403
            : 409;
        return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction === 'draft-items') {
      const validation = validateAppendOrder({ ...(body as Record<string, unknown>), idempotencyKey: 'draft-save' });
      if (validation.error) {
        // An empty draft is valid and removes only unsent rows.
        const candidate = body as Record<string, unknown>;
        if (!Array.isArray(candidate?.items) || candidate.items.length !== 0) {
          return jsonResponse(400, { error: validation.error, code: validationErrorCode(validation.error) });
        }
      }
      const items = Array.isArray((body as Record<string, unknown>)?.items)
        ? (body as Record<string, unknown>).items
        : [];
      const { data, error } = await supabase.rpc('replace_pos_draft_items', { p_order_id: orderId, p_items: items });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'DRAFT_SAVE_FAILED';
        return jsonResponse(code === 'ORDER_NOT_FOUND' ? 404 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction === 'submit') {
      const candidate = body as Record<string, unknown>;
      const key = typeof candidate?.idempotencyKey === 'string' ? candidate.idempotencyKey.trim() : '';
      if (!key || key.length > 128) return jsonResponse(400, { error: 'A valid idempotencyKey is required.' });
      const { data, error } = await supabase.rpc('submit_pos_order', { p_order_id: orderId, p_idempotency_key: key });
      if (error) {
        const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'ORDER_SUBMIT_FAILED';
        return jsonResponse(['PRODUCT_NOT_AVAILABLE', 'OPTION_NOT_AVAILABLE'].includes(code) ? 422 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
      }
      return jsonResponse(200, { data });
    }
    if (orderAction !== 'items') return jsonResponse(404, { error: 'Order resource was not found.' });
    const validation = validateAppendOrder(body);
    if (validation.error) return jsonResponse(400, { error: validation.error, code: validationErrorCode(validation.error) });
    const { data, error } = await supabase.rpc('append_pos_order_items', {
      p_order_id: orderId,
      p_items: validation.data.items,
      p_idempotency_key: validation.data.idempotencyKey,
    });
    if (error) {
      const message = error.message || 'Unable to append order items.';
      const code = message.match(/[A-Z][A-Z_]+/)?.[0] || 'ORDER_APPEND_FAILED';
      const statusCode = code === 'ORDER_NOT_FOUND'
        ? 404
        : ['ORDER_NOT_ACTIVE', 'ORDER_ALREADY_PAID', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'].includes(code)
          ? 409
          : ['PRODUCT_NOT_AVAILABLE', 'INVALID_OPTION_IDS', 'INVALID_OR_DUPLICATE_OPTIONS', 'INVALID_OPTION_SELECTION_COUNT'].includes(code)
            ? 422
            : 400;
      return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(201, { data });
  }

  if (body && typeof body === 'object' && !Array.isArray(body) && (body as Record<string, unknown>).draft === true) {
    const candidate = body as Record<string, unknown>;
    const diningMode = typeof candidate.diningMode === 'string' ? candidate.diningMode : '';
    const tableId = typeof candidate.tableId === 'string' && candidate.tableId ? candidate.tableId : null;
    const key = typeof candidate.idempotencyKey === 'string' ? candidate.idempotencyKey.trim() : '';
    if (!allowedDiningModes.has(diningMode) || !key || key.length > 128) return jsonResponse(400, { error: 'Invalid draft context.' });
    const { data, error } = await supabase.rpc('create_pos_draft', {
      p_dining_mode: diningMode, p_table_id: tableId, p_idempotency_key: key,
    });
    if (error) {
      const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'DRAFT_CREATION_FAILED';
      return jsonResponse(['TABLE_NOT_AVAILABLE', 'ACTIVE_ORDER_EXISTS'].includes(code) ? 409 : 400, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(201, { data });
  }

  const validation = validateCreateOrder(body);
  if (validation.error) return jsonResponse(400, { error: validation.error, code: validationErrorCode(validation.error) });

  const { data, error } = await supabase.rpc('place_order', {
    p_items: validation.data.items,
    p_payment_method: validation.data.paymentMethod,
    p_dining_mode: validation.data.diningMode,
    p_table_id: validation.data.tableId,
    p_idempotency_key: validation.data.idempotencyKey,
  });

  if (error) {
    const message = error.message || 'Unable to create the order.';
    const code = message.match(/[A-Z][A-Z_]+/)?.[0] || 'ORDER_CREATION_FAILED';
    if (code === 'AUTHENTICATION_REQUIRED') return jsonResponse(401, { error: 'Authentication is required.', code });
    if (['TABLE_NOT_AVAILABLE', 'ACTIVE_ORDER_EXISTS', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'].includes(code)) {
      return jsonResponse(409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    if (['INVALID_TABLE_ID', 'PRODUCT_NOT_AVAILABLE', 'INVALID_OPTION_IDS', 'INVALID_OR_DUPLICATE_OPTIONS', 'INVALID_OPTION_SELECTION_COUNT'].includes(code)) {
      return jsonResponse(422, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    if (['INVALID_ORDER_ITEMS', 'INVALID_ITEM_QUANTITY', 'UNSUPPORTED_PAYMENT_METHOD', 'INVALID_DINING_MODE', 'IDEMPOTENCY_KEY_REQUIRED'].includes(code)) {
      return jsonResponse(400, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    console.error('place_order failed', error);
    return jsonResponse(500, { error: 'Unable to create the order.', code });
  }

  const createdOrderId = data && typeof data === 'object' && 'id' in data
    ? String(data.id)
    : '';
  if (!createdOrderId) {
    console.error('place_order returned an invalid payload', data);
    return jsonResponse(500, { error: 'The order was created but could not be loaded.' });
  }

  const { data: persistedOrder, error: persistedOrderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', createdOrderId)
    .single();
  if (persistedOrderError || !persistedOrder) {
    console.error('Unable to reconcile created order', persistedOrderError);
    return jsonResponse(500, { error: 'The order was created but could not be loaded.' });
  }

  return jsonResponse(201, {
    data: {
      ...persistedOrder,
      payment_id: 'payment_id' in data ? data.payment_id : null,
    },
  });
});
