import React from 'react';
import { Activity, ExternalLink } from 'lucide-react';
import type { SystemHealth } from '../../types/systemHealth';
import { HealthBadge } from './HealthBadge';

export default function SystemHealthSummaryCard({health,onOpen}:{health:SystemHealth|null;onOpen:()=>void}){
  const important=['database','supabase','realtime','edge-functions','payment','kds','backup'];
  return <button onClick={onOpen} className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md"><div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-800"><Activity size={18} className="text-amber-600"/>System Health</p><p className="mt-1 text-xs text-slate-500">Live operational status of core POS dependencies.</p></div><ExternalLink size={16} className="text-slate-400"/></div><div className="mt-4 flex flex-wrap items-center gap-2"><HealthBadge status={health?.overallStatus||'UNKNOWN'}/>{health?.components.filter(item=>important.includes(item.component)).slice(0,7).map(item=><span key={item.component} className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{item.label}: {item.operationalStatus||item.status}</span>)}</div></button>;
}
