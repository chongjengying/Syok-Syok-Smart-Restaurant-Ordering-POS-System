import { useCallback, useEffect, useState } from 'react';
import { createRole, getRolePermissionMatrix, saveRolePermissions, setRoleActive } from '../services/admin-permission.service';

export function useRolePermissions() {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    setIsLoading(true);
    const result = await getRolePermissionMatrix();
    setData(result.data);
    setError(result.error?.message || '');
    setIsLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (id: string, codes: string[]) => {
    setBusy(true); setError(''); setNotice('');
    const result = await saveRolePermissions(id, codes);
    setBusy(false);
    if (result.error) { setError(result.error.message); return false; }
    setNotice('Permissions updated.');
    globalThis.dispatchEvent?.(new Event('pos-permissions-changed'));
    await refresh();
    return true;
  };
  const add = async (name: string, description: string) => {
    setBusy(true); setError(''); setNotice('');
    const result = await createRole(name, description);
    setBusy(false);
    if (result.error) { setError(result.error.message); return null; }
    setNotice('Role created. Assign permissions before using it.');
    await refresh();
    return result.data;
  };
  const setActive = async (id: string, active: boolean) => {
    setBusy(true); setError(''); setNotice('');
    const result = await setRoleActive(id, active);
    setBusy(false);
    if (result.error) { setError(result.error.message); return false; }
    setNotice(active ? 'Role activated.' : 'Role deactivated.');
    globalThis.dispatchEvent?.(new Event('pos-permissions-changed'));
    await refresh();
    return true;
  };
  return { data, isLoading, busy, error, notice, save, add, setActive };
}
