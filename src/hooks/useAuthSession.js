import { supabase, isOperatorMode } from '../infrastructure/supabase/client';
import { lockOperatorSession } from '../services/terminal-context.service';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getValidatedSession, onAuthStateChange, signOut } from '../features/auth/authService';

const INACTIVITY_LIMIT_MS = 3 * 60 * 1000;
const isTransientValidationError = (error) => error?.code === 'CONNECTION_FAILED' || Number(error?.status || 0) >= 500;

export function useAuthSession() {
  const signOutReason = useRef('');
  const suppressSignOutNotice = useRef(false);
  const validationSequence = useRef(0);
  const validatedIdentity = useRef('');
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState(INACTIVITY_LIMIT_MS);
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!session || !isOperatorMode()) return;
      const { data } = await supabase.rpc('get_pos_display_settings');
      if (active && data) setIdleTimeout(data.pos?.autoLockEnabled === false ? 0 : Math.max(1, Math.min(120, Number(data.pos?.idleTimeoutMinutes || 3))) * 60000);
    };
    void load(); window.addEventListener('pos-settings-updated', load);
    return () => { active = false; window.removeEventListener('pos-settings-updated', load); };
  }, [session]);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
  );

  useEffect(() => {
    let active = true;
    let validationTimer;

    const requestId = ++validationSequence.current;
    getValidatedSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (requestId !== validationSequence.current) return;
      validatedIdentity.current = data?.session?.user?.id || '';
      setSession(data?.session || null);
      setError(sessionError);
      if (sessionError) setNotice(sessionError.message);
      else setNotice('');
      setIsLoading(false);
    });

    const unsubscribe = onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT' || !nextSession) {
        ++validationSequence.current;
        window.clearTimeout(validationTimer);
        validatedIdentity.current = '';
        setSession(null);
        setError(null);
        setIsLoading(false);
        if (event === 'SIGNED_OUT' && !suppressSignOutNotice.current) {
          setNotice(signOutReason.current || 'Your session expired or ended. Sign in again to continue.');
        }
        signOutReason.current = '';
        suppressSignOutNotice.current = false;
        return;
      }
      // Revalidate metadata/token updates without unmounting the active form.
      // A new identity still waits for full session validation before rendering.
      const sameValidatedIdentity = validatedIdentity.current === nextSession.user?.id;
      if (!sameValidatedIdentity || !['USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) setIsLoading(true);
      window.clearTimeout(validationTimer);
      const requestId = ++validationSequence.current;
      validationTimer = window.setTimeout(async () => {
        const validated = await getValidatedSession();
        if (!active) return;
        if (requestId !== validationSequence.current) return;
        if (validated.error && isTransientValidationError(validated.error) && sameValidatedIdentity) {
          setSession(nextSession);
          setError(validated.error);
          setNotice('Connection interrupted. Your session is being kept active and will be checked again.');
          setIsLoading(false);
          return;
        }
        validatedIdentity.current = validated.data?.session?.user?.id || '';
        setSession(validated.data?.session || null);
        setError(validated.error);
        if (validated.error) setNotice(validated.error.message);
        else setNotice('');
        setIsLoading(false);
      }, 0);
    });

    return () => {
      active = false;
      window.clearTimeout(validationTimer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    let timer;
    const lock = () => { if (isOperatorMode()) { setIsLocked(true); void lockOperatorSession(); } };
    const reset = () => {
      if (isLocked) return;
      window.clearTimeout(timer);
      if (idleTimeout) timer = window.setTimeout(lock, idleTimeout);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [session, isLocked, idleTimeout]);

  useEffect(() => {
    if (!session) return undefined;
    let checking = false;
    const validate = async () => {
      if (checking || !navigator.onLine) return;
      checking = true;
      const requestId = ++validationSequence.current;
      const result = await getValidatedSession();
      checking = false;
      if (requestId !== validationSequence.current) return;
      if (result.error && isTransientValidationError(result.error)) {
        setError(result.error);
        setNotice('Connection interrupted. Your session is being kept active and will be checked again.');
        return;
      }
      if (result.error || !result.data?.session) {
        validatedIdentity.current = '';
        setSession(null);
        setError(result.error);
        setNotice(result.error?.message || 'Your staff session is no longer available. Sign in again.');
      } else {
        validatedIdentity.current = result.data.session.user.id;
        setError(null);
        setNotice('');
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void validate(); };
    const interval = window.setInterval(validate, isOperatorMode() ? 10_000 : 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session]);

  const refreshSession = useCallback(async () => {
    const requestId = ++validationSequence.current;
    const result = await getValidatedSession();
    if (requestId !== validationSequence.current) return result;
    validatedIdentity.current = result.data?.session?.user?.id || '';
    setSession(result.data?.session || null);
    setError(result.error);
    if (result.error) setNotice(result.error.message);
    else setNotice('');
    setIsLoading(false);
    return result;
  }, []);

  const signOutSession = useCallback(async () => {
    validationSequence.current += 1;
    signOutReason.current = '';
    suppressSignOutNotice.current = true;
    setNotice('');
    const result = await signOut();
    if (result.error) setError(result.error);
    return result;
  }, []);

  return {
    session,
    isLocked,
    lockTerminal: () => { if (isOperatorMode()) { setIsLocked(true); void lockOperatorSession(); } },
    unlockTerminal: () => setIsLocked(false),
    isLoading,
    error,
    notice,
    clearNotice: () => setNotice(''),
    refreshSession,
    signOut: signOutSession,
    isPasswordRecovery,
    finishPasswordRecovery: () => setIsPasswordRecovery(false),
  };
}
