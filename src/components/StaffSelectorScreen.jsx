import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronUp, Delete, Info, Lock, LogIn, LogOut, Search, ShieldCheck, UserRound, UsersRound, UtensilsCrossed, X } from 'lucide-react';

const requiresPinSetup = (staff) => Boolean(
  staff && (staff.pin_setup_required || !staff.pin_status || staff.pin_status === 'SETUP_REQUIRED' || staff.pin_status === 'NOT_CONFIGURED')
);

export default function StaffSelectorScreen({
  staff,
  selectedStaff,
  isLoading,
  isSubmitting,
  error,
  isOnline,
  onSelect,
  onSubmit,
  onSetupPin,
  currentUserId,
  pinResetRequired,
  terminalContext,
  onCancel,
  onRetry,
  onLogout,
  canConfigurePins,
  onConfigurePins,
  canSkip,
  onSkip,
}) {
  const [time, setTime] = useState(() => new Date());
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [resetStep, setResetStep] = useState('new');
  const [confirmError, setConfirmError] = useState('');
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [showTerminalInfo, setShowTerminalInfo] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const submitLock = useRef(false);
  useEffect(() => { const timer = window.setInterval(() => setTime(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    setPin('');
    setNewPin('');
    setResetStep('new');
    setConfirmError('');
  }, [selectedStaff?.id, pinResetRequired]);
  const press = async (value) => {
    if (isSubmitting || submitLock.current) return;
    if (value === 'back') {
      setConfirmError('');
      return setPin(current => current.slice(0, -1));
    }
    if (value === 'clear') {
      setPin('');
      setConfirmError('');
      return;
    }
    if (value === 'submit') {
      if (!selectedStaff || pin.length !== 6 || !onSubmit) return;
      submitLock.current = true;
      const setupRequired = requiresPinSetup(selectedStaff);
      let ok = false;
      if (pinResetRequired && onSetupPin) {
        if (resetStep === 'new') {
          setNewPin(pin);
          setPin('');
          setResetStep('confirm');
          submitLock.current = false;
          return;
        }
        if (pin !== newPin) {
          setConfirmError('PINs do not match. Create a new PIN again.');
          setPin('');
          setNewPin('');
          setResetStep('new');
          submitLock.current = false;
          return;
        }
        ok = await onSetupPin(pin);
      } else {
        ok = setupRequired && onSetupPin ? await onSetupPin(pin) : await onSubmit(pin);
      }
      submitLock.current = false;
      if (!ok) setPin('');
      if (ok && setupRequired) setPin('');
      if (ok && pinResetRequired) {
        setPin('');
        setNewPin('');
        setResetStep('new');
      }
      return;
    }
    setConfirmError('');
    setPin(current => current.length < 6 ? `${current}${value}` : current);
  };
  useEffect(() => {
    const keydown = (event) => {
      if (/^\d$/.test(event.key)) void press(event.key);
      if (event.key === 'Backspace') void press('back');
      if (event.key === 'Enter') void press('submit');
      if (event.key === 'Escape' && selectedStaff && onCancel) onCancel();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const normalizedStaffSearch = staffSearch.trim().toLowerCase();
  const matchingStaff = normalizedStaffSearch
    ? staff.filter(person => `${person.staff_code || ''} ${person.id || ''} ${person.username || ''} ${person.email || ''} ${person.name || ''} ${person.role || ''}`.toLowerCase().includes(normalizedStaffSearch))
    : staff;
  const visibleStaff = normalizedStaffSearch ? matchingStaff : showAllStaff ? matchingStaff : staff.slice(0, 4);
  const keys = ['1','2','3','4','5','6','7','8','9','back','0','clear'];
  const hasPinError = Boolean(error && selectedStaff);
  const setupRequired = requiresPinSetup(selectedStaff);
  const temporaryPinRequired = Boolean(selectedStaff?.temporary_pin_required || selectedStaff?.pin_status === 'TEMPORARY_RESET');
  const canSetupSelectedPin = setupRequired && selectedStaff?.id === currentUserId;
  const pinHeading = pinResetRequired
    ? resetStep === 'confirm' ? 'Confirm New PIN' : 'Create New PIN'
    : temporaryPinRequired ? 'Enter Temporary PIN' : setupRequired ? 'Set 6-Digit PIN' : 'Enter PIN';
  const pinHelp = selectedStaff
    ? pinResetRequired
      ? `${resetStep === 'confirm' ? 'Confirm' : 'Create'} the permanent POS PIN for`
      : setupRequired
        ? canSetupSelectedPin ? 'Create your private POS PIN for' : 'Sign in with this staff member’s account to set a PIN for'
        : temporaryPinRequired ? 'Enter the temporary PIN issued for' : 'Continue as'
    : 'Choose a staff member to unlock PIN entry.';
  const isCreatingPin = pinResetRequired || setupRequired;
  const keypadDisabled = isSubmitting || !selectedStaff || (setupRequired && !canSetupSelectedPin && !pinResetRequired);
  return <div className="flex h-full w-full items-center justify-center bg-[#101014] p-4 text-white lg:p-6">
    <section className="flex h-full max-h-[720px] w-full max-w-[1040px] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1A1A1E] via-[#121217] to-[#0A0A0C] shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <header className="border-b border-white/10 px-8 pb-5 pt-7 lg:px-10">
        <div className="mb-5 flex items-center justify-end text-xs font-black uppercase tracking-[0.18em] text-slate-400"><button type="button" onClick={() => setShowTerminalInfo(true)} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-black normal-case tracking-normal text-slate-300 transition hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"><Info size={14}/>Terminal info</button></div>
        <div className="flex items-center justify-between gap-5 text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/70 bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_36px_rgba(212,175,55,0.18)]">
            <UtensilsCrossed size={31} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow sm:text-4xl">{terminalContext?.companyName || 'POS Terminal'}</h1>
            <p className="mt-1 text-xl font-bold text-slate-400">Staff sign in</p>
            {terminalContext && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold"><span className="text-slate-300">{terminalContext.branchName || terminalContext.branchCode || 'Branch'}</span><span className="text-slate-600">·</span><span className="text-[#D4AF37]">{terminalContext.terminalName || terminalContext.terminalCode || 'Terminal'}</span></div>}
          </div>
        </div>
        <time className="sr-only">{time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-[minmax(360px,1fr)_minmax(390px,0.95fr)] gap-8 overflow-y-auto border-t border-slate-600/30 px-8 py-6 lg:px-10">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <UsersRound className="h-7 w-7 text-[#D4AF37]" />
            <h2 className="text-xl font-black lg:text-2xl">Select Staff</h2>
          </div>
          <div className="relative mb-3"><label className="mb-2 block text-xs font-black uppercase tracking-[0.16em] text-slate-500">Staff</label><Search className="absolute left-3 top-11 h-4 w-4 text-slate-500"/><input aria-label="Employee ID or staff name" autoFocus value={staffSearch} onChange={event=>{const value=event.target.value;setStaffSearch(value);const exact=staff.find(person=>String(person.staff_code||'').toLowerCase()===value.trim().toLowerCase());if(exact) onSelect(exact);}} placeholder="Enter employee ID or search staff" className="w-full rounded-xl border border-white/10 bg-black/25 py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]"/></div>
          {isLoading ? <p className="rounded-2xl border border-slate-700/70 bg-white/[0.03] py-8 text-center text-slate-400">Loading staff...</p> : error && !staff.length ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center">
            <p className="text-sm font-bold text-red-300">{error}</p>
            <button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-[#D4AF37] px-5 py-2 text-sm font-black text-black shadow-[0_10px_24px_rgba(212,175,55,0.2)]">Retry</button>
          </div> : visibleStaff.length ? <div className="grid max-h-[460px] gap-2 overflow-y-auto pr-1">
            {visibleStaff.map(person => <button key={person.id} type="button" disabled={isSubmitting} onClick={() => onSelect(person)} className={`group flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${selectedStaff?.id === person.id ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_0_1px_rgba(212,175,55,0.25)]' : 'border-white/10 bg-white/[0.045] hover:border-[#D4AF37]/60 hover:bg-white/[0.07]'}`}>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${selectedStaff?.id === person.id ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]' : 'border-slate-500/50 bg-slate-600/30 text-white'}`}>
                <UserRound size={22} strokeWidth={2.2}/>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-base font-black text-white">{person.name}</strong>
                <span className={`${selectedStaff?.id === person.id ? 'text-[#D4AF37]' : 'text-slate-400'} mt-1 block text-xs font-bold capitalize`}>{person.role?.toLowerCase() || 'staff'} · {person.staff_code || person.id}</span>
              </span>
              {selectedStaff?.id === person.id && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-black"><Check size={17} strokeWidth={3}/></span>}
            </button>)}
          </div> : <div className="rounded-2xl border border-slate-700/70 bg-white/[0.03] p-7 text-center"><p className="text-slate-400">{showAllStaff&&staff.length?'No staff match your search.':'No active staff PINs are configured.'}</p>{canConfigurePins&&!staff.length&&<button onClick={onConfigurePins} className="mt-5 rounded-xl bg-[#D4AF37] px-5 py-3 font-black text-black">Configure staff PINs</button>}</div>}
          {staff.length>4&&<button type="button" onClick={()=>{setShowAllStaff(current=>!current);setStaffSearch('');}} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-black text-slate-200 transition hover:border-[#D4AF37]/50 hover:text-[#D4AF37]">
            {showAllStaff?<ChevronUp size={17}/>:<UserRound size={17}/>}
            {showAllStaff?'Show Quick Staff':`Other Staff (${staff.length-4})`}
          </button>}
        </div>
        <div className={`${selectedStaff ? 'opacity-100' : 'opacity-45'} flex min-h-fit flex-col transition`}>
          <div className="mb-4 flex min-h-11 items-center gap-3">
            <Lock className="h-7 w-7 text-[#D4AF37]" />
            <h2 className="text-xl font-black lg:text-2xl">{pinHeading}</h2>
            {selectedStaff&&<button type="button" onClick={onCancel} disabled={isSubmitting} className="ml-auto flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-sm font-black text-slate-300 transition hover:border-[#D4AF37]/60 hover:text-[#D4AF37] disabled:opacity-40" aria-label="Back to staff selection">
              <ArrowLeft size={18}/>
              Back to staff
            </button>}
          </div>
          {selectedStaff&&temporaryPinRequired&&<div role="status" className="mb-4 flex gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-left text-amber-100">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <strong className="block text-sm font-black">{pinResetRequired ? 'Temporary PIN accepted' : 'PIN reset requested'}</strong>
              <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/80">{pinResetRequired ? 'Temporary PIN accepted. Create and confirm a new permanent six-digit PIN.' : 'An administrator reset this PIN. Enter the temporary 6-digit PIN provided by your administrator.'}</p>
            </div>
          </div>}
          {selectedStaff ? <p className="mb-3 text-center text-sm font-bold text-slate-400">{pinHelp} <span className="text-white">{selectedStaff.name}</span></p> : <p className="mb-3 text-center text-sm font-bold text-slate-500">{pinHelp}</p>}
          {selectedStaff&&isCreatingPin&&<div aria-label="PIN requirements" className="mb-4 rounded-xl border border-sky-400/25 bg-sky-400/[0.08] px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-sky-200"><ShieldCheck size={15}/>PIN requirements</div>
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs font-bold text-slate-200">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">6 digits</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">No sequences</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">No repeated digits</span>
            </div>
          </div>}
          <div aria-label={`${pin.length} of 6 PIN digits entered`} className="mb-5 flex justify-center gap-10">
            {[0,1,2,3,4,5].map(index => <i key={index} className={`h-5 w-5 rounded-full border shadow-[0_0_18px_rgba(212,175,55,0.2)] ${hasPinError && index < pin.length ? 'border-red-400 bg-red-500' : index < pin.length ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-slate-600 bg-slate-700/40'}`}/>)}
          </div>
          {confirmError&&<p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-center text-sm font-bold text-red-300">{confirmError}</p>}
          {error&&selectedStaff&&<p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-center text-sm font-bold text-red-300">{error}</p>}
          <div className="mx-auto grid w-full max-w-[430px] grid-cols-3 gap-3">
            {keys.map(key => <button key={key} type="button" aria-label={key === 'back' ? 'Delete last PIN digit' : key === 'clear' ? 'Clear PIN' : `Enter ${key}`} disabled={keypadDisabled} onClick={() => void press(key)} className={`${key === '0' ? 'col-start-2' : ''} flex h-[68px] items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] text-4xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.22)] transition hover:border-[#D4AF37]/70 hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-30`}>
              {key === 'back' ? <Delete size={27}/> : key === 'clear' ? 'Clear' : key}
            </button>)}
          </div>
          <button type="button" disabled={keypadDisabled || pin.length !== 6} onClick={() => void press('submit')} className="relative z-20 mx-auto mt-6 flex min-h-[70px] w-full max-w-[430px] shrink-0 items-center justify-center gap-4 rounded-xl border border-[#D4AF37]/60 bg-[#D4AF37] px-5 text-2xl font-black text-black shadow-[0_18px_42px_rgba(212,175,55,0.24),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-35">
            <LogIn size={31} />
            {isSubmitting ? pinResetRequired || setupRequired ? 'Saving PIN...' : 'Signing in...' : pinResetRequired ? resetStep === 'confirm' ? 'Save PIN' : 'Continue' : setupRequired ? 'Set PIN' : 'Sign In'}
          </button>
          {canSkip && <div className="mx-auto mt-5 w-full max-w-[430px] rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-center">
            <p className="text-xs font-semibold text-slate-400">Need to enter the POS without selecting a staff PIN?</p>
            <button type="button" onClick={onSkip} disabled={isSubmitting} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl border border-[#D4AF37]/70 bg-transparent px-5 text-base font-black text-[#D4AF37] transition hover:bg-[#D4AF37]/10 disabled:opacity-40">
              Continue without PIN
            </button>
          </div>}
        </div>
      </main>
      <footer className="relative z-0 shrink-0 border-t border-slate-700/55">
        <div className="flex items-center justify-between gap-5 bg-white/[0.025] px-8 py-4 lg:px-10">
          <span className="flex items-center gap-4">
            <i className={`h-6 w-6 rounded-full border-2 ${isOnline ? 'border-emerald-300 bg-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.42)]' : 'border-red-300 bg-red-500'}`}/>
            <span>
              <strong className="block text-lg font-black">{isOnline ? 'Online' : 'Offline'}</strong>
              <small className="text-xs font-medium text-slate-400">{isOnline ? (terminalContext ? `${terminalContext.companyName} · registered terminal` : 'Registered terminal required') : 'Connection unavailable'}</small>
            </span>
          </span>
          <span className="text-xs font-bold text-slate-500">{isOnline ? 'Connected terminal' : 'Local mode'}</span>
        </div>
        <div className="relative flex min-h-14 items-center justify-center gap-3 border-t border-slate-700/40 px-8 py-3 text-sm font-bold text-slate-500 lg:px-10">
          <span className="flex items-center gap-3">
            <ShieldCheck size={20}/>
            <span>Secure staff access</span>
          </span>
          <button type="button" onClick={onLogout} disabled={isSubmitting} className="absolute right-8 flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-black text-slate-300 transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-40 lg:right-10">
            <LogOut size={17}/>
            Sign out setup account
          </button>
        </div>
      </footer>
      <footer className="border-t border-white/10 px-8 py-4 text-xs font-bold text-slate-500">Terminal {terminalContext?.terminalCode || '—'} · {terminalContext?.terminalName || 'Not identified'}</footer>
      {showTerminalInfo && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="terminal-info-title" className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#1A1A1E] p-6 text-white shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]">Bound device</p><h2 id="terminal-info-title" className="mt-2 text-2xl font-black">Terminal Info</h2></div><button type="button" onClick={() => setShowTerminalInfo(false)} aria-label="Close terminal information" className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20}/></button></div><div className="mt-6 space-y-4">{[['Company', terminalContext?.companyName], ['Branch', terminalContext?.branchName || terminalContext?.branchCode], ['Terminal', terminalContext?.terminalName], ['Terminal code', terminalContext?.terminalCode], ['Terminal type', terminalContext?.terminalType || 'STANDARD_POS']].map(([label, value]) => <div key={label} className="flex items-start justify-between gap-5 border-b border-white/10 pb-3"><span className="text-sm text-slate-400">{label}</span><strong className="text-right text-sm text-white">{value || '—'}</strong></div>)}<div className="flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4"><span className="text-sm font-bold text-emerald-100">Device activation status</span><span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-black text-emerald-300">ACTIVE · BOUND</span></div></div></section></div>}
    </section>
  </div>;
}
