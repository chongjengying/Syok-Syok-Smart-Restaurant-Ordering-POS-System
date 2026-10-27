import React, { useRef, useState } from 'react';
import { AlertTriangle, Boxes, Download, History, Plus, RefreshCw, X } from 'lucide-react';
import { useInventory } from '../../hooks/useInventory';
import { translate } from '../../utils/i18n';
import AccessibleDialog from '../../components/admin/AccessibleDialog';
import { fetchInventoryHistory, fetchInventoryProducts, persistInventoryAdjustment } from '../../repositories/inventory.repository';
import type { InventoryItem } from '../../types/inventory';

export default function InventoryManagementPage({ lang = 'en', canManage = false }: { lang?: string; canManage?: boolean }) {
  const tr = (key: string, variables: Record<string, unknown> = {}) => translate(lang, key, variables);
  const state = useInventory();
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState('ADJUSTMENT');
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const requestKey = useRef('');
  const submitting = useRef(false);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyGeneration = useRef(0);
  const resetForm = () => {
    requestKey.current = crypto.randomUUID();
    setQuantity(''); setReason(''); setDestination(''); setActionError('');
  };
  const create = async () => {
    resetForm(); setType('ADJUSTMENT'); setProductId(''); setProducts([]); setCreating(true); setBusy(true);
    const result = await fetchInventoryProducts(state.branchId);
    setBusy(false);
    if (result.error) { setActionError(result.error.message); return; }
    setProducts(result.data || []); setProductId(result.data?.[0]?.id || '');
  };
  const submit = async () => {
    if (submitting.current) return;
    const value = Number(quantity);
    if (!Number.isFinite(value) || value === 0 || reason.trim().length < 3 ||
      ((creating || type === 'TRANSFER') && value <= 0) || (creating && !productId) || (type === 'TRANSFER' && !destination)) {
      setActionError(tr('inventoryInvalidAdjustment')); return;
    }
    submitting.current = true; setBusy(true); setActionError('');
    try {
      const result = creating
        ? await persistInventoryAdjustment({ branchId: state.branchId, productId, quantityDelta: value, movementType: 'OPENING', reason: reason.trim(), expectedVersion: 0, idempotencyKey: requestKey.current })
        : await state.adjust(selected!, value, type, reason.trim(), requestKey.current, destination);
      if (result.error) { setActionError(result.error.message); return; }
      setSelected(null); setCreating(false);
      if (creating) await state.refresh();
    } finally { submitting.current = false; setBusy(false); }
  };
  const showHistory = async (item: InventoryItem) => {
    const request = ++historyGeneration.current;
    setHistoryItem(item); setHistory([]); setHistoryError(''); setHistoryLoading(true);
    const result = await fetchInventoryHistory(item.id);
    if (request !== historyGeneration.current) return;
    setHistoryLoading(false);
    if (result.error) setHistoryError(result.error.message); else setHistory(result.data || []);
  };
  const closeHistory = () => { ++historyGeneration.current; setHistoryItem(null); };
  const exportPage = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.rows, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `inventory-${state.branchId}-page-${state.page}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <h1 className="flex items-center gap-2 text-2xl font-black"><Boxes />{tr('inventory')}</h1>
      <div className="flex flex-wrap gap-2">
        {canManage && <button disabled={!state.branchId || state.loading} onClick={() => void create()} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 disabled:opacity-40"><Plus size={17} />Opening Stock</button>}
        <button disabled={state.loading || !state.rows.length} onClick={exportPage} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 disabled:opacity-40"><Download size={17} />Export Page</button>
        <button onClick={() => void state.refresh()} title={tr('refresh')} aria-label={tr('refresh')} className="rounded-lg border bg-white p-3"><RefreshCw size={17} /></button>
      </div>
    </header>
    <div className="grid gap-3 border-y py-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold">{tr('branch')}<select value={state.branchId} onChange={e => state.setBranchId(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5">{!state.branches.length && <option value="">No authorized branches</option>}{state.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="text-xs font-bold lg:col-span-2">{tr('search')}<input value={state.search} onChange={e => state.setSearch(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5" /></label>
      <label className="flex items-center gap-2 self-end p-2.5 text-sm font-bold"><input type="checkbox" checked={state.lowStockOnly} onChange={e => state.setLowStockOnly(e.target.checked)} />{tr('lowStockOnly')}</label>
    </div>
    {state.error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{state.error}</div>}
    {state.summary && <dl className="grid grid-cols-2 gap-4 border-b pb-4 sm:grid-cols-4">{[['Stock Items', state.summary.itemCount], ['Total Quantity', state.summary.quantity], ['Cost Value', Number(state.summary.costValue).toFixed(2)], ['Low Stock', state.summary.lowStockCount]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-lg font-bold">{value}</dd></div>)}</dl>}
    {state.loading ? <div role="status">{tr('loading')}</div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{state.rows.map(item => {
      const low = Number(item.stock_on_hand) <= Number(item.reorder_level);
      return <article key={item.id} className={`rounded-lg border bg-white p-4 ${low ? 'border-amber-300' : ''}`}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="break-words">{item.product_name}</strong><p className="text-xs text-slate-500">{item.product_code}</p></div>{low && <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-amber-800"><AlertTriangle size={12} />{tr('lowStock')}</span>}</div>
        <div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-500">{tr('onHand')}</p><p className="text-xl font-black">{item.stock_on_hand} <small>{item.unit}</small></p></div><div><p className="text-xs text-slate-500">{tr('reorderLevel')}</p><p className="text-xl font-black">{item.reorder_level}</p></div></div>
        <div className="mt-4 flex gap-2">{canManage && <button onClick={() => { resetForm(); setSelected(item); setType('ADJUSTMENT'); }} className="flex-1 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white">{tr('adjustStock')}</button>}<button onClick={() => void showHistory(item)} title="Stock history" aria-label={`Stock history for ${item.product_name}`} className="rounded-lg border p-2"><History size={18} /></button></div>
      </article>;
    })}</div>}
    {!state.loading && !state.rows.length && <p className="p-8 text-center text-slate-500">{tr('noInventory')}</p>}
    <nav aria-label={tr('pagination')} className="flex justify-center gap-3"><button disabled={state.loading || state.page <= 1} onClick={() => state.setPage(value => Math.max(1, value - 1))} className="rounded border px-3 py-2 disabled:opacity-40">{tr('previous')}</button><span className="p-2">{tr('pageOf', { page: state.page, total: Math.max(1, Math.ceil(state.total / state.pageSize)) })}</span><button disabled={state.loading || state.page * state.pageSize >= state.total} onClick={() => state.setPage(value => value + 1)} className="rounded border px-3 py-2 disabled:opacity-40">{tr('next')}</button></nav>
    {(selected || creating) && <AccessibleDialog title={creating ? 'Opening Stock' : tr('adjustStock')} onClose={() => { if (!busy) { setSelected(null); setCreating(false); } }} className="max-w-md">
      <div className="flex items-start justify-between gap-3"><h2 aria-hidden="true" className="text-xl font-black break-words">{creating ? 'Opening Stock' : selected?.product_name}</h2><button disabled={busy} onClick={() => { setSelected(null); setCreating(false); }} aria-label={tr('close')}><X /></button></div>
      {creating ? <label className="mt-4 block text-sm font-bold">Product<select disabled={busy} value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 w-full rounded-lg border p-3">{products.map(product => <option key={product.id} value={product.id}>{product.product_name}</option>)}</select></label> : <label className="mt-4 block text-sm font-bold">{tr('movementType')}<select disabled={busy} value={type} onChange={e => setType(e.target.value)} className="mt-1 w-full rounded-lg border p-3">{['PURCHASE', 'WASTE', 'ADJUSTMENT', 'RETURN', 'TRANSFER'].map(value => <option key={value}>{value}</option>)}</select></label>}
      {type === 'TRANSFER' && !creating && <label className="mt-3 block text-sm font-bold">Destination Branch<select disabled={busy} value={destination} onChange={e => setDestination(e.target.value)} className="mt-1 w-full rounded-lg border p-3"><option value="">Select branch</option>{state.branches.filter(branch => branch.id !== selected?.branch_id).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      <label className="mt-3 block text-sm font-bold">{creating || type === 'TRANSFER' ? 'Quantity' : tr('quantityDelta')}<input disabled={busy} autoFocus inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      <label className="mt-3 block text-sm font-bold">{tr('reason')}<textarea disabled={busy} value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-3" /></label>
      {actionError && <p role="alert" className="mt-2 text-sm text-red-600">{actionError}</p>}
      <button disabled={busy} onClick={() => void submit()} className="mt-4 w-full rounded-lg bg-amber-400 p-3 font-black disabled:opacity-50">{busy ? tr('saving') : tr('confirm')}</button>
    </AccessibleDialog>}
    {historyItem && <AccessibleDialog title="Stock History" onClose={closeHistory} className="max-w-xl">
      <div className="flex justify-between gap-3"><h2 className="text-xl font-black">{historyItem.product_name}</h2><button onClick={closeHistory} aria-label={tr('close')}><X /></button></div>
      {historyError && <p role="alert" className="mt-3 text-red-700">{historyError}</p>}
      {historyLoading ? <p role="status">{tr('loading')}</p> : <div className="mt-4 max-h-96 overflow-auto divide-y">{!history.length && <p>No stock movements</p>}{history.map(movement => <div key={movement.id} className="py-3"><div className="flex justify-between gap-3"><strong>{movement.movement_type}</strong><span>{movement.quantity_delta} → {movement.balance_after}</span></div><p className="break-words text-sm">{movement.reason}</p><time className="text-xs text-slate-500">{new Date(movement.created_at).toLocaleString()}</time></div>)}</div>}
    </AccessibleDialog>}
  </section>;
}
