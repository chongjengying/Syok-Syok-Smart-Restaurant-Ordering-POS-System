import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { formatPercent } from '../../../utils/admin-dashboard-formatters';
import SharedStatusBadge from '../../ui/StatusBadge';

export function Panel({ title, subtitle, action, children, className = '' }) {
  return <article className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_5px_18px_rgba(16,42,67,0.06)] ${className}`}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</h2>{subtitle&&<p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>
      {action}
    </header>
    {children}
  </article>;
}

export function MetricCard({ label, value, helper, growth, Icon, tone='amber', onClick }) {
  const tones={amber:'bg-[#E2F7F2] text-[#087F70]',blue:'bg-[#E6F0FF] text-[#2167C7]',green:'bg-[#E8F8F0] text-[#16805C]',red:'bg-[#FFF0F0] text-[#C24141]',violet:'bg-[#F0EAFE] text-[#7551C8]'};
  const GrowthIcon=growth==null?Minus:growth>=0?ArrowUpRight:ArrowDownRight;
  const content=<><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div><span className={`rounded-xl p-2.5 ${tones[tone]||tones.amber}`}><Icon size={19}/></span></div>{growth!==undefined&&<p className={`mt-3 flex items-center gap-1 text-xs font-bold ${growth==null?'text-slate-500':growth>=0?'text-emerald-600':'text-red-600'}`}><GrowthIcon size={14}/>{formatPercent(growth)} <span className="font-medium text-slate-500">vs previous period</span></p>}{helper&&<p className="mt-3 text-xs text-slate-500">{helper}</p>}</>;
  return onClick?<button onClick={onClick} className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-[0_5px_18px_rgba(16,42,67,0.06)] transition hover:-translate-y-0.5 hover:border-[#8ACFC4] hover:shadow-[0_10px_24px_rgba(16,42,67,0.1)]">{content}</button>:<article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_5px_18px_rgba(16,42,67,0.06)]">{content}</article>;
}

export function StatusBadge({ value }) {
  return <SharedStatusBadge value={value} />;
}

export function EmptyState({ children='No data for this period.' }) { return <p className="py-10 text-center text-sm text-slate-500">{children}</p>; }

export function DashboardSkeleton() { return <section className="animate-pulse space-y-5" aria-label="Loading dashboard"><div className="h-24 rounded-2xl bg-white"/><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0,1,2,3].map(item=><div key={item} className="h-36 rounded-2xl bg-white"/>)}</div><div className="grid gap-5 xl:grid-cols-3"><div className="h-80 rounded-2xl bg-white xl:col-span-2"/><div className="h-80 rounded-2xl bg-white"/></div></section>; }

export function ErrorState({ message, onRetry }) { return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700"><p className="font-bold">Unable to load dashboard</p><p className="mt-1 text-sm">{message}</p><button onClick={onRetry} className="mt-4 flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white"><RefreshCw size={15}/>Retry</button></div>; }
