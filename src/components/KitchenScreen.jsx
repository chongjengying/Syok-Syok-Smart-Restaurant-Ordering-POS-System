import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChefHat, Clock, Loader2, RefreshCw, Utensils } from 'lucide-react';
import { getKitchenAction, updateKitchenBatch } from '../services/kitchen.service';
import { useKitchenOrders } from '../hooks/useKitchenOrders';
import { getUserErrorMessage } from '../shared/errorMessages';

const allowedTargetsByRole = {
  ADMIN: new Set(['PREPARING', 'READY']),
  MANAGER: new Set(['PREPARING', 'READY']),
  KITCHEN: new Set(['PREPARING', 'READY']),
  WAITER: new Set(),
};

function formatElapsed(startedAt, now) {
  if (!startedAt) return '00:00';
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function KitchenScreen({ role, onBack }) {
  const { orders, isLoading, error, refresh } = useKitchenOrders(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const allowedTargets = allowedTargetsByRole[role] || new Set();
  const sortedOrders = useMemo(
    () => [...orders].sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)),
    [orders],
  );

  useEffect(() => {
    const timer = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, []);

  const advanceTicket = async (ticket, action) => {
    if (!action || !allowedTargets.has(action.target)) return;
    setUpdatingId(ticket.id);
    setActionError('');
    const result = await updateKitchenBatch(
      ticket.orderId,
      ticket.id,
      action.kind === 'START' ? 'start' : 'ready',
    );
    if (result.error) setActionError(getUserErrorMessage(result.error, 'The kitchen status could not be updated.'));
    else await refresh({ silent: true });
    setUpdatingId(null);
  };

  return (
    <div className="w-full h-full bg-[#F5F6F8] text-[#121212] flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 bg-[#121212] text-white px-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="w-5 h-5" /> Dashboard
        </button>
        <div className="flex items-center gap-2 font-black tracking-wider uppercase">
          <ChefHat className="w-5 h-5 text-[#D4AF37]" /> Kitchen Queue
        </div>
        <button onClick={() => refresh()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {(error || actionError) && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {actionError || error}
          </div>
        )}
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-3 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin" /> Loading persisted kitchen orders...
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Utensils className="w-12 h-12 mb-3" />
            <p className="font-bold text-gray-600">No active kitchen orders</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {sortedOrders.map((ticket) => {
              const action = getKitchenAction(ticket);
              const canAdvance = action && allowedTargets.has(action.target);
              return (
                <article key={ticket.id} className={`rounded-2xl border-2 bg-white p-5 shadow-sm ${
                  ticket.status === 'PREPARING' ? 'border-orange-300' : ticket.status === 'READY' ? 'border-emerald-300' : ticket.isAddOn ? 'border-[#D4AF37]' : 'border-gray-200'
                }`}>
                  <div className="flex justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <p className="font-black text-lg">Order #{ticket.orderNumber}</p>
                      <p className="text-xs font-bold uppercase text-gray-600">{ticket.diningMode === 'dine-in' ? `Table ${ticket.tableNumber}` : 'Takeaway'}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ticket.isAddOn ? 'bg-[#D4AF37] text-black' : 'bg-gray-900 text-white'}`}>
                          {ticket.isAddOn ? `ADD-ON • ROUND ${ticket.batchNo}` : `ROUND ${ticket.batchNo}`}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <span className={`h-fit rounded-full px-3 py-1 text-xs font-black ${
                      ticket.status === 'PREPARING'
                        ? 'bg-orange-100 text-orange-800'
                        : ticket.status === 'READY'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {ticket.status === 'PENDING' ? 'KITCHEN PENDING' : ticket.status}
                      {ticket.status === 'PREPARING' && ` • ${formatElapsed(ticket.startedAt, now)}`}
                    </span>
                  </div>
                  <div className="py-4 space-y-3">
                    {ticket.items.map((item) => (
                      <div key={item.id}>
                        <p className="font-bold flex items-center gap-2">
                          <span>{item.quantity}× {item.name}</span>
                          {item.serviceMode === 'TAKEAWAY' && (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[9px] font-black text-sky-800">🥡 TAKEAWAY</span>
                          )}
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black text-gray-600">
                            {item.itemStatus}
                          </span>
                        </p>
                        {item.options.map((option) => <p key={option.id} className="ml-4 text-xs text-gray-500">• {option.groupName}: {option.name}</p>)}
                        {item.specialRequest && <p className="ml-4 text-xs font-semibold text-amber-700">Request: {item.specialRequest}</p>}
                      </div>
                    ))}
                    {ticket.diningMode === 'takeaway' && ticket.takeawayPackaging.length > 0 && (
                      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                        <p className="text-[9px] font-black uppercase text-sky-700">Packaging</p>
                        <p className="mt-1 text-xs font-bold text-sky-950">{ticket.takeawayPackaging.map((entry) => entry.replaceAll('_', ' ')).join(' · ')}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      {ticket.status === 'PREPARING'
                        ? `Preparing ${formatElapsed(ticket.startedAt, now)}`
                        : ticket.status === 'READY'
                          ? 'Ready for front-of-house'
                          : 'Waiting to start'}
                    </span>
                    {canAdvance && (
                      <button
                        disabled={updatingId === ticket.id}
                        onClick={() => advanceTicket(ticket, action)}
                        className={`min-w-24 rounded-xl px-5 py-2.5 text-xs font-black disabled:opacity-50 ${
                          action.label === 'START'
                            ? 'bg-[#121212] text-[#D4AF37]'
                            : action.label === 'READY'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#D4AF37] text-[#121212]'
                        }`}
                      >
                        {updatingId === ticket.id ? 'UPDATING…' : action.label}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
