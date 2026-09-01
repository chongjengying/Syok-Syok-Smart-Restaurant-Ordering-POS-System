import React, { useEffect, useRef, useState } from 'react';

export default function StaffPinScreen({ staff, error, isSubmitting, onSubmit, onCancel }) {
  const [pin, setPin] = useState('');
  const submitLock = useRef(false);
  const press = async (value) => {
    if (isSubmitting || submitLock.current) return;
    if (value === 'back') return setPin(current => current.slice(0, -1));
    if (value === 'submit') {
      if (pin.length !== 6) return;
      submitLock.current = true;
      const ok = await onSubmit(pin);
      submitLock.current = false;
      if (!ok) setPin('');
      return;
    }
    setPin(current => current.length < 6 ? `${current}${value}` : current);
  };
  useEffect(() => {
    const keydown = (event) => {
      if (/^\d$/.test(event.key)) void press(event.key);
      if (event.key === 'Backspace') void press('back');
      if (event.key === 'Enter') void press('submit');
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const keys = ['1','2','3','4','5','6','7','8','9','back','0','submit'];
  return <div className="flex h-full w-full items-center justify-center bg-[#101014] p-5 text-white"><section className="w-full max-w-sm text-center"><h1 className="text-3xl font-black">{staff.name}</h1><p className="mt-2 text-xs font-black tracking-[0.25em] text-[#D4AF37]">{staff.role}</p><p className="mt-8 text-sm font-bold text-gray-300">Enter your 6-digit PIN</p><div aria-label={`${pin.length} of 6 PIN digits entered`} className="my-7 flex justify-center gap-4">{[0,1,2,3,4,5].map(index => <i key={index} className={`h-3 w-3 rounded-full border ${index < pin.length ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-gray-500'}`}/>)}</div>{error&&<p role="alert" className="mb-4 text-sm font-bold text-red-400">{error}</p>}<div className="mx-auto grid max-w-[270px] grid-cols-3 overflow-hidden rounded-2xl border border-white/15">{keys.map(key => <button key={key} type="button" disabled={isSubmitting} onClick={() => void press(key)} className="h-16 border-b border-r border-white/10 text-xl font-black transition hover:bg-white/10 disabled:opacity-40">{key === 'back' ? '←' : key === 'submit' ? isSubmitting ? '…' : '✓' : key}</button>)}</div><button onClick={onCancel} disabled={isSubmitting} className="mt-8 rounded-xl border border-white/15 px-6 py-2 text-sm font-bold text-gray-400 hover:text-white">Cancel</button></section></div>;
}
