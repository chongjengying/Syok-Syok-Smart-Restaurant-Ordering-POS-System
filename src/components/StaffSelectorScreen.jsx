import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Banknote, Check, ChefHat, ChevronUp, ClipboardList, Delete, Layers, Lock, LogIn, LogOut, ReceiptText, Search, Settings, ShieldCheck, Table2, UserRound, UsersRound, UtensilsCrossed } from 'lucide-react';

const ROLE_FEATURES = {
  ADMIN: [
    ['Dashboard', ClipboardList],
    ['Reports', ReceiptText],
    ['Staff', UsersRound],
    ['Settings', Settings],
  ],
  MANAGER: [
    ['Dashboard', ClipboardList],
    ['Orders', ReceiptText],
    ['Tables', Table2],
    ['Reports', ReceiptText],
  ],
  WAITER: [
    ['Tables', Table2],
    ['New Orders', UtensilsCrossed],
    ['Takeaway', ReceiptText],
    ['History', ClipboardList],
  ],
  KITCHEN: [
    ['Kitchen Display', ChefHat],
    ['Order Queue', ClipboardList],
    ['Prepare', UtensilsCrossed],
    ['Ready', Check],
  ],
  CASHIER: [
    ['Orders', ReceiptText],
    ['Payments', Banknote],
    ['Refunds', ReceiptText],
    ['Cash Drawer', Banknote],
  ],
};

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
  onCancel,
  onRetry,
  onLogout,
  canConfigurePins,
  onConfigurePins,
}) {
  const [time, setTime] = useState(() => new Date());
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [resetStep, setResetStep] = useState('new');
  const [confirmError, setConfirmError] = useState('');
  const [showAllStaff, setShowAllStaff] = useState(false);
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
    if (value === 'submit') {
      if (!selectedStaff || pin.length !== 6 || !onSubmit) return;
      submitLock.current = true;
      const setupRequired = Boolean(selectedStaff.pin_setup_required || selectedStaff.pin_status === 'SETUP_REQUIRED');
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
  const environment = (import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'staging').toUpperCase();
  const normalizedStaffSearch = staffSearch.trim().toLowerCase();
  const matchingStaff = normalizedStaffSearch
    ? staff.filter(person => `${person.name || ''} ${person.role || ''}`.toLowerCase().includes(normalizedStaffSearch))
    : staff;
  const visibleStaff = showAllStaff ? matchingStaff : staff.slice(0, 4);
  const keys = ['1','2','3','4','5','6','7','8','9','back','0'];
  const features = ROLE_FEATURES[selectedStaff?.role] || [];
  const hasPinError = Boolean(error && selectedStaff);
  const setupRequired = Boolean(selectedStaff?.pin_setup_required || selectedStaff?.pin_status === 'SETUP_REQUIRED');
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
  const keypadDisabled = isSubmitting || !selectedStaff || (setupRequired && !canSetupSelectedPin && !pinResetRequired);
  return <div className="flex h-full w-full items-center justify-center bg-[#101014] p-4 text-white lg:p-6">
    <section className="flex h-full max-h-[720px] w-full max-w-[1040px] flex-col overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1A1A1E] via-[#121217] to-[#0A0A0C] shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.08)]">
      <header className="px-8 pb-5 pt-7 lg:px-10">
        <div className="flex items-center justify-center gap-5 text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-[#D4AF37]/70 bg-[#D4AF37]/10 text-[#D4AF37] shadow-[0_0_36px_rgba(212,175,55,0.18)]">
            <UtensilsCrossed size={31} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-[0.08em] text-white drop-shadow">SYOK SYOK POS</h1>
            <p className="mt-1 text-xl font-bold text-slate-400">Staff Sign In</p>
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
          {showAllStaff&&<div className="relative mb-3"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500"/><input autoFocus value={staffSearch} onChange={event=>setStaffSearch(event.target.value)} placeholder="Search staff by name or role" className="w-full rounded-xl border border-white/10 bg-black/25 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]"/></div>}
          {isLoading ? <p className="rounded-2xl border border-slate-700/70 bg-white/[0.03] py-8 text-center text-slate-400">Loading staff...</p> : error && !staff.length ? <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-center">
            <p className="text-sm font-bold text-red-300">{error}</p>
            <button type="button" onClick={onRetry} className="mt-4 rounded-xl bg-[#D4AF37] px-5 py-2 text-sm font-black text-black shadow-[0_10px_24px_rgba(212,175,55,0.2)]">Retry</button>
          </div> : visibleStaff.length ? <div className="grid max-h-[460px] gap-4 overflow-y-auto pr-1">
            {visibleStaff.map(person => <button key={person.id} type="button" disabled={isSubmitting} onClick={() => onSelect(person)} className={`group flex min-h-[112px] items-center gap-5 rounded-2xl border p-5 text-left transition disabled:opacity-50 ${selectedStaff?.id === person.id ? 'border-[#D4AF37] bg-[#D4AF37]/10 shadow-[0_0_0_1px_rgba(212,175,55,0.35),0_18px_40px_rgba(212,175,55,0.12)]' : 'border-white/10 bg-white/[0.045] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-[#D4AF37]/60 hover:bg-white/[0.07]'}`}>
              <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border ${selectedStaff?.id === person.id ? 'border-[#D4AF37]/60 bg-[#D4AF37]/15 text-[#D4AF37]' : 'border-slate-500/50 bg-slate-600/30 text-white'}`}>
                <UserRound size={33} strokeWidth={2.2}/>
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-2xl font-black text-white">{person.name}</strong>
                <span className={`${selectedStaff?.id === person.id ? 'text-[#D4AF37]' : 'text-slate-400'} mt-1 block text-lg font-bold capitalize`}>{person.role?.toLowerCase() || 'staff'}</span>
              </span>
              {selectedStaff?.id === person.id && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-black shadow-[0_8px_22px_rgba(212,175,55,0.34)]"><Check size={24} strokeWidth={3}/></span>}
            </button>)}
          </div> : <div className="rounded-2xl border border-slate-700/70 bg-white/[0.03] p-7 text-center"><p className="text-slate-400">{showAllStaff&&staff.length?'No staff match your search.':'No active staff PINs are configured.'}</p>{canConfigurePins&&!staff.length&&<button onClick={onConfigurePins} className="mt-5 rounded-xl bg-[#D4AF37] px-5 py-3 font-black text-black">Configure staff PINs</button>}</div>}
          {staff.length>4&&<button type="button" onClick={()=>{setShowAllStaff(current=>!current);setStaffSearch('');}} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-black text-slate-200 transition hover:border-[#D4AF37]/50 hover:text-[#D4AF37]">
            {showAllStaff?<ChevronUp size={17}/>:<UserRound size={17}/>}
            {showAllStaff?'Show Quick Staff':`Other Staff (${staff.length-4})`}
          </button>}
          {features.length > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-slate-500">Role entry points</p>
              <div className="grid grid-cols-2 gap-2">
                {features.map(([label, Icon]) => <span key={label} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-300"><Icon size={14} className="text-[#D4AF37]"/>{label}</span>)}
              </div>
            </div>
          )}
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
          <div aria-label={`${pin.length} of 6 PIN digits entered`} className="mb-5 flex justify-center gap-10">
            {[0,1,2,3,4,5].map(index => <i key={index} className={`h-5 w-5 rounded-full border shadow-[0_0_18px_rgba(212,175,55,0.2)] ${hasPinError && index < pin.length ? 'border-red-400 bg-red-500' : index < pin.length ? 'border-[#D4AF37] bg-[#D4AF37]' : 'border-slate-600 bg-slate-700/40'}`}/>)}
          </div>
          {selectedStaff ? <p className="mb-4 text-center text-sm font-bold text-slate-400">{pinHelp} <span className="text-white">{selectedStaff.name}</span></p> : <p className="mb-4 text-center text-sm font-bold text-slate-500">{pinHelp}</p>}
          {confirmError&&<p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-center text-sm font-bold text-red-300">{confirmError}</p>}
          {error&&selectedStaff&&<p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-center text-sm font-bold text-red-300">{error}</p>}
          <div className="mx-auto grid w-full max-w-[430px] grid-cols-3 gap-3">
            {keys.map(key => <button key={key} type="button" disabled={keypadDisabled} onClick={() => void press(key)} className={`${key === '0' ? 'col-start-2' : ''} flex h-[68px] items-center justify-center rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.09] to-white/[0.035] text-4xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.22)] transition hover:border-[#D4AF37]/70 hover:bg-white/[0.08] active:scale-[0.98] disabled:opacity-30`}>
              {key === 'back' ? <Delete size={27}/> : key}
            </button>)}
          </div>
          <button type="button" disabled={keypadDisabled || pin.length !== 6} onClick={() => void press('submit')} className="relative z-20 mx-auto mt-6 flex min-h-[70px] w-full max-w-[430px] shrink-0 items-center justify-center gap-4 rounded-xl border border-[#D4AF37]/60 bg-[#D4AF37] px-5 text-2xl font-black text-black shadow-[0_18px_42px_rgba(212,175,55,0.24),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-35">
            <LogIn size={31} />
            {isSubmitting ? pinResetRequired || setupRequired ? 'Saving PIN...' : 'Signing in...' : pinResetRequired ? resetStep === 'confirm' ? 'Save PIN' : 'Continue' : setupRequired ? 'Set PIN' : 'Sign In'}
          </button>
        </div>
      </main>
      <footer className="relative z-0 shrink-0 border-t border-slate-700/55">
        <div className="flex items-center justify-between gap-5 bg-white/[0.025] px-8 py-4 lg:px-10">
          <span className="flex items-center gap-4">
            <i className={`h-6 w-6 rounded-full border-2 ${isOnline ? 'border-emerald-300 bg-emerald-500 shadow-[0_0_20px_rgba(34,197,94,0.42)]' : 'border-red-300 bg-red-500'}`}/>
            <span>
              <strong className="block text-lg font-black">{isOnline ? 'Online' : 'Offline'}</strong>
              <small className="text-xs font-medium text-slate-400">{isOnline ? 'All systems operational' : 'Connection unavailable'}</small>
            </span>
          </span>
          <span className="flex items-center gap-3 rounded-2xl border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-5 py-2.5 text-lg font-black text-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.1)]">
            <Layers size={22}/>
            {environment}
          </span>
        </div>
        <div className="relative flex min-h-14 items-center justify-center gap-3 border-t border-slate-700/40 px-8 py-3 text-sm font-bold text-slate-500 lg:px-10">
          <span className="flex items-center gap-3">
            <ShieldCheck size={20}/>
            <span>Secure staff access</span>
          </span>
          <button type="button" onClick={onLogout} disabled={isSubmitting} className="absolute right-8 flex min-h-10 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-black text-slate-300 transition hover:border-red-400/60 hover:text-red-300 disabled:opacity-40 lg:right-10">
            <LogOut size={17}/>
            Sign out email
          </button>
        </div>
      </footer>
    </section>
  </div>;
}
