import React from 'react';
import { Activity, AlertTriangle, CircleHelp } from 'lucide-react';
import { BUILD_INFO } from '../../config/appVersion';
import type { SystemHealth } from '../../types/systemHealth';

export default function OperationalIndicator({health,onClick}:{health:SystemHealth|null;onClick:()=>void}){
  const status=health?.overallStatus||'UNKNOWN';
  const Icon=status==='CRITICAL'||status==='WARNING'?AlertTriangle:status==='UNKNOWN'?CircleHelp:Activity;
  const tone=status==='CRITICAL'?'border-red-300 bg-red-50 text-red-800':status==='WARNING'||status==='DEGRADED'?'border-amber-300 bg-amber-50 text-amber-900':status==='HEALTHY'?'border-emerald-300 bg-emerald-50 text-emerald-800':'border-slate-300 bg-slate-50 text-slate-600';
  return <button onClick={onClick} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left ${tone}`} title="Open System Health"><Icon size={16}/><span><strong className="block text-xs">{status==='CRITICAL'?'SYSTEM CRITICAL':status==='HEALTHY'?'System Healthy':status==='UNKNOWN'?'System Unknown':'System Warning'}</strong><small className="block text-[9px] font-black tracking-wider">{health?.environment||'—'} · {health?.version.appVersion||BUILD_INFO.appVersion}</small></span></button>;
}
