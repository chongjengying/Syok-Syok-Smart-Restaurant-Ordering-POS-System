import { apiRequest } from '../infrastructure/supabase/functionsClient';
import type { ApiResult, RequestOptions } from '../types/api';
import type { DailySalesFilters, DailySalesRow, PaymentCapability, PaymentMethod, PaymentProvider, PaymentSummary, ProductSalesRow, SplitPaymentInput } from '../types/payment';

export function fetchPaymentCapabilities({ signal }: RequestOptions = {}) {
  return apiRequest('payments', { signal }) as Promise<ApiResult<{ methods: PaymentCapability[] }>>;
}

export function fetchDailySalesReport(query: DailySalesFilters = {}, { signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'report/daily', query, signal }) as Promise<ApiResult<DailySalesRow[]>>;
}

export function fetchProductSalesReport(query: DailySalesFilters, { signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'report/products', query, signal }) as Promise<ApiResult<ProductSalesRow[]>>;
}

export function fetchPaymentSummary(orderId: string, { signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'summary', query: { orderId }, signal }) as Promise<ApiResult<PaymentSummary>>;
}

export function fetchPaymentProviders({ signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'providers', signal }) as Promise<ApiResult<PaymentProvider[]>>;
}

export function savePaymentProviders(providers: Array<Partial<PaymentProvider>>) {
  return apiRequest('payments', { path: 'providers', method: 'POST', body: { providers } }) as Promise<ApiResult<PaymentProvider[]>>;
}

export function submitPayment(
  orderId: string,
  paymentMethod: PaymentMethod,
  finalAmount: number,
  idempotencyKey: string,
  receivedAmount?: number,
  submitTakeaway = false,
  paymentReference?: string,
) {
  return apiRequest('payments', {
    method: 'POST',
    body: { orderId, paymentMethod, finalAmount, idempotencyKey, receivedAmount, submitTakeaway, paymentReference },
  }) as Promise<ApiResult<unknown>>;
}

export function submitBillPayment(billId: string, payments: Array<{ method: string; amount: number; receivedAmount?: number }>, idempotencyKey: string) {
  return apiRequest('payments', { method: 'POST', body: { billId, payments, idempotencyKey } }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function submitSplitPayment(input: SplitPaymentInput) {
  return apiRequest('payments', { method: 'POST', body: input }) as Promise<ApiResult<{
    payment: Record<string, unknown>;
    summary: PaymentSummary;
    replayed: boolean;
  }>>;
}

export function submitRefund(orderId: string, reason: string, idempotencyKey: string) {
  return apiRequest('payments', {
    path: 'refund',
    method: 'POST',
    body: { orderId, reason, idempotencyKey },
  }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function submitPaymentVoid(paymentId: string, reason: string, idempotencyKey: string) {
  return apiRequest('payments', { path: 'void', method: 'POST', body: { paymentId, reason, idempotencyKey, deviceContext: { source: 'admin-payments' } } }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function fetchReceipt(orderId: string, { signal }: RequestOptions = {}) {
  return apiRequest('payments', { path: 'receipt', query: { orderId }, signal }) as Promise<ApiResult<Record<string, unknown>>>;
}

export function submitReceiptReprint(receiptId: string, reason: string) {
  return apiRequest('payments', { path: 'receipt/reprint', method: 'POST', body: { receiptId, reason, deviceContext: { source: 'admin-payments' } } }) as Promise<ApiResult<Record<string, unknown>>>;
}
