import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { closeCashierShift, getCashierShiftSummary, getCurrentCashierShift, openCashierShift, recordCashMovement } from '../services/organization.service';
import ShiftSummary from './ShiftSummary';
import CashShiftManagement from './admin/CashShiftManagement';
import { shiftError } from '../shared/shiftPresentation';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export default function CashShiftScreen({ onBack, canMoveCash = false, canOpen = false, canClose = false, canOpenDrawer = false, staffName = '', terminalId = '' }) {
  const [shift, setShift] = useState(null), [summary, setSummary] = useState(null), [closedSummary, setClosedSummary] = useState(null);
  const [opening, setOpening] = useState(''), [actual, setActual] = useState('');
  const [movement, setMovement] = useState({ type: canMoveCash ? 'CASH_IN' : 'NO_SALE_DRAWER_OPEN', amount: '', reason: '' });
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [tab, setTab] = useState('current');
  const pending = useRef(false), sequence = useRef(0), movementRequest = useRef(null);
  const load = useCallback(async () => {
    const ticket = ++sequence.current; setLoading(true); setError('');
    try {
      const current = await getCurrentCashierShift();
      if (current.error) throw current.error;
      const next = current.data?.id ? current.data : null;
      const detail = next ? await getCashierShiftSummary(next.id) : { data: null };
      if (detail.error) throw detail.error;
      if (ticket === sequence.current) { setShift(next); setSummary(detail.data); }
    } catch (cause) { if (ticket === sequence.current) { setSummary(null); setError(shiftError(cause)); } }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => { void load(); const refresh = () => void load(); window.addEventListener('focus', refresh); return () => { invalidate(); window.removeEventListener('focus', refresh); }; }, [load, invalidate]);
  const run = async (operation, after) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const result = await operation(); if (result.error) throw result.error; await after?.(result.data); await load(); }
    catch (cause) { setError(shiftError(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const record = () => {
    const payload = { ...movement, amount: movement.type === 'NO_SALE_DRAWER_OPEN' ? 0 : Number(movement.amount) };
    const fingerprint = JSON.stringify([shift.id, payload]);
    if (movementRequest.current?.fingerprint !== fingerprint) movementRequest.current = { fingerprint, key: crypto.randomUUID() };
    return run(() => recordCashMovement(shift.id, payload.type, payload.amount, payload.reason, movementRequest.current.key), () => { movementRequest.current = null; setMovement({ ...movement, amount: '', reason: '' }); });
  };
  const close = () => run(() => closeCashierShift(shift.id, Number(actual)), async data => {
    const result = await getCashierShiftSummary(data.id); if (result.error) throw result.error;
    setClosedSummary(result.data); setActual('');
  });
  return <section className="h-full overflow-y-auto bg-white p-4 sm:p-6"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><button onClick={onBack} title="Back to POS" aria-label="Back to POS" className="rounded-lg border p-2"><ArrowLeft size={18} /></button><h1 className="text-xl font-bold">Shift Management</h1></div><button onClick={() => void load()} disabled={busy || loading} title="Refresh shift" aria-label="Refresh shift" className="rounded-lg border p-2"><RefreshCw size={18} /></button></header>
    <nav className="my-5 flex gap-5 border-b">{[['current', 'Current Shift'], ['history', 'Shift History']].map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`border-b-2 pb-3 text-sm font-bold ${tab === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`}>{label}</button>)}</nav>
    {tab === 'history' ? <CashShiftManagement terminalFilterId={terminalId} /> : <>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="py-6 text-sm">Loading shift...</p> : error && !summary ? null : !shift ? <>
        {closedSummary && <section className="mb-6 border-b pb-6"><ShiftSummary summary={closedSummary} /></section>}
        {canOpen ? <form onSubmit={e => { e.preventDefault(); void run(() => openCashierShift(Number(opening)), () => { setOpening(''); setClosedSummary(null); }); }} className="max-w-md space-y-4"><h2 className="font-bold">Open Shift</h2><p className="text-sm text-slate-600">Staff: {staffName || '-'}</p><label className="block text-sm font-semibold">Opening cash (RM)<input required min="0" max="100000" step="0.01" type="number" value={opening} onChange={e => setOpening(e.target.value)} className={inputClass} /></label><button disabled={busy} className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-bold text-white">{busy ? 'Opening...' : 'Open Shift'}</button></form> : <p className="text-sm text-slate-600">No open shift. Your role cannot open shifts.</p>}
      </> : <>
        <p className="mb-4 text-sm text-slate-600">Authenticated staff: <strong>{staffName || '-'}</strong></p>
        <ShiftSummary summary={summary} />
        {(canMoveCash || canOpenDrawer) && <form onSubmit={e => { e.preventDefault(); void record(); }} className="mt-6 grid items-end gap-3 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-semibold">Movement<select value={movement.type} onChange={e => setMovement({ ...movement, type: e.target.value })} className={inputClass}>{canMoveCash && <><option value="CASH_IN">Cash in</option><option value="CASH_OUT">Cash out</option><option value="CASH_ADJUSTMENT">Cash adjustment</option></>}{canOpenDrawer && <option value="NO_SALE_DRAWER_OPEN">Drawer opening</option>}</select></label><label className="text-sm font-semibold">Amount (RM)<input required disabled={movement.type === 'NO_SALE_DRAWER_OPEN'} min="0.01" max="1000000" step="0.01" type="number" value={movement.type === 'NO_SALE_DRAWER_OPEN' ? '0' : movement.amount} onChange={e => setMovement({ ...movement, amount: e.target.value })} className={inputClass} /></label><label className="text-sm font-semibold">Reason<input required maxLength="500" value={movement.reason} onChange={e => setMovement({ ...movement, reason: e.target.value })} className={inputClass} /></label><button disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-bold">{busy ? 'Recording...' : 'Record Movement'}</button></form>}
        {canClose && <form onSubmit={e => { e.preventDefault(); void close(); }} className="mt-6 max-w-md space-y-3 border-t pt-5"><h3 className="font-bold">Close Shift</h3><label className="block text-sm font-semibold">Actual cash (RM)<input required min="0" max="1000000" step="0.01" type="number" value={actual} onChange={e => setActual(e.target.value)} className={inputClass} /></label><button disabled={busy} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white">{busy ? 'Closing...' : 'Confirm Close'}</button></form>}
      </>}
    </>}
  </div></section>;
}
