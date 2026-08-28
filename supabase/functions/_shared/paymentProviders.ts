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
  mode: 'manual' | 'online' | 'unavailable';
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

class ExternalPaymentProvider implements PaymentProvider {
  constructor(private readonly method: PaymentRequest['method']) {}

  async process(request: PaymentRequest): Promise<PaymentProviderResult> {
    const endpoint=Deno.env.get('PAYMENT_GATEWAY_URL');const token=Deno.env.get('PAYMENT_GATEWAY_TOKEN');const provider=Deno.env.get('PAYMENT_GATEWAY_PROVIDER')||'EXTERNAL_GATEWAY';
    if(!endpoint||!token)return{confirmed:false,provider,error:`${this.method} payment provider is not configured.`,retryable:false};
    let url:URL;try{url=new URL(endpoint);}catch{return{confirmed:false,provider,error:'Payment gateway URL is invalid.',retryable:false};}
    if(url.protocol!=='https:'&&url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')return{confirmed:false,provider,error:'Payment gateway must use HTTPS.',retryable:false};
    try{
      const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':request.idempotencyKey},body:JSON.stringify({orderId:request.orderId,amount:request.amount,currency:'MYR',method:request.method}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)return{confirmed:false,provider,error:`Gateway rejected the payment (${response.status}).`,retryable:response.status>=500||response.status===429};
      const payload=await response.json() as Record<string,unknown>;const reference=typeof payload.transactionReference==='string'?payload.transactionReference.trim():'';
      if(payload.status!=='CONFIRMED'||!reference)return{confirmed:false,provider,error:'Gateway response was not a verified confirmation.',retryable:false};
      return{confirmed:true,provider,transactionReference:reference};
    }catch(error){return{confirmed:false,provider,error:error instanceof DOMException&&error.name==='TimeoutError'?'Payment gateway timed out.':'Payment gateway could not be reached.',retryable:true};}
  }
}

function configuredOnlineMethods(){return new Set((Deno.env.get('PAYMENT_GATEWAY_METHODS')||'').split(',').map(value=>value.trim().toUpperCase()).filter(Boolean));}

export function getPaymentCapabilities(): PaymentCapability[] {
  const configured=configuredOnlineMethods();
  return [
    { method: 'CASH', available: true, mode: 'manual' },
    { method: 'CARD', available: configured.has('CARD'), mode: configured.has('CARD') ? 'online' : 'unavailable' },
    { method: 'QR', available: true, mode: 'manual' },
    { method: 'EWALLET', available: configured.has('EWALLET'), mode: configured.has('EWALLET') ? 'online' : 'unavailable' },
  ];
}

export function createPaymentProvider(method: PaymentRequest['method']): PaymentProvider {
  if (method === 'CASH') return new CashPaymentProvider();
  if (method === 'QR') return new QrPaymentProvider();
  if(configuredOnlineMethods().has(method))return new ExternalPaymentProvider(method);
  return new UnavailablePaymentProvider(method);
}
