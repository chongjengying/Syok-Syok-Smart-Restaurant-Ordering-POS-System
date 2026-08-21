import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult, RequestOptions } from '../types/api';
import type { DailySalesFilters, DailySalesRow, PaymentCapability, PaymentMethod } from '../types/payment';

export function fetchPaymentCapabilities({ signal }: RequestOptions = {}) {
  return apiRequest('payments', { signal }) as Promise<ApiResult<{ methods: PaymentCapability[] }>>;
}

export function fetchDailySalesReport(query: DailySalesFilters = {}, { signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'report/daily', query, signal }) as Promise<ApiResult<DailySalesRow[]>>;
}

export function submitPayment(
  orderId: string,
  paymentMethod: PaymentMethod,
  finalAmount: number,
  idempotencyKey: string,
  receivedAmount?: number,
  submitTakeaway = false,
) {
  return apiRequest('payments', {
    method: 'POST',
    body: { orderId, paymentMethod, finalAmount, idempotencyKey, receivedAmount, submitTakeaway },
  }) as Promise<ApiResult<unknown>>;
}

export function submitBillPayment(billId: string, payments: Array<{ method: string; amount: number; receivedAmount?: number }>, idempotencyKey: string) {
  return apiRequest('payments', { method: 'POST', body: { billId, payments, idempotencyKey } }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function submitRefund(orderId: string, reason: string, idempotencyKey: string) {
  return apiRequest('payments', {
    path: 'refund',
    method: 'POST',
    body: { orderId, reason, idempotencyKey },
  }) as Promise<ApiResult<Record<string, unknown>>>;
}
