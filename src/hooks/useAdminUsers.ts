import { useCallback, useEffect, useRef, useState } from 'react';
import { createStaffInvitation, editStaffAccount, getAdminUsers, requestStaffPasswordReset, requestStaffPinSetup } from '../services/admin-user.service';

export function useAdminUsers() {
  const [users,setUsers] = useState<Record<string,unknown>[]>([]);
  const [search,setSearch] = useState('');
  const [isLoading,setIsLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const requestId = useRef(0);
  const submitting = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const result = await getAdminUsers(search);
      if (id !== requestId.current) return;
      const payload = result.data as {users?:Record<string,unknown>[]} | null;
      setUsers(payload?.users || []);
      setError(result.error?.message || '');
    } catch (cause) {
      if (id === requestId.current) { setUsers([]); setError(cause instanceof Error ? cause.message : 'Unable to load staff.'); }
    } finally { if (id === requestId.current) setIsLoading(false); }
  }, [search]);
  const invalidateRequests = useCallback(() => { requestId.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(),250);
    return () => { clearTimeout(timer); invalidateRequests(); };
  }, [refresh,invalidateRequests]);
  useEffect(() => {
    const update = () => void refresh();
    globalThis.addEventListener?.('admin-staff-updated',update);
    globalThis.addEventListener?.('focus',update);
    return () => { globalThis.removeEventListener?.('admin-staff-updated',update); globalThis.removeEventListener?.('focus',update); };
  }, [refresh]);
  const explain = (value:string) => value.includes('LAST_ACTIVE_ADMIN_REQUIRED') ? 'You cannot deactivate the last active administrator.' : value.includes('INSUFFICIENT_ROLE_ASSIGNMENT_PERMISSION') ? 'You do not have permission to change this staff role.' : value;
  const run = async (operation:()=>Promise<{data?:unknown;error?:Error|null}>,message:string) => {
    if (submitting.current) return null;
    submitting.current=true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await operation();
      if (result.error) throw result.error;
      setNotice(message);
      globalThis.dispatchEvent?.(new CustomEvent('admin-toast',{detail:{message}}));
      await refresh();
      return result.data || {};
    } catch (cause) {
      const message = explain(cause instanceof Error ? cause.message : String((cause as {message?:string})?.message || 'Unable to update staff.'));
      setError(message);
      globalThis.dispatchEvent?.(new CustomEvent('admin-toast',{detail:{message,tone:'error'}}));
      return null;
    } finally { submitting.current=false; setBusy(false); }
  };
  const requirePinSetup = async (id:string) => {
    const result = await run(() => requestStaffPinSetup(id),'Staff PIN reset. The temporary PIN is shown in the confirmation dialog.');
    return {ok:result!==null,temporaryPin:(result as {temporaryPin?:string}|null)?.temporaryPin || ''};
  };
  return {users,search,setSearch,isLoading,busy,error,notice,refresh,
    invite:(input:Record<string,unknown>) => run(() => createStaffInvitation(input),'Staff created. Any temporary PIN is shown in the confirmation dialog.'),
    edit:async(input:Record<string,unknown>) => {
      const result = await run(() => editStaffAccount(input),input.active===false ? 'Staff deactivated successfully.' : 'Staff updated successfully.');
      if (result) globalThis.dispatchEvent?.(new CustomEvent('admin-staff-updated',{detail:{staffId:input.userId}}));
      return result;
    },
    reset:(id:string) => run(() => requestStaffPasswordReset(id),'Password reset instructions sent.'),
    requirePinSetup,
  };
}
