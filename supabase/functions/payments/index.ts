import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  createPaymentProvider,
  getPaymentCapabilities,
  type PaymentRequest,
} from '../_shared/paymentProviders.ts';
import { buildCorsHeaders, jsonResponse as createJsonResponse } from '../_shared/http.ts';

const corsHeaders = buildCorsHeaders('GET, POST, OPTIONS');
const methods = new Set(['CASH', 'CARD', 'QR', 'EWALLET']);

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  createJsonResponse(status, body, corsHeaders);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!['GET', 'POST'].includes(request.method)) return jsonResponse(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse(401, { error: 'Authentication is required.' });
  if (!supabaseUrl || !anonKey) return jsonResponse(500, { error: 'Server configuration is incomplete.' });

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return jsonResponse(401, { error: 'The session is invalid or expired.' });
  const { data: callerProfile } = await supabase.from('profiles').select('role_name, status').eq('id', userData.user.id).single();
  if (!callerProfile || callerProfile.status !== 'ACTIVE') {
    return jsonResponse(403, { error: 'An active staff profile is required.' });
  }

  const pathParts = new URL(request.url).pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.lastIndexOf('payments');
  const paymentAction = functionIndex >= 0 ? pathParts[functionIndex + 1] || null : null;

  if (request.method === 'GET') {
    if (paymentAction === 'report') {
      const reportType = pathParts[functionIndex + 2] || null;
      if (reportType !== 'daily') return jsonResponse(404, { error: 'Report was not found.' });

      if (!['ADMIN', 'MANAGER'].includes(callerProfile.role_name)) {
        return jsonResponse(403, { error: 'Administrator or manager access is required.' });
      }

      const url = new URL(request.url);
      const dateFrom = url.searchParams.get('dateFrom');
      const dateTo = url.searchParams.get('dateTo');
      const validDate = (value: string | null) => {
        if (value === null) return true;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
      };
      if (!validDate(dateFrom) || !validDate(dateTo)) {
        return jsonResponse(400, { error: 'dateFrom and dateTo must use YYYY-MM-DD format.' });
      }
      if (dateFrom && dateTo && dateFrom > dateTo) {
        return jsonResponse(400, { error: 'dateFrom must not be after dateTo.' });
      }
      const { data, error } = await supabase.rpc('get_daily_sales_report', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) {
        console.error('Unable to load daily sales report', error);
        return jsonResponse(500, { error: 'Unable to load the daily sales report.' });
      }
      return jsonResponse(200, { data });
    }

    if (paymentAction) return jsonResponse(404, { error: 'Payment resource was not found.' });
    return jsonResponse(200, { data: { methods: getPaymentCapabilities() } });
  }

  if (!['ADMIN', 'MANAGER', 'CASHIER'].includes(callerProfile.role_name)) {
    return jsonResponse(403, {
      error: 'Cashier, manager or administrator access is required.',
      code: 'INSUFFICIENT_PERMISSION',
    });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    body = parsed;
  } catch {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }

  if (paymentAction === 'refund') {
    if (!['ADMIN', 'MANAGER'].includes(callerProfile.role_name)) {
      return jsonResponse(403, { error: 'Administrator or manager access is required.', code: 'INSUFFICIENT_PERMISSION' });
    }
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (!orderId || reason.length < 3 || !idempotencyKey) {
      return jsonResponse(400, { error: 'orderId, reason and idempotencyKey are required.' });
    }
    const { data, error } = await supabase.rpc('refund_pos_order', {
      p_order_id: orderId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'REFUND_FAILED';
      const statusCode = code === 'ORDER_NOT_FOUND' ? 404 : code === 'INSUFFICIENT_PERMISSION' ? 403 : 409;
      return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(200, { data });
  }

  const billId = typeof body.billId === 'string' ? body.billId.trim() : '';
  if (billId) {
    const mixedPayments = Array.isArray(body.payments) ? body.payments : [];
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
    if (!idempotencyKey || mixedPayments.length === 0) return jsonResponse(400, { error: 'billId, payments and idempotencyKey are required.' });
    if (mixedPayments.some((payment) => !payment || typeof payment !== 'object' || String((payment as Record<string, unknown>).method || '').toUpperCase() !== 'CASH')) {
      return jsonResponse(503, { error: 'Only cash payment is currently configured.', code: 'PAYMENT_PROVIDER_UNAVAILABLE' });
    }
    const { data, error } = await supabase.rpc('complete_pos_bill_payment', {
      p_bill_id: billId,
      p_payments: mixedPayments,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'BILL_PAYMENT_FAILED';
      return jsonResponse(code === 'INSUFFICIENT_PERMISSION' ? 403 : 409, { error: code.replaceAll('_', ' ').toLowerCase(), code });
    }
    return jsonResponse(200, { data });
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const rawMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod.toUpperCase() : '';
  const method = rawMethod === 'E_WALLET' ? 'EWALLET' : rawMethod;
  const finalAmount = typeof body.finalAmount === 'number' ? body.finalAmount : Number.NaN;
  const receivedAmount = typeof body.receivedAmount === 'number' ? body.receivedAmount : finalAmount;
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const submitTakeaway = body.submitTakeaway === true;
  if (!orderId || orderId.length > 128) return jsonResponse(400, { error: 'orderId is invalid.' });
  if (!methods.has(method)) return jsonResponse(400, { error: 'paymentMethod is invalid.' });
  if (!Number.isFinite(finalAmount) || finalAmount < 0) return jsonResponse(400, { error: 'finalAmount is invalid.' });
  if (!Number.isFinite(receivedAmount) || (method === 'CASH' && receivedAmount < finalAmount)) {
    return jsonResponse(400, { error: 'receivedAmount is invalid.', code: 'INSUFFICIENT_CASH_RECEIVED' });
  }
  if (!idempotencyKey || idempotencyKey.length > 128) return jsonResponse(400, { error: 'idempotencyKey is invalid.' });

  const paymentRequest: PaymentRequest = {
    orderId,
    amount: finalAmount,
    method: method as PaymentRequest['method'],
    idempotencyKey,
  };
  const provider = createPaymentProvider(paymentRequest.method);
  const result = await provider.process(paymentRequest);

  if (!result.confirmed) {
    return jsonResponse(503, {
      error: result.error || 'Payment provider did not confirm the transaction.',
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
      retryable: result.retryable || false,
    });
  }

  const { data, error } = await supabase.rpc(
    submitTakeaway ? 'complete_takeaway_payment_and_submit' : 'complete_payment', {
    p_order_id: orderId,
    p_payment_method: method,
    p_final_amount: finalAmount,
    p_idempotency_key: idempotencyKey,
    p_provider: result.provider,
    p_transaction_reference: result.transactionReference,
    p_received_amount: receivedAmount,
  });
  if (error) {
    const code = error.message.match(/[A-Z][A-Z_]+/)?.[0] || 'PAYMENT_COMPLETION_FAILED';
    const statusCode = code === 'ORDER_NOT_FOUND'
      ? 404
      : ['AUTHENTICATION_REQUIRED', 'INSUFFICIENT_PERMISSION'].includes(code)
        ? 403
        : 409;
    return jsonResponse(statusCode, { error: code.replaceAll('_', ' ').toLowerCase(), code });
  }

  return jsonResponse(200, { data });
});
