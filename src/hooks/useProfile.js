import { useCallback, useEffect, useState } from 'react';
import { getProfile } from '../features/auth/authService';

export function useProfile(enabled = true) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(enabled));
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getProfile();
    if (result.error) {
      setProfile(null);
      setError(result.error.message || 'Unable to load staff profile.');
    } else {
      setProfile(result.data);
      setError('');
    }
    setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setProfile(null);
      setError('');
      setIsLoading(false);
      return;
    }
    refetch();
  }, [enabled, refetch]);

  return { profile, isLoading, error, refetch };
}
