import React from 'react';
import { CheckCircle2, Database, Layers, Loader2, ServerCog, UtensilsCrossed, Wifi } from 'lucide-react';

export default function StaffAccessStatusScreen({ isOnline, mode = 'checking' }) {
  const environment = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'staging').toUpperCase();
  const restoring = mode === 'restoring';
  const checks = [
    ['Internet Connection', isOnline],
    ['Database Connection', true],
    ['Services', true],
  ];
  return <div className="flex h-full w-full items-center justify-center bg-[#101014] p-4 text-white lg:p-6">
    <section className="flex h-full max-h-[720px] w-full max-w-[520px] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1A1A1E] via-[#121217] to-[#0A0A0C] shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <main className="flex flex-1 flex-col items-center justify-center px-10 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[#D4AF37]/60 bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_36px_rgba(212,175,55,0.18)]">
          {restoring ? <Loader2 size={44} className="animate-spin" /> : <UtensilsCrossed size={44} />}
        </div>
        <h1 className="mt-7 text-3xl font-black tracking-wide">SYOK SYOK POS</h1>
        <p className="mt-2 text-sm font-bold text-slate-400">Restaurant Management System</p>
        <div className="mt-9 flex flex-col items-center">
          <Loader2 className="h-9 w-9 animate-spin text-[#D4AF37]" />
          <p className="mt-5 text-lg font-black">{restoring ? 'Restoring your session...' : 'Checking system...'}</p>
          <p className="mt-1 text-sm font-medium text-slate-500">Please wait</p>
        </div>
        <div className="mt-9 w-full max-w-sm space-y-4 border-t border-white/10 pt-6 text-left">
          {checks.map(([label, ok]) => <div key={label} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-3 text-slate-300">
              {label === 'Internet Connection' ? <Wifi size={17} /> : label === 'Database Connection' ? <Database size={17} /> : <ServerCog size={17} />}
              {label}
            </span>
            <span className={`flex items-center gap-1.5 font-black ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
              <CheckCircle2 size={15} />
              {ok ? 'Online' : 'Offline'}
            </span>
          </div>)}
        </div>
      </main>
      <footer className="border-t border-slate-700/55">
        <div className="flex items-center justify-between gap-5 bg-white/[0.025] px-8 py-4">
          <span className="flex items-center gap-3">
            <i className={`h-4 w-4 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_18px_rgba(34,197,94,0.42)]' : 'bg-red-500'}`}/>
            <strong className="text-sm font-black">{isOnline ? 'Online' : 'Offline'}</strong>
          </span>
          <span className="flex items-center gap-2 rounded-xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 py-2 text-sm font-black text-[#D4AF37]">
            <Layers size={17}/>
            {environment}
          </span>
        </div>
      </footer>
    </section>
  </div>;
}
