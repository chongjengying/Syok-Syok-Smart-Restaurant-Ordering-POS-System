export type PaymentRequest = {
  orderId: string;
  amount: number;
  method: 'CASH' | 'CARD' | 'QR' | 'EWALLET';
  idempotencyKey: string;
};

export type PaymentProviderResult = {
  confirmed: boolean;
  provider: string;
  transactionReference?: string;
  error?: string;
  retryable?: boolean;
};

export interface PaymentProvider {
  process(request: PaymentRequest): Promise<PaymentProviderResult>;
}

export type PaymentCapability = {
  method: PaymentRequest['method'];
  available: boolean;
  mode: 'manual' | 'unavailable';
};

export class CashPaymentProvider implements PaymentProvider {
  async process(request: PaymentRequest): Promise<PaymentProviderResult> {
    return {
      confirmed: true,
      provider: 'CASH_REGISTER',
      transactionReference: `CASH-${request.idempotencyKey}`,
    };
  }
}

export class QrPaymentProvider implements PaymentProvider {
  async process(request: PaymentRequest): Promise<PaymentProviderResult> {
    return {
      confirmed: true,
      provider: 'QR_TERMINAL',
      transactionReference: `QR-${request.idempotencyKey}`,
    };
  }
}

export class UnavailablePaymentProvider implements PaymentProvider {
  constructor(private readonly method: string) {}

  async process(): Promise<PaymentProviderResult> {
    return {
      confirmed: false,
      provider: 'UNCONFIGURED',
      error: `${this.method} payment provider is not configured. Use cash or configure a real provider adapter.`,
      retryable: false,
    };
  }
}

export function getPaymentCapabilities(): PaymentCapability[] {
  return [
    { method: 'CASH', available: true, mode: 'manual' },
    { method: 'CARD', available: false, mode: 'unavailable' },
    { method: 'QR', available: true, mode: 'manual' },
    { method: 'EWALLET', available: false, mode: 'unavailable' },
  ];
}

export function createPaymentProvider(method: PaymentRequest['method']): PaymentProvider {
  if (method === 'CASH') return new CashPaymentProvider();
  if (method === 'QR') return new QrPaymentProvider();
  return new UnavailablePaymentProvider(method);
}
