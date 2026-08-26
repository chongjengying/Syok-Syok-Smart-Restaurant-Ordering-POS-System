export type PaymentMethod = 'CASH' | 'CARD' | 'QR' | 'EWALLET';
export type SplitType = 'FULL' | 'EQUAL' | 'AMOUNT' | 'ITEM';

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

export interface ProductSalesRow {
  product_id: string;
  product_code: string;
  product_name: string;
  category_id: string;
  category_code: string | null;
  category_name: string | null;
  quantity_sold: number | string;
  order_count: number | string;
  gross_sales: number | string;
  average_unit_price: number | string;
  first_sold_at: string;
  last_sold_at: string;
}

export interface PaymentHistoryEntry {
  id: string;
  paymentNumber: string;
  paymentMethod: PaymentMethod;
  amount: number | string;
  receivedAmount: number | string | null;
  changeAmount: number | string | null;
  splitType: SplitType;
  status: 'PAID';
  paidAt: string;
  cashier: string | null;
  paidTotalAfter: number | string;
  remainingAfter: number | string;
}

export interface PaymentSummaryItem {
  orderItemId: string;
  name: string;
  quantity: number;
  allocatedQuantity: number;
  remainingQuantity: number;
  remainingAmount: number | string;
  remainingUnitAmounts: Array<number | string>;
}

export interface PaymentSummary {
  orderId: string;
  orderNumber: string;
  orderTotal: number | string;
  paidAmount: number | string;
  remainingAmount: number | string;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  payments: PaymentHistoryEntry[];
  items: PaymentSummaryItem[];
}

export interface SplitPaymentInput {
  orderId: string;
  splitType: SplitType;
  paymentMethod: PaymentMethod;
  amount?: string | null;
  receivedAmount?: string | null;
  itemAllocations?: Array<{ orderItemId: string; quantity: number }>;
  billId?: string | null;
  idempotencyKey: string;
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
