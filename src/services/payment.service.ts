import { PAYMENT_METHODS } from '../shared/constants';
import {
  fetchDailySalesReport,
  fetchPaymentCapabilities,
  fetchPaymentProviders,
  fetchPaymentSummary,
  fetchReceipt,
  fetchProductSalesReport,
  savePaymentProviders,
  submitPayment,
  submitBillPayment,
  submitRefund,
  submitPaymentVoid,
  submitReceiptReprint,
  submitSplitPayment,
} from '../repositories/payment.repository';
import type { RequestOptions } from '../types/api';
import type { DailySalesFilters, PaymentMethod, SplitPaymentInput } from '../types/payment';

const supportedMethods = new Set<string>(Object.values(PAYMENT_METHODS));

export async function getPaymentCapabilities(options: RequestOptions = {}) {
  const result = await fetchPaymentCapabilities(options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: Array.isArray(result.data.methods) ? result.data.methods : [], error: null };
}

export function getDailySalesReport(query: DailySalesFilters = {}, options: RequestOptions = {}) {
  return fetchDailySalesReport(query, options);
}

export function getProductSalesReport(query: DailySalesFilters, options: RequestOptions = {}) {
  if (!query.dateFrom || !query.dateTo) {
    return Promise.resolve({ data: null, error: new Error('A report start and end date are required.') });
  }
  if (query.dateFrom > query.dateTo) {
    return Promise.resolve({ data: null, error: new Error('The report start date must not be after the end date.') });
  }
  return fetchProductSalesReport(query, options);
}

export function getPaymentSummary(orderId: string, options: RequestOptions = {}) {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return fetchPaymentSummary(orderId, options);
}

export function getPaymentProviders(options: RequestOptions = {}) {
  return fetchPaymentProviders(options);
}

export function updatePaymentProviders(providers: Array<Record<string, unknown>>) {
  if (!Array.isArray(providers)) return Promise.resolve({ data: null, error: new Error('Providers are required.') });
  return savePaymentProviders(providers);
}

export function processSplitPayment(input: SplitPaymentInput) {
  if (!input.orderId || !input.idempotencyKey) {
    return Promise.resolve({ data: null, error: new Error('Split payment details are incomplete.') });
  }
  if (!supportedMethods.has(input.paymentMethod)) {
    return Promise.resolve({ data: null, error: new Error('The selected payment method is unsupported.') });
  }
  if (['QR', 'EWALLET'].includes(input.paymentMethod) && !input.providerId) {
    return Promise.resolve({ data: null, error: new Error('Select a QR / E-wallet provider.') });
  }
  return submitSplitPayment(input);
}

export function processPayment(
  orderId: string,
  paymentMethod: string,
  finalAmount: number,
  idempotencyKey: string,
  receivedAmount?: number,
  submitTakeaway = false,
  paymentReference?: string,
) {
  const method = String(paymentMethod || '').toUpperCase();
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  if (!supportedMethods.has(method)) {
    return Promise.resolve({ data: null, error: new Error('The selected payment method is unsupported.') });
  }
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
    return Promise.resolve({ data: null, error: new Error('The final amount is invalid.') });
  }
  if (!idempotencyKey) return Promise.resolve({ data: null, error: new Error('Payment request key is required.') });
  if (receivedAmount !== undefined && (!Number.isFinite(receivedAmount) || receivedAmount < finalAmount)) {
    return Promise.resolve({ data: null, error: new Error('The received amount is insufficient.') });
  }
  return submitPayment(orderId, method as PaymentMethod, finalAmount, idempotencyKey, receivedAmount, submitTakeaway, paymentReference);
}

export function processBillPayment(billId: string, payments: Array<{ method: string; amount: number; receivedAmount?: number }>, idempotencyKey: string) {
  if (!billId || !Array.isArray(payments) || !payments.length || !idempotencyKey) return Promise.resolve({ data: null, error: new Error('Bill payment details are incomplete.') });
  if (payments.some((payment) => !payment || !supportedMethods.has(String(payment.method || '').toUpperCase()) || !Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0)) return Promise.resolve({ data: null, error: new Error('Bill payment contains an invalid amount or method.') });
  return submitBillPayment(billId, payments, idempotencyKey);
}

export function refundOrder(orderId: string, reason: string, idempotencyKey: string) {
  if (!orderId || typeof reason !== 'string' || reason.trim().length < 3 || !idempotencyKey) {
    return Promise.resolve({ data: null, error: new Error('Refund details are incomplete.') });
  }
  return submitRefund(orderId, reason.trim(), idempotencyKey);
}

export function voidPayment(paymentId: string, reason: string, idempotencyKey = crypto.randomUUID()) {
  if (!paymentId || typeof reason !== 'string' || reason.trim().length < 3 || !idempotencyKey) return Promise.resolve({ data: null, error: new Error('Payment void details are incomplete.') });
  return submitPaymentVoid(paymentId, reason.trim(), idempotencyKey);
}

export function getReceipt(orderId: string, options: RequestOptions = {}) {
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  return fetchReceipt(orderId, options);
}

export function reprintReceipt(receiptId: string, reason: string) {
  if (!receiptId || reason.trim().length < 3) return Promise.resolve({ data: null, error: new Error('Receipt reprint details are incomplete.') });
  return submitReceiptReprint(receiptId, reason.trim());
}
