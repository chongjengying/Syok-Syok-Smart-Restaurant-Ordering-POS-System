import React from 'react';
import { CheckCircle2, Printer, ReceiptText } from 'lucide-react';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;

export default function PaymentConfirmationScreen({ confirmation, onDone }) {
  const { order, paymentMethod, receivedAmount, changeAmount } = confirmation;
  const fulfillmentContinues = order.items.some((item) =>
    ['SUBMITTED', 'PREPARING', 'READY'].includes(item.itemStatus),
  );

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#121212] p-6 text-white">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white text-[#121212] shadow-2xl">
        <div className="bg-emerald-500 p-7 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16" />
          <h1 className="mt-3 text-2xl font-black uppercase">Payment Confirmed</h1>
          <p className="mt-1 text-sm font-semibold">
            {fulfillmentContinues
              ? 'Payment is persisted. Kitchen preparation and serving will continue.'
              : 'The payment and completed order are persisted in Supabase.'}
          </p>
        </div>

        <div className="p-6">
          <div className="flex justify-between border-b border-dashed border-gray-300 pb-4 font-bold">
            <span>{order.diningMode === 'dine-in' ? `Table ${order.table?.tableNumber || '-'}` : 'Takeaway'}</span>
            <span>{order.orderNumber}</span>
          </div>
          <div className="max-h-52 space-y-2 overflow-y-auto py-4">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between gap-4 text-sm">
                <span>{item.name} ×{item.quantity}</span>
                <span className="font-bold">{money(item.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-dashed border-gray-300 pt-4 text-sm">
            <div className="flex justify-between"><span>Payment method</span><strong>{paymentMethod}</strong></div>
            <div className="flex justify-between text-lg"><span>Total paid</span><strong>{money(order.total)}</strong></div>
            {paymentMethod === 'CASH' && (
              <>
                <div className="flex justify-between"><span>Received</span><strong>{money(receivedAmount)}</strong></div>
                <div className="flex justify-between text-emerald-700"><span>Change</span><strong>{money(changeAmount)}</strong></div>
              </>
            )}
          </div>
          {fulfillmentContinues && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-800">
              The bill is completed, but its active kitchen rounds remain visible until served. The dine-in table stays occupied and can start a separate new bill; paid items cannot be edited or reused.
            </div>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button onClick={() => window.print()} className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold">
              <Printer className="h-4 w-4" /> Print Receipt
            </button>
            <button onClick={onDone} className="flex items-center justify-center gap-2 rounded-xl bg-[#121212] px-4 py-3 text-sm font-bold text-[#D4AF37]">
              <ReceiptText className="h-4 w-4" /> Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
