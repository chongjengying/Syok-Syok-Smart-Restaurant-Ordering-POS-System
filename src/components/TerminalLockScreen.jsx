import React, { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { startStaffPinSession } from '../features/auth/authService';

export default function TerminalLockScreen({ staff, onUnlock, onLogout }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy || pin.length !== 6) return;
    setBusy(true); setError('');
    const result = await startStaffPinSession(staff.id, pin);
    setPin(''); setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    onUnlock();
  };
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#101014] p-6 text-white">
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#1a1a1e] p-8 text-center shadow-2xl">
      <Lock className="mx-auto h-12 w-12 text-[#D4AF37]" />
      <h1 className="mt-5 text-2xl font-black">Terminal Locked</h1>
      <p className="mt-2 text-slate-400">Welcome back, {staff?.name || 'staff'}</p>
      <input autoFocus type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && void submit()} className="mx-auto mt-7 block w-full rounded-xl border border-white/15 bg-black/30 p-4 text-center text-3xl tracking-[0.5em] outline-none focus:border-[#D4AF37]" aria-label="PIN" />
      {error && <p role="alert" className="mt-3 text-sm font-bold text-red-300">{error}</p>}
      <button disabled={busy || pin.length !== 6} onClick={() => void submit()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] p-4 font-black text-black disabled:opacity-40">{busy && <Loader2 className="animate-spin" size={18}/>} {busy ? 'Unlocking…' : 'Unlock'}</button>
      <button
        onClick={() => {
          if (window.confirm('Switch staff now? You will leave the current staff session.')) onLogout();
        }}
        className="mt-4 text-sm font-bold text-slate-400 underline"
      >
        Switch Staff / Log Out
      </button>
    </section>
  </div>;
}
