import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function PosStartupScreen({ title = 'Restoring POS terminal' }) {
  const [progress, setProgress] = useState(12);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(92, current + (current < 45 ? 11 : current < 75 ? 6 : 2)));
    }, 350);
    return () => window.clearInterval(timer);
  }, []);
  const status = progress < 35
    ? 'Reading device credential'
    : progress < 70
      ? 'Authenticating terminal'
      : 'Validating terminal binding';
  return <div className="flex h-full w-full items-center justify-center bg-[#0A0A0F] p-6 text-white">
    <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#18181D] p-10 text-center shadow-2xl">
      <ShieldCheck size={42} className="mx-auto text-[#D4AF37]" />
      <h1 className="mt-6 text-2xl font-black">{title}</h1>
      <p className="mt-3 text-sm text-gray-400">{status}</p>
      <Loader2 size={24} className="mx-auto mt-7 animate-spin text-[#D4AF37]" />
      <div className="mt-6 overflow-hidden rounded-full bg-white/10" aria-label={`Terminal restoration ${progress}%`}>
        <div className="h-2 bg-[#D4AF37] transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-3 font-mono text-sm font-black text-[#D4AF37]">{progress}%</p>
    </div>
  </div>;
}
