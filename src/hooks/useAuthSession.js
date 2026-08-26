import { useCallback, useEffect, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../features/auth/authService';

export function useAuthSession() {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type') === 'recovery'
  );

  useEffect(() => {
    let active = true;

    getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session);
      setError(sessionError);
      setIsLoading(false);
    });

    const unsubscribe = onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setError(null);
      setIsLoading(false);
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signOutSession = useCallback(async () => {
    const result = await signOut();
    if (result.error) setError(result.error);
    return result;
  }, []);

  return {
    session,
    isLoading,
    error,
    signOut: signOutSession,
    isPasswordRecovery,
    finishPasswordRecovery: () => setIsPasswordRecovery(false),
  };
}
