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
