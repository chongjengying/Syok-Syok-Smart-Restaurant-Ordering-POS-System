import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMyPermissions } from '../services/admin-permission.service';

export function usePermissions(enabled = true) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const request = ++generation.current;
    setIsLoading(true);
    const result = await getMyPermissions();
    if (request !== generation.current) return;
    setPermissions(result.data || []); setError(result.error?.message || ''); setIsLoading(false);
  }, [enabled]);
  useEffect(() => {
    setPermissions([]);
    if (enabled) void refresh(); else setIsLoading(false);
    const invalidate = () => { ++generation.current; };
    return invalidate;
  }, [enabled, refresh]);
  useEffect(() => { const listener = () => void refresh(); globalThis.addEventListener?.('pos-permissions-changed', listener); return () => globalThis.removeEventListener?.('pos-permissions-changed', listener); }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = globalThis.setInterval(visibleRefresh, 30000);
    globalThis.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => {
      globalThis.clearInterval(timer);
      globalThis.removeEventListener('focus', visibleRefresh);
      document.removeEventListener('visibilitychange', visibleRefresh);
    };
  }, [enabled, refresh]);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  return { permissions, hasPermission: (code: string) => permissionSet.has(code), isLoading, error, refresh };
}
