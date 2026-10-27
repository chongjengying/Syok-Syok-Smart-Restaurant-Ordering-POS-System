import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2, ShieldCheck } from 'lucide-react';
import { activateTerminalWithCode } from '../services/organization.service';
import { clearDeviceCredential, getDeviceIdentifier, storeDeviceCredential } from '../services/terminal-context.service';

export default function TerminalSetupScreen({ onActivated, onResume }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [validationStep, setValidationStep] = useState(0);
  const [error, setError] = useState('');
  const [activated, setActivated] = useState(null);
  const [continuing, setContinuing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const resumeAttempted = useRef(false);
  const activationErrorMessage = (error) => {
    const message = String(error?.message || error || '');
    if (message.includes('INVALID_ACTIVATION_REQUEST')) return 'Enter a valid six-digit activation code and try again.';
    if (message.includes('ACTIVATION_RATE_LIMITED')) return 'Too many activation attempts. Wait a minute and try again.';
    if (message.includes('ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED')) return 'An administrator must reconcile the open shift before activating this device.';
    if (message.includes('ACTIVATION_CODE_ALREADY_USED')) return 'This activation code has already been used. Ask an administrator to generate a new code.';
    if (message.includes('INVALID_ACTIVATION_CODE')) return 'This activation code is invalid or expired. Ask an administrator to generate a new code.';
    if (message.includes('TERMINAL_NOT_PENDING')) return 'This terminal is no longer waiting for activation. Ask an administrator to generate a new code.';
    if (message.includes('TERMINAL_ALREADY_BOUND') || message.includes('ALREADY_BOUND')) return 'This terminal is already bound to another device. Ask an administrator to revoke it before activating a new device.';
    if (message.includes('COMPANY_OR_OUTLET_INACTIVE')) return 'This terminal’s company or outlet is inactive. Ask an administrator to activate it first.';
    if (message.includes('COMPANY_INACTIVE')) return 'This company is inactive. Ask an administrator to activate the company first.';
    if (message.includes('BRANCH_INACTIVE')) return 'This branch is inactive. Ask an administrator to activate the branch first.';
    if (message.includes('TERMINAL_RETIRED')) return 'This terminal is retired. Ask an administrator to create or reopen a terminal.';
    return 'The terminal could not be activated. Check the code or ask an administrator to generate a new one.';
  };
  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (code.length !== 6) { setError('Enter the 6-digit activation code.'); return; }
    setBusy(true);
    setValidationStep(1);
    window.setTimeout(() => setValidationStep(2), 250);
    window.setTimeout(() => setValidationStep(3), 500);
    window.setTimeout(() => setValidationStep(4), 750);
    const result = await activateTerminalWithCode(code, getDeviceIdentifier());
    setBusy(false);
    if (result.error || result.data?.ok !== true) {
      setValidationStep(0);
      setError(activationErrorMessage(result.error || new Error(result.data?.code || 'INVALID_ACTIVATION_CODE')));
      return;
    }
    setValidationStep(6);
    storeDeviceCredential(result.data.terminalCredential);
    globalThis.localStorage?.setItem('pos.terminal.credential.v1', result.data?.terminalId || 'bound');
    setActivated(result.data || {});
  };
  const continueToStaffLogin = async () => {
    if (!activated || continuing || !onActivated) return;
    setContinuing(true);
    setError('');
    try {
      const result = await onActivated(activated);
      if (result?.error) {
        setError('The device was activated, but staff sign-in could not start. Check the connection and try again.');
      }
    } catch {
      setError('The device was activated, but staff sign-in could not start. Check the connection and try again.');
    } finally {
      setContinuing(false);
    }
  };
  useEffect(() => {
    if (activated || !onResume || resumeAttempted.current || !globalThis.localStorage?.getItem('pos.terminal.credential.v1')) return undefined;
    resumeAttempted.current = true;
    let active = true;
    setResuming(true);
    const timeout = new Promise((resolve) => window.setTimeout(() => resolve({ error: new Error('Terminal restore timed out. Check the connection and try again.') }), 10000));
    Promise.race([Promise.resolve().then(() => onResume()), timeout]).then((result) => {
      if (!active) return;
      if (result?.error || result?.data?.ok === false) {
        const message = String(result.error?.message || result.data?.code || result.error || 'Terminal registration is unavailable.');
        setError(message.includes('timed out') ? message : 'This device registration could not be restored. Activate the terminal again or check the connection.');
        if (!message.includes('timed out')) {
          clearDeviceCredential();
        }
      }
    }).catch(() => {
      if (active) setError('This device registration could not be restored. Activate the terminal again or check the connection.');
    }).finally(() => {
      if (active) setResuming(false);
    });
    return () => { active = false; };
  }, [activated, onResume]);
  if (activated) {
    const company = activated.company || {};
    const outlet = activated.outlet || {};
    const terminal = activated.terminal || {};
    return (
      <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#f4f6f8] p-5 text-slate-950 sm:p-8">
        <section className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Terminal setup</p>
                <h1 className="mt-2 text-2xl font-black sm:text-3xl">{terminal.code || activated.terminalCode || 'POS terminal'}</h1>
                <p className="mt-1 text-sm text-slate-300">{terminal.name || activated.terminalName || 'Registered POS device'}</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1.5 text-xs font-black text-emerald-300">
                <i className="h-2 w-2 rounded-full bg-emerald-300" /> ACTIVE
              </span>
            </div>
          </header>
          <main className="space-y-6 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Company</p>
                <p className="mt-1 font-bold">{company.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Branch</p>
                <p className="mt-1 font-bold">{outlet.code || outlet.name || '—'}</p>
                {outlet.code && <p className="text-sm text-slate-500">{outlet.name || 'Branch'}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <Check size={20} strokeWidth={3} />
              <div><p className="font-black">Device activated</p><p>{activated.registrationStatus || 'REGISTERED'} · This device is linked to this terminal.</p></div>
            </div>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
            <button type="button" onClick={continueToStaffLogin} disabled={continuing} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-black text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
              {continuing ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
              {continuing ? 'Opening staff sign in…' : 'Continue to staff sign in'}
            </button>
            <p className="text-center text-xs text-slate-500">Staff sign in will load the employee access permitted for this branch and terminal.</p>
          </main>
        </section>
      </div>
    );
  }
  const checks = ['Activation code exists', 'Not expired', 'Not already used', 'Terminal still pending', 'Company and outlet active'];
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#f4f6f8] p-5 text-slate-950 sm:p-8">
      <form onSubmit={submit} className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
        {busy && <div className="absolute inset-0 z-10 flex flex-col justify-center bg-white/95 p-8" role="status" aria-live="polite"><p className="text-center text-2xl font-black">Checking terminal</p><Loader2 size={36} className="mx-auto my-6 animate-spin text-amber-500"/><div className="space-y-3">{checks.map((check, index) => <div key={check} className={`flex items-center gap-3 text-sm font-bold ${validationStep > index ? 'text-emerald-700' : 'text-slate-400'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full border ${validationStep > index ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>{validationStep > index ? '✓' : index + 1}</span>{check}</div>)}</div></div>}
        <header className="border-b border-slate-200 bg-slate-950 px-6 py-6 text-white sm:px-8"><p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">POS terminal setup</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Welcome to POS</h1><p className="mt-1 text-sm text-slate-300">Register this device before staff sign in.</p></header>
        <main className="space-y-6 p-6 sm:p-8"><div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck size={22} className="shrink-0 text-amber-600"/><div><p className="font-black">{resuming ? 'Restoring registered terminal' : 'Device not activated'}</p><p>{resuming ? 'Checking this device’s existing terminal registration…' : 'Use the one-time code generated by your administrator.'}</p></div></div><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Activation code</p><input autoFocus required inputMode="numeric" maxLength={6} value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} className="mt-2 h-16 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 text-center font-mono text-2xl tracking-[0.55em] outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" placeholder="_ _ _  _ _ _" aria-label="6-digit activation code"/></div>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}<button disabled={busy || resuming || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{(busy || resuming) && <Loader2 size={18} className="animate-spin"/>}{resuming ? 'Restoring…' : busy ? 'Checking…' : 'Activate terminal'}</button><div className="flex items-center justify-between border-t border-slate-200 pt-5 text-xs font-bold text-slate-500"><span>Device status</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{resuming ? 'Checking registration' : 'Not activated'}</span></div></main>
      </form>
    </div>
  );
}
