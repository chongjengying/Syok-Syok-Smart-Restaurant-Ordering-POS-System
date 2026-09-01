import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, MoveRight, Pencil, Plus, RefreshCw, Sparkles, UtensilsCrossed, Wrench, X } from 'lucide-react';
import { useTableManagement } from '../hooks/useTableManagement';
import { translate, translateStatus } from '../utils/i18n';

const statusStyles = {
  AVAILABLE: 'bg-emerald-100 text-emerald-800',
  RESERVED: 'bg-blue-100 text-blue-800',
  OCCUPIED: 'bg-amber-100 text-amber-800',
  CLEANING: 'bg-purple-100 text-purple-800',
  DISABLED: 'bg-red-100 text-red-800',
};

export default function TableManagementScreen({ role, onBack, lang = 'en', embedded = false, initialStatus = '' }) {
  const tr = (key, variables) => translate(lang, key, variables);
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
    create,
    edit,
  } = useTableManagement(true, { includeInactive });
  const [move, setMove] = useState(null);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [tableEditor, setTableEditor] = useState(null);
  const [tableForm, setTableForm] = useState({ tableNumber: '', tableName: '', capacity: 2, area: 'Indoor' });
  const destinations = useMemo(
    () => tables.filter((table) => table.id !== move?.sourceTableId && ['AVAILABLE', 'RESERVED'].includes(table.status)),
    [move, tables],
  );
  const visibleTables = useMemo(() => statusFilter ? tables.filter(table => table.status === statusFilter) : tables, [statusFilter, tables]);

  const runOutOfService = async (tableId) => {
    if (!globalThis.confirm(tr('confirmOutOfService'))) return;
    await setOutOfService(tableId, 'Marked out of service from table operations');
  };

  const runCleaningComplete = async (tableId) => {
    if (!globalThis.confirm(tr('confirmCleaned'))) return;
    await completeCleaning(tableId);
  };

  const runStartCleaning = async (tableId) => {
    if (!globalThis.confirm(tr('confirmStartCleaning'))) return;
    await startCleaning(tableId);
  };

  return (
    <div className={`w-full ${embedded ? '' : 'h-full'} bg-[#F5F6F8] text-[#121212] flex flex-col ${embedded ? '' : 'overflow-hidden'}`}>
      {!embedded && <header className="h-16 shrink-0 bg-[#121212] text-white px-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="w-5 h-5" /> {tr('dashboard')}
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
          <UtensilsCrossed className="w-5 h-5 text-[#D4AF37]" /> {tr('tableOperations')}
        </div>
        <button onClick={() => refresh()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]">
          <RefreshCw className="w-4 h-4" /> {tr('refresh')}
        </button>
      </header>}

      {embedded && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Tables</h1><p className="text-sm text-gray-500">Capacity, areas, availability, and operational status.</p></div><div className="flex gap-2"><select aria-label="Table status" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="rounded-xl border bg-white px-3 text-sm"><option value="">All statuses</option>{Object.keys(statusStyles).map(status=><option key={status}>{status}</option>)}</select><button onClick={() => { setTableEditor({ isNew: true }); setTableForm({ tableNumber: '', tableName: '', capacity: 2, area: 'Indoor' }); }} className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 font-black"><Plus size={16}/>Add Table</button><button onClick={() => refresh()} className="rounded-xl border bg-white p-3"><RefreshCw className="h-4 w-4" /></button></div></div>}

      <main className={`flex-1 ${embedded ? '' : 'overflow-y-auto p-6'} space-y-5`}>
        {(error || actionError) && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {actionError || error}
          </div>
        )}
        {isLoading ? (
          <div className="h-full flex items-center justify-center gap-3 text-gray-500"><Loader2 className="w-6 h-6 animate-spin" /> {tr('loadingTables')}</div>
        ) : visibleTables.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500">{tr('noTables')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleTables.map((table) => {
              const order = table.activeOrder;
              const busy = updatingId === table.id || updatingId === order?.id;
              return (
                <article key={table.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between border-b border-gray-100 pb-3">
                    <div><p className="text-lg font-black">{tr('tableNumber', { number: table.tableNumber })}</p><p className="text-xs text-gray-500">{table.area} · {tr('guests', { count: table.capacity })}</p></div>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black ${statusStyles[table.status] || 'bg-gray-100'}`}>{translateStatus(lang, table.status)}</span>
                  </div>
                  <div className="min-h-24 py-4 text-sm">
                    {order ? (
                      <div className="space-y-1"><p className="font-black">{order.orderNumber}</p><p className="text-gray-500">{translateStatus(lang, order.status)} · {translateStatus(lang, order.paymentStatus)}</p><p className="text-lg font-black">RM {order.total.toFixed(2)}</p><p className="text-xs text-gray-400">{tr('opened', { date: new Date(order.createdAt).toLocaleString() })}</p></div>
                    ) : table.status === 'OCCUPIED' ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        <p className="font-black">{translateStatus(lang, 'OCCUPIED')}</p>
                        <p className="mt-1 text-xs">{tr('occupiedNoBill')}</p>
                      </div>
                    ) : <p className="text-gray-400">{tr('noActiveOrder')}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    {embedded && ['ADMIN', 'MANAGER'].includes(role) && <button disabled={busy} onClick={() => { setTableEditor(table); setTableForm({ tableNumber: table.tableNumber, tableName: table.tableName || '', capacity: table.capacity, area: table.area || 'Indoor' }); }} className="rounded-lg border px-3 py-2 text-xs font-bold flex items-center gap-1"><Pencil size={13}/> Edit</button>}
                    {table.status === 'AVAILABLE' && (
                      <button disabled={busy} onClick={() => reserve(table.id)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50">{tr('reserve')}</button>
                    )}
                    {table.status === 'RESERVED' && (
                      <button disabled={busy} onClick={() => releaseReservation(table.id)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold disabled:opacity-50">{tr('releaseReservation')}</button>
                    )}
                    {table.status === 'CLEANING' && (
                      <button disabled={busy} onClick={() => runCleaningComplete(table.id)} className="rounded-lg bg-purple-100 px-3 py-2 text-xs font-bold text-purple-800 disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> {tr('cleaningComplete')}</button>
                    )}
                    {table.status === 'OCCUPIED' && !order && (
                      <button disabled={busy} onClick={() => runStartCleaning(table.id)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> {tr('startCleaning')}</button>
                    )}
                    {order && (
                      <button disabled={busy} onClick={() => setMove({ orderId: order.id, sourceTableId: table.id, orderNumber: order.orderNumber })} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50 flex items-center gap-1"><MoveRight className="w-3.5 h-3.5" /> {tr('move')}</button>
                    )}
                    {['ADMIN', 'MANAGER'].includes(role) && ['AVAILABLE', 'CLEANING'].includes(table.status) && (
                      <button disabled={busy} onClick={() => runOutOfService(table.id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> {tr('outOfService')}</button>
                    )}
                    {['ADMIN', 'MANAGER'].includes(role) && table.status === 'DISABLED' && (
                      <button disabled={busy} onClick={() => restore(table.id)} className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50">{tr('restore')}</button>
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
            <h2 className="text-lg font-black">{tr('moveOrder')} {move.orderNumber}</h2>
            <p className="mt-1 text-xs text-gray-500">{tr('destinationHelp')}</p>
            {actionError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {actionError}
              </div>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {destinations.map((table) => <button key={table.id} disabled={Boolean(updatingId)} onClick={async () => { if (!globalThis.confirm(tr('moveConfirm', { order: move.orderNumber, table: table.tableNumber }))) return; const result = await moveOrder(move.orderId, table.id, move.sourceTableId); if (!result.error) setMove(null); }} className="rounded-xl border border-gray-200 p-3 text-sm font-black hover:border-[#D4AF37] disabled:opacity-50">{table.tableNumber}<span className="block text-[9px] text-gray-400">{translateStatus(lang, table.status)}</span></button>)}
            </div>
            {destinations.length === 0 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{tr('noDestination')}</p>}
            <button onClick={() => setMove(null)} className="mt-5 w-full rounded-xl bg-gray-100 py-3 text-sm font-bold">{tr('cancel')}</button>
          </div>
        </div>
      )}
      {tableEditor && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><form onSubmit={async e => { e.preventDefault(); const input = { ...tableForm, capacity: Number(tableForm.capacity) }; const result = tableEditor.id ? await edit(tableEditor.id, input) : await create(input); if (!result.error) setTableEditor(null); }} className="w-full max-w-md rounded-2xl bg-white p-6"><div className="mb-5 flex justify-between"><h2 className="text-xl font-black">{tableEditor.id ? 'Edit' : 'Add'} Table</h2><button type="button" onClick={() => setTableEditor(null)}><X/></button></div><label className="block text-sm font-bold">Table number<input required maxLength={20} value={tableForm.tableNumber} onChange={e => setTableForm({...tableForm,tableNumber:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label className="mt-4 block text-sm font-bold">Name<input maxLength={100} value={tableForm.tableName} onChange={e => setTableForm({...tableForm,tableName:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label className="mt-4 block text-sm font-bold">Area<input required maxLength={100} value={tableForm.area} onChange={e => setTableForm({...tableForm,area:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label className="mt-4 block text-sm font-bold">Capacity<input required type="number" min="1" max="100" value={tableForm.capacity} onChange={e => setTableForm({...tableForm,capacity:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>{actionError&&<p className="mt-3 text-sm text-red-600">{actionError}</p>}<button disabled={Boolean(updatingId)} className="mt-6 w-full rounded-xl bg-[#D4AF37] p-3 font-black">{updatingId?'Saving…':'Save Table'}</button></form></div>}
    </div>
  );
}
