import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMyPermissions } from '../services/admin-permission.service';

export function usePermissions(enabled = true) {
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    const result = await getMyPermissions();
    setPermissions(result.data || []); setError(result.error?.message || ''); setIsLoading(false);
  }, [enabled]);
  useEffect(() => { if (enabled) void refresh(); else { setPermissions([]); setIsLoading(false); } }, [enabled, refresh]);
  useEffect(() => { const listener = () => void refresh(); globalThis.addEventListener?.('pos-permissions-changed', listener); return () => globalThis.removeEventListener?.('pos-permissions-changed', listener); }, [refresh]);
  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  return { permissions, hasPermission: (code: string) => permissionSet.has(code), isLoading, error, refresh };
}
