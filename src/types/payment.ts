export type PaymentMethod = 'CASH' | 'CARD' | 'QR' | 'EWALLET';

export interface PaymentCapability {
  id?: string;
  method?: PaymentMethod;
  name?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

export interface DailySalesFilters {
  dateFrom?: string;
  dateTo?: string;
}

export interface DailySalesRow {
  [key: string]: unknown;
}
