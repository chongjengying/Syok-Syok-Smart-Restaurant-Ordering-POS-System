import React, { useState } from 'react';
import { ArrowLeft, Clock, Loader2, ReceiptText, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { useUnpaidOrders } from '../hooks/useUnpaidOrders';
import { getUserErrorMessage } from '../shared/errorMessages';
import { translate } from '../utils/i18n';
import { formatMoney } from '../services/money.service';

export default function UnpaidOrdersScreen({ onBack, onOpenOrder, lang = 'en' }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const { orders, isLoading, error, refresh } = useUnpaidOrders(true);
  const [openError, setOpenError] = useState('');

  const openOrder = async (order) => {
    setOpenError('');
    const result = await onOpenOrder(order);
    if (result?.error) setOpenError(getUserErrorMessage(result.error, 'Unable to open this unpaid order.'));
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="h-5 w-5" /> {tr('dashboard')}
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
          <ReceiptText className="h-5 w-5 text-[#D4AF37]" /> {tr('unpaidOrders')}
        </div>
        <button onClick={() => refresh()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
          <RefreshCw className="h-4 w-4" /> {tr('refresh')}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {(error || openError) && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{openError || error}</div>}
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-3 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /> {tr('loadingUnpaid')}</div>
        ) : orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <ReceiptText className="mb-3 h-12 w-12" />
            <p className="font-bold text-gray-600">{tr('noUnpaid')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <p className="text-lg font-black">{order.orderNumber}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <UtensilsCrossed className="h-3.5 w-3.5" />
                      {order.diningMode === 'dine-in' ? tr('tableNumber', { number: order.table?.tableNumber || '-' }) : tr('takeaway')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">{tr('unpaid')}</span>
                    <p className="mt-2 text-xl font-black text-[#B8952B]">{formatMoney(order.total)}</p>
                  </div>
                </div>
                <div className="max-h-40 space-y-2 overflow-y-auto py-4">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between gap-3 text-sm">
                      <div>
                        <span className="font-bold">{item.quantity}× {item.name}</span>
                        {item.serviceMode === 'TAKEAWAY' && <span className="ml-2 text-[10px] font-black text-sky-700">{tr('takeawayBadge')}</span>}
                        <span className="ml-2 text-[9px] font-black text-[#9A7618]">{item.batchNo > 1 ? tr('addOnRound', { number: item.batchNo }) : tr('round', { number: 1 })}</span>
                      </div>
                      <span className="font-semibold">{formatMoney(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="flex items-center gap-1 text-[11px] text-gray-500"><Clock className="h-3.5 w-3.5" /> {new Date(order.createdAt).toLocaleString()}</span>
                  <button onClick={() => void openOrder(order)} className="rounded-xl bg-[#121212] px-4 py-2 text-xs font-bold text-[#D4AF37]">{tr('viewOrder')}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
