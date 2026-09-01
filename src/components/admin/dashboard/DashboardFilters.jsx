import React from 'react';
import { CalendarDays, Filter, X } from 'lucide-react';

const presets=[['today','Today'],['yesterday','Yesterday'],['last7days','Last 7 Days'],['month','This Month'],['custom','Custom']];

export default function DashboardFilters({ state, data }) {
  const {filters,setFilter,setPreset}=state;
  const options=data?.filterOptions||{};
  const hasAdvanced=filters.diningMode||filters.paymentMethod||filters.paymentProviderId||filters.staffId||filters.branchId;
  const clearAdvanced=()=>['diningMode','paymentMethod','paymentProviderId','staffId','branchId'].forEach(key=>setFilter(key,''));
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Dashboard filters">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 flex items-center gap-2 text-xs font-black uppercase text-slate-500"><CalendarDays size={16}/>Period</span>
      {presets.map(([id,label])=><button key={id} onClick={()=>setPreset(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${filters.preset===id?'bg-slate-950 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}
      {filters.preset==='custom'&&<><input aria-label="From date" type="date" value={filters.dateFrom} max={filters.dateTo} onChange={e=>setFilter('dateFrom',e.target.value)} className="rounded-lg border px-3 py-1.5 text-xs"/><span className="text-xs text-slate-400">to</span><input aria-label="To date" type="date" value={filters.dateTo} min={filters.dateFrom} onChange={e=>setFilter('dateTo',e.target.value)} className="rounded-lg border px-3 py-1.5 text-xs"/></>}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
      <span className="mr-1 flex items-center gap-2 text-xs font-black uppercase text-slate-500"><Filter size={15}/>Scope</span>
      <select aria-label="Branch" value={filters.branchId} onChange={e=>setFilter('branchId',e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="">All branches</option>{(options.branches||[]).map(branch=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      <select aria-label="Order type" value={filters.diningMode} onChange={e=>setFilter('diningMode',e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="">All order types</option><option value="dine-in">Dine-in</option><option value="takeaway">Takeaway</option></select>
      <select aria-label="Payment method" value={filters.paymentMethod} onChange={e=>setFilter('paymentMethod',e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="">All payment methods</option>{['CASH','QR','CARD','EWALLET'].map(method=><option key={method}>{method}</option>)}</select>
      <select aria-label="Payment provider" value={filters.paymentProviderId} onChange={e=>setFilter('paymentProviderId',e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="">All providers</option>{(options.paymentProviders||[]).map(provider=><option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>)}</select>
      {data?.access?.staffPerformance&&<select aria-label="Staff" value={filters.staffId} onChange={e=>setFilter('staffId',e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-xs"><option value="">All staff</option>{(options.staff||[]).map(staff=><option key={staff.id} value={staff.id}>{staff.name} · {staff.role}</option>)}</select>}
      {hasAdvanced&&<button onClick={clearAdvanced} className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50"><X size={14}/>Clear scope</button>}
    </div>
  </section>;
}
