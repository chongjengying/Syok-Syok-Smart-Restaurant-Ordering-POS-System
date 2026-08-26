import React, { useMemo, useState } from 'react';
import { ArrowLeft, BellRing, Clock, Loader2, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { useReadyToServeOrders } from '../hooks/useReadyToServeOrders';
import { serveReadyOrder } from '../services/serving.service';
import { getUserErrorMessage } from '../shared/errorMessages';
import { translate, translatePackaging } from '../utils/i18n';

export default function ReadyToServeScreen({ onBack, lang = 'en' }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const { orders, isLoading, error, refresh } = useReadyToServeOrders(true);
  const [servingId, setServingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const sortedOrders = useMemo(
    () => [...orders].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)),
    [orders],
  );

  const serve = async (orderId) => {
    if (servingId) return;
    setServingId(orderId);
    setActionError('');
    const result = await serveReadyOrder(orderId);
    if (result.error) setActionError(getUserErrorMessage(result.error, 'Unable to mark this order as served.'));
    else await refresh({ silent: true });
    setServingId(null);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="h-5 w-5" /> {tr('dashboard')}
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
          <BellRing className="h-5 w-5 text-emerald-400" /> {tr('readyServeCollect')}
        </div>
        <button onClick={() => refresh()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
          <RefreshCw className="h-4 w-4" /> {tr('refresh')}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {(error || actionError) && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError || error}</div>
        )}
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-3 text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" /> {tr('loadingReady')}
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <BellRing className="mb-3 h-12 w-12" />
            <p className="font-bold text-gray-600">{tr('noReadyOrders')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {sortedOrders.map((order) => (
              <article key={order.id} className="rounded-2xl border-2 border-emerald-300 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <p className="text-lg font-black">{tr('orderNumber', { number: order.orderNumber })}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold uppercase text-gray-600">
                      <UtensilsCrossed className="h-3.5 w-3.5" /> {order.diningMode === 'takeaway' ? tr('takeawayPickup') : tr('tableNumber', { number: order.tableNumber || '-' })}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">READY</span>
                </div>

                <div className="space-y-3 py-4">
                  {order.items.map((item) => (
                    <div key={item.id}>
                      <p className="font-bold">{item.quantity}× {item.name}</p>
                      {item.options.map((option) => (
                        <p key={option.id} className="ml-4 text-xs text-gray-500">• {option.groupName}: {option.name}</p>
                      ))}
                      {item.specialRequest && <p className="ml-4 text-xs font-semibold text-amber-700">Request: {item.specialRequest}</p>}
                    </div>
                  ))}
                  {order.diningMode === 'takeaway' && order.takeawayPackaging.length > 0 && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                      <p className="text-[10px] font-black uppercase text-sky-800">{tr('packWithOrder')}</p>
                      <p className="mt-1 text-xs font-bold text-sky-950">{order.takeawayPackaging.map((entry) => translatePackaging(lang, entry)).join(' · ')}</p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end border-t border-gray-100 pt-3">
                  <button
                    disabled={Boolean(servingId)}
                    onClick={() => void serve(order.id)}
                    className="min-w-28 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"
                  >
                    {servingId === order.id
                      ? order.diningMode === 'takeaway' ? tr('collecting') : tr('serving')
                      : order.diningMode === 'takeaway' ? tr('markCollected') : tr('markServed')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
