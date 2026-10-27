import React, { useState, useEffect, useId } from 'react';
import { Wifi, LogOut, User, UsersRound, ArrowLeftRight, Clock } from 'lucide-react';
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, translate } from '../utils/i18n';
import { env } from '../config/env';

export default function IpadShell({ children, isOnline, onLogout, onLock = onLogout, onSwitchStaff, onChangeTerminal, userEmail, onOpenProfile, terminalContext, staffName, shiftStatus, onCurrentShift, lang = 'en', setLang, enabledLanguages = SUPPORTED_LANGUAGES }) {
  const tr = (key) => translate(lang, key);
  const [time, setTime] = useState('');
  const [sessionActionsOpen, setSessionActionsOpen] = useState(false);
  const sessionActionsId = useId();
  const adminWorkspace = globalThis.location?.pathname === '/admin' || globalThis.location?.hash?.startsWith('#admin/');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="h-dvh w-full overflow-hidden text-slate-900">
      <div className={`pos-workspace ${adminWorkspace ? 'pos-admin-workspace' : ''} flex h-dvh w-full min-h-0 flex-col overflow-hidden bg-[#F5F6F8] text-[#18181B]`}>
        {/* Operational context and session actions */}
        <div className={`pos-workspace-toolbar ${adminWorkspace ? 'admin-context-toolbar' : 'bg-[#18181B]'} text-white px-3 py-2 flex flex-wrap gap-2 items-center justify-between text-xs font-semibold shrink-0 z-40`}>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">{time}</span>
            <span className="rounded border border-white/20 px-2 py-1 text-xs text-slate-300">{env.appEnv}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(onCurrentShift || onLogout) && <button type="button" className="md:hidden rounded-lg border border-white/20" aria-expanded={sessionActionsOpen} aria-controls={sessionActionsId} onClick={() => setSessionActionsOpen((open) => !open)}>Session actions</button>}
            <div id={sessionActionsId} className={`${sessionActionsOpen ? 'flex' : 'hidden'} order-last w-full flex-wrap items-center gap-2 md:order-none md:flex md:w-auto`}>
            {onCurrentShift && <button type="button" title="Current Shift" aria-label="Current Shift" onClick={onCurrentShift} className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-300 hover:bg-white/10 hover:text-white"><Clock size={16}/> Current Shift</button>}
            {onLogout && (userEmail || onChangeTerminal || onSwitchStaff) && (
              <>
                {onOpenProfile && (
                  <>
                    <button
                      onClick={onOpenProfile}
                      className="flex items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors cursor-pointer font-semibold bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full"
                      title={tr('viewProfile')}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>{tr('profile')}</span>
                    </button>
                    <div className="h-3 w-px bg-white/20" />
                  </>
                )}
                {userEmail && <span className="text-[10px] text-gray-400 font-medium truncate max-w-[160px]">{userEmail}</span>}
                {onSwitchStaff && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Switch staff now? Any unsent order changes may be discarded.')) onSwitchStaff();
                    }}
                    className="flex items-center gap-1 rounded-full bg-[#D4AF37]/15 px-2 py-0.5 text-[10px] font-semibold text-[#D4AF37] transition-colors hover:bg-[#D4AF37]/25 hover:text-[#FFF0B3]"
                    title="Switch to another staff account using a PIN"
                  >
                    <UsersRound className="h-3.5 w-3.5" />
                    Switch Staff
                  </button>
                )}
                {onChangeTerminal && (
                  <button
                    type="button"
                    onClick={onChangeTerminal}
                    className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                    title="Use an activation code to change this device terminal"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Change Terminal
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Sign out? Any unsent order changes may be discarded.')) onLogout();
                  }}
                  className="flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-300 transition-colors hover:bg-red-500/20 hover:text-red-100"
                  title={tr('logout')}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {tr('logout')}
                </button>
                <button
                  onClick={onLock}
                  className="flex items-center gap-1 text-[10px] text-[#D4AF37] hover:text-[#FFF0B3] transition-colors cursor-pointer font-semibold bg-white/5 hover:bg-white/10 px-2 py-0.5 rounded-full"
                  title={tr('lockTerminal')}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {tr('lockTerminal')}
                </button>
                <div className="h-3 w-px bg-white/20" />
              </>
            )}
            </div>
            <span role="status" className={`flex items-center gap-2 px-2 ${isOnline ? 'text-emerald-300' : 'text-amber-300'}`}><Wifi size={16}/>{isOnline ? tr('onlineStatus') : tr('offlineStatus')}</span>
            {setLang && <select aria-label="Language" value={lang} onChange={(event) => setLang(event.target.value)} className="min-h-11 rounded-lg border border-white/20 bg-[#18181B] px-2 text-white">{SUPPORTED_LANGUAGES.filter((code) => enabledLanguages.includes(code)).map((code) => <option key={code} value={code}>{LANGUAGE_LABELS[code]}</option>)}</select>}
          </div>
        </div>
        {terminalContext?.terminalId && <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-700"><span className="min-w-0 break-words"><strong>{terminalContext.branchName}</strong> · {terminalContext.terminalName} <span className="font-mono">{terminalContext.terminalCode}</span></span><span className="break-words">{staffName} · {shiftStatus}</span></div>}

        {/* Application workspace */}
        <div className="min-h-0 flex-1 relative overflow-hidden flex flex-col bg-[#F8F9FA]">
          {children}
        </div>


      </div>
    </div>
  );
}
