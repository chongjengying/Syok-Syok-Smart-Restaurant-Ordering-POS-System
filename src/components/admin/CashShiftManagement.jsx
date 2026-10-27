import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, RefreshCw } from 'lucide-react';
import { forceCloseCashierShift, getCashierShiftSummary, listCashierShifts } from '../../services/organization.service';
import ShiftSummary from '../ShiftSummary';
import { shiftDate, shiftError, shiftMoney, shiftVariance } from '../../shared/shiftPresentation';

const control = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export default function CashShiftManagement({ canForceClose = false, initialShiftId = '', terminalFilterId = '' }) {
  const [rows, setRows] = useState([]), [options, setOptions] = useState([]), [filters, setFilters] = useState({ status: '', branchId: '', terminalId: '', staffId: '', from: '', to: '' });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [summary, setSummary] = useState(null), [detailId, setDetailId] = useState(initialShiftId);
  const [target, setTarget] = useState(null), [actual, setActual] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const sequence = useRef(0), pending = useRef(false);
  useEffect(() => { setDetailId(initialShiftId); setSummary(null); }, [initialShiftId]);
  const load = useCallback(async () => {
    const ticket = ++sequence.current; setLoading(true); setError('');
    try {
      if (detailId) {
        const result = await getCashierShiftSummary(detailId); if (result.error) throw result.error;
        if (ticket === sequence.current) setSummary(result.data);
      } else {
        const query = { ...filters, terminalId: terminalFilterId || filters.terminalId };
        query.from = filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : '';
        query.to = filters.to ? new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86400000).toISOString() : '';
        const result = await listCashierShifts('', query); if (result.error) throw result.error;
        if (ticket === sequence.current) { setRows(result.data || []); setOptions(previous => [...new Map([...previous, ...(result.data || [])].map(row => [row.id, row])).values()]); }
      }
    } catch (cause) { if (ticket === sequence.current) setError(shiftError(cause)); }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, [detailId, filters, terminalFilterId]);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  useEffect(() => { void load(); const refresh = () => void load(); window.addEventListener('focus', refresh); return () => { invalidate(); window.removeEventListener('focus', refresh); }; }, [load, invalidate]);
  const submit = async e => {
    e.preventDefault(); if (!target || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const result = await forceCloseCashierShift(target.id, Number(actual), reason); if (result.error) throw result.error; setTarget(null); await load(); }
    catch (cause) { setError(shiftError(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const unique = (field, label) => [...new Map(options.map(row => [row[field], label(row)])).entries()];
  const select = (field, label, values) => <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">{label}<select value={filters[field]} onChange={e => setFilters({ ...filters, [field]: e.target.value })} className={control}><option value="">All {label.toLowerCase()}</option>{values.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3">{detailId && <button title="Back to shift history" aria-label="Back to shift history" onClick={() => { setDetailId(''); setSummary(null); }} className="rounded-lg border p-2"><ArrowLeft size={18} /></button>}<h1 className="text-xl font-bold">{detailId ? 'Shift Summary' : 'Shift History'}</h1></div><button onClick={() => void load()} disabled={loading || busy} title="Refresh shifts" aria-label="Refresh shifts" className="rounded-lg border p-2"><RefreshCw size={18} /></button></header>
    {!detailId && <div className="grid gap-3 border-y border-slate-200 py-4 sm:grid-cols-3 lg:grid-cols-6">
      {select('status', 'Statuses', [['OPEN', 'Open'], ['CLOSED', 'Closed'], ['FORCE_CLOSED', 'Force closed']])}
      {select('branchId', 'Branches', unique('branch_id', row => row.branches?.name || '-'))}
      {!terminalFilterId && select('terminalId', 'Terminals', unique('terminal_id', row => row.pos_terminals?.terminal_code || '-'))}
      {select('staffId', 'Staff', unique('opened_by_staff_id', row => row.opened_by?.name || '-'))}
      {['from', 'to'].map(field => <label key={field} className="flex flex-col gap-1 text-xs font-semibold text-slate-600">{field === 'from' ? 'From' : 'To'}<input type="date" value={filters[field]} onChange={e => setFilters({ ...filters, [field]: e.target.value })} className={control} /></label>)}
    </div>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p role="status" className="py-5 text-sm">Loading shifts...</p> : detailId ? <>
      <ShiftSummary summary={summary} />
      {summary?.shift?.status === 'OPEN' && canForceClose && <button onClick={() => { setTarget(summary.shift); setActual(''); setReason(''); }} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-bold text-red-700">Force Close</button>}
    </> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] table-fixed text-left text-xs"><thead className="border-b bg-slate-50 text-slate-500"><tr>{['Shift', 'Staff', 'Branch', 'Terminal', 'Opened', 'Closed', 'Sales', 'Variance', 'Status'].map(h => <th key={h} className="px-2 py-3 font-semibold">{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100"><td className="break-words px-2 py-3"><button onClick={() => { setSummary(null); setDetailId(row.id); }} className="text-left font-bold text-emerald-700"><Eye size={14} className="mb-1" />{row.shift_number}</button></td><td className="break-words px-2 py-3">{row.opened_by?.name || '-'}</td><td className="break-words px-2 py-3">{row.branches?.name || '-'}</td><td className="break-words px-2 py-3">{row.pos_terminals?.terminal_code || '-'}</td><td className="px-2 py-3">{shiftDate(row.opened_at)}</td><td className="px-2 py-3">{shiftDate(row.closed_at)}</td><td className="px-2 py-3 font-semibold">{shiftMoney(row.total_sales)}</td><td className={`px-2 py-3 ${Number(row.cash_difference) < 0 ? 'text-red-700' : 'text-slate-600'}`}>{shiftVariance(row.cash_difference)}</td><td className="px-2 py-3 font-semibold">{row.status.replaceAll('_', ' ')}</td></tr>)}{!rows.length && <tr><td colSpan="9" className="py-10 text-center text-slate-500">No shifts match these filters.</td></tr>}</tbody></table></div>}
    {target && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/60 p-4"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-lg bg-white p-6"><h2 className="text-lg font-bold">Force Close {target.shift_number}</h2><label className="block text-sm font-semibold">Actual cash (RM)<input required min="0" max="1000000" step="0.01" type="number" value={actual} onChange={e => setActual(e.target.value)} className={`${control} mt-1 w-full`} /></label><label className="block text-sm font-semibold">Reason<textarea required maxLength="500" value={reason} onChange={e => setReason(e.target.value)} className={`${control} mt-1 w-full`} /></label><div className="flex gap-3"><button type="button" disabled={busy} onClick={() => setTarget(null)} className={`${control} flex-1 font-bold`}>Cancel</button><button disabled={busy} className="flex-1 rounded-lg bg-red-700 px-3 py-2 text-sm font-bold text-white">{busy ? 'Closing...' : 'Force Close'}</button></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</form></div>}
  </section>;
}
