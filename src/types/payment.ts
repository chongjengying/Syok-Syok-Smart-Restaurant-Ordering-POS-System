export type PaymentMethod = 'CASH' | 'CARD' | 'QR' | 'EWALLET';

export interface PaymentCapability {
  method: PaymentMethod;
  available: boolean;
  mode: 'manual' | 'unavailable';
}

export interface DailySalesFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface DailySalesRow {
  [key: string]: unknown;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  order_id: string;
  total: number;
  paid_amount: number;
  issued_at: string;
  status: 'ISSUED';
}

export interface Refund {
  id: string;
  refund_number: string;
  order_id: string;
  payment_id: string;
  amount: number;
  reason: string;
  status: 'COMPLETED';
  refunded_at: string;
}
