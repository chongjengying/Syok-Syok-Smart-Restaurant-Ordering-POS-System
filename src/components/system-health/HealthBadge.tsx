import React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, CircleX, Gauge } from 'lucide-react';
import type { HealthStatus, OperationalStatus } from '../../types/systemHealth';

export function HealthBadge({status,label}:{status:HealthStatus;label?:OperationalStatus|string}){
  const display=label||status;
  const styles={HEALTHY:'bg-emerald-100 text-emerald-800',DEGRADED:'bg-orange-100 text-orange-800',WARNING:'bg-amber-100 text-amber-900',CRITICAL:'bg-red-100 text-red-800',UNKNOWN:'bg-slate-100 text-slate-700'};
  const Icon=status==='HEALTHY'?CheckCircle2:status==='CRITICAL'?CircleX:status==='UNKNOWN'?CircleHelp:status==='WARNING'?AlertTriangle:Gauge;
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black tracking-wide ${styles[status]}`}><Icon size={13}/>{String(display).replaceAll('_',' ')}</span>;
}
