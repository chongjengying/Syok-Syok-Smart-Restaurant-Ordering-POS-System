import { useCallback, useEffect, useState } from 'react';
import { checkAuthConnection } from '../features/auth/authService';

export function useAuthConnection() {
  const [status, setStatus] = useState(() => navigator.onLine ? 'CHECKING' : 'OFFLINE');

  const refresh = useCallback(async (signal) => {
    const result = await checkAuthConnection(signal);
    if (!signal?.aborted) setStatus(result.data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const update = () => void refresh(controller.signal);
    update();
    const interval = window.setInterval(update, 30_000);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [refresh]);

  return { status, refresh };
}
