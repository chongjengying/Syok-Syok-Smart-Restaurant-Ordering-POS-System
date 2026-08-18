import { PAYMENT_METHODS } from '../shared/constants';
import {
  fetchDailySalesReport,
  fetchPaymentCapabilities,
  submitPayment,
} from '../repositories/payment.repository';
import type { RequestOptions } from '../types/api';
import type { DailySalesFilters, PaymentMethod } from '../types/payment';

const supportedMethods = new Set<string>(Object.values(PAYMENT_METHODS));

export async function getPaymentCapabilities(options: RequestOptions = {}) {
  const result = await fetchPaymentCapabilities(options);
  if (result.error || !result.data) return { data: null, error: result.error };
  return { data: Array.isArray(result.data.methods) ? result.data.methods : [], error: null };
}

export function getDailySalesReport(query: DailySalesFilters = {}, options: RequestOptions = {}) {
  return fetchDailySalesReport(query, options);
}

export function processPayment(
  orderId: string,
  paymentMethod: string,
  finalAmount: number,
  idempotencyKey: string,
  receivedAmount?: number,
  submitTakeaway = false,
) {
  const method = String(paymentMethod || '').toUpperCase();
  if (!orderId) return Promise.resolve({ data: null, error: new Error('Order ID is required.') });
  if (!supportedMethods.has(method)) {
    return Promise.resolve({ data: null, error: new Error('The selected payment method is unsupported.') });
  }
  if (!Number.isFinite(finalAmount) || finalAmount < 0) {
    return Promise.resolve({ data: null, error: new Error('The final amount is invalid.') });
  }
  if (!idempotencyKey) return Promise.resolve({ data: null, error: new Error('Payment request key is required.') });
  if (receivedAmount !== undefined && (!Number.isFinite(receivedAmount) || receivedAmount < finalAmount)) {
    return Promise.resolve({ data: null, error: new Error('The received amount is insufficient.') });
  }
  return submitPayment(orderId, method as PaymentMethod, finalAmount, idempotencyKey, receivedAmount, submitTakeaway);
}
