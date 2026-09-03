import { useCallback, useEffect, useRef, useState } from 'react';
import { getValidatedSession, onAuthStateChange, signOut } from '../features/auth/authService';

const INACTIVITY_LIMIT_MS = 3 * 60 * 1000;

export function useAuthSession() {
  const signOutReason = useRef('');
  const suppressSignOutNotice = useRef(false);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
  );

  useEffect(() => {
    let active = true;
    let validationTimer;

    getValidatedSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data?.session || null);
      setError(sessionError);
      if (sessionError) setNotice(sessionError.message);
      setIsLoading(false);
    });

    const unsubscribe = onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT' || !nextSession) {
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
      setIsLoading(true);
      window.clearTimeout(validationTimer);
      validationTimer = window.setTimeout(async () => {
        const validated = await getValidatedSession();
        if (!active) return;
        setSession(validated.data?.session || null);
        setError(validated.error);
        if (validated.error) setNotice(validated.error.message);
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
    const lock = () => setIsLocked(true);
    const reset = () => {
      if (isLocked) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, INACTIVITY_LIMIT_MS);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [session, isLocked]);

  useEffect(() => {
    if (!session) return undefined;
    let checking = false;
    const validate = async () => {
      if (checking || !navigator.onLine) return;
      checking = true;
      const result = await getValidatedSession();
      checking = false;
      if (result.error || !result.data?.session) {
        setSession(null);
        setError(result.error);
        setNotice(result.error?.message || 'Your staff session is no longer available. Sign in again.');
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void validate(); };
    const interval = window.setInterval(validate, 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session]);

  const refreshSession = useCallback(async () => {
    const result = await getValidatedSession();
    setSession(result.data?.session || null);
    setError(result.error);
    if (result.error) setNotice(result.error.message);
    return result;
  }, []);

  const signOutSession = useCallback(async () => {
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
    lockTerminal: () => setIsLocked(true),
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
