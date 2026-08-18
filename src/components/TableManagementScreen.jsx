import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, MoveRight, RefreshCw, Sparkles, UtensilsCrossed, Wrench } from 'lucide-react';
import { useTableManagement } from '../hooks/useTableManagement';

const statusStyles = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  RESERVED: 'bg-blue-100 text-blue-800',
  OCCUPIED: 'bg-amber-100 text-amber-800',
  CLEANING: 'bg-purple-100 text-purple-800',
  DISABLED: 'bg-red-100 text-red-800',
};

export default function TableManagementScreen({ role, onBack }) {
  const includeInactive = ['ADMIN', 'MANAGER'].includes(role);
  const {
    tables,
    isLoading,
    error,
    refresh,
    updatingId,
    actionError,
    reserve,
    releaseReservation,
    startCleaning,
    completeCleaning,
    setOutOfService,
    restore,
    moveOrder,
  } = useTableManagement(true, { includeInactive });
  const [move, setMove] = useState(null);
  const destinations = useMemo(
    () => tables.filter((table) => table.id !== move?.sourceTableId && ['AVAILABLE', 'RESERVED'].includes(table.status)),
    [move, tables],
  );

  const runOutOfService = async (tableId) => {
    if (!globalThis.confirm('Mark this table out of service? It will be unavailable for new orders.')) return;
    await setOutOfService(tableId, 'Marked out of service from table operations');
  };

  const runCleaningComplete = async (tableId) => {
    if (!globalThis.confirm('Confirm this table has been cleaned and is ready for guests?')) return;
    await completeCleaning(tableId);
  };

  const runStartCleaning = async (tableId) => {
    if (!globalThis.confirm('Start cleaning this served table now?')) return;
    await startCleaning(tableId);
  };

  return (
    <div className="w-full h-full bg-[#F5F6F8] text-[#121212] flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 bg-[#121212] text-white px-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="w-5 h-5" /> Dashboard
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
          <UtensilsCrossed className="w-5 h-5 text-[#D4AF37]" /> Table Operations
        </div>
        <button onClick={() => refresh()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        {(error || actionError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError || error}
          </div>
        )}
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-3 text-gray-500"><Loader2 className="w-6 h-6 animate-spin" /> Loading tables…</div>
        ) : tables.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">No restaurant tables are configured.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {tables.map((table) => {
              const order = table.activeOrder;
              const busy = updatingId === table.id || updatingId === order?.id;
              return (
                <article key={table.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                    <div><p className="text-lg font-black">TABLE {table.tableNumber}</p><p className="text-xs text-gray-500">{table.area} · {table.capacity} guests</p></div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${statusStyles[table.status] || 'bg-gray-100'}`}>{table.status.replaceAll('_', ' ')}</span>
                  </div>
                  <div className="min-h-24 py-4 text-sm">
                    {order ? (
                      <div className="space-y-1"><p className="font-black">{order.orderNumber}</p><p className="text-gray-500">{order.status} · {order.paymentStatus}</p><p className="text-lg font-black">RM {order.total.toFixed(2)}</p><p className="text-xs text-gray-400">Opened {new Date(order.createdAt).toLocaleString()}</p></div>
                    ) : table.status === 'OCCUPIED' ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        <p className="font-black">OCCUPIED</p>
                        <p className="mt-1 text-xs">No unpaid bill · a new bill may be started, or cleaning can begin after kitchen fulfillment.</p>
                      </div>
                    ) : <p className="text-gray-400">No active order</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {table.status === 'AVAILABLE' && (
                      <button disabled={busy} onClick={() => reserve(table.id)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">Reserve</button>
                    )}
                    {table.status === 'RESERVED' && (
                      <button disabled={busy} onClick={() => releaseReservation(table.id)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold disabled:opacity-50">Release Reservation</button>
                    )}
                    {table.status === 'CLEANING' && (
                      <button disabled={busy} onClick={() => runCleaningComplete(table.id)} className="rounded-lg bg-purple-100 px-3 py-2 text-xs font-bold text-purple-800 disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Cleaning Complete</button>
                    )}
                    {table.status === 'OCCUPIED' && !order && (
                      <button disabled={busy} onClick={() => runStartCleaning(table.id)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Start Cleaning</button>
                    )}
                    {order && role !== 'CASHIER' && (
                      <button disabled={busy} onClick={() => setMove({ orderId: order.id, sourceTableId: table.id, orderNumber: order.orderNumber })} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50 flex items-center gap-1"><MoveRight className="w-3.5 h-3.5" /> Move</button>
                    )}
                    {['ADMIN', 'MANAGER'].includes(role) && ['AVAILABLE', 'CLEANING'].includes(table.status) && (
                      <button disabled={busy} onClick={() => runOutOfService(table.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> Out of Service</button>
                    )}
                    {['ADMIN', 'MANAGER'].includes(role) && table.status === 'DISABLED' && (
                      <button disabled={busy} onClick={() => restore(table.id)} className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50">Restore</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {move && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-black">Move {move.orderNumber}</h2>
            <p className="mt-1 text-xs text-gray-500">The source table will enter CLEANING. The destination will become OCCUPIED atomically.</p>
            {actionError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {destinations.map((table) => <button key={table.id} disabled={Boolean(updatingId)} onClick={async () => { if (!globalThis.confirm(`Move ${move.orderNumber} to table ${table.tableNumber}?`)) return; const result = await moveOrder(move.orderId, table.id); if (!result.error) setMove(null); }} className="rounded-xl border border-gray-200 p-3 text-sm font-black hover:border-[#D4AF37] disabled:opacity-50">{table.tableNumber}<span className="block text-[9px] text-gray-400">{table.status}</span></button>)}
            </div>
            {destinations.length === 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No destination table is available.</p>}
            <button onClick={() => setMove(null)} className="mt-5 w-full rounded-xl bg-gray-100 py-3 text-sm font-bold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
