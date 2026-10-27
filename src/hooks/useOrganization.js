import { useCallback, useEffect, useRef, useState } from 'react';
import { listBranches, listCompanies, saveOrganization } from '../services/organization.service';
export function useOrganization(mode) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await (mode === 'company' ? listCompanies() : listBranches());
      if (request !== generation.current) return;
      if (result.error) throw result.error;
      setRows(result.data || []);
    } catch (e) { if (request === generation.current) setError(e.message); }
    finally { if (request === generation.current) setLoading(false); }
  }, [mode]);
  useEffect(() => { const requests = generation; void load(); return () => { requests.current++; }; }, [load]);
  const save = async (form) => {
    if (saving) return false;
    setSaving(true); setError(''); setMessage('');
    try {
      const result = await saveOrganization(mode, form);
      if (result.error) throw result.error;
      await load();
      const isCreate = !form?.id;
      const message = mode === 'company'
        ? `${isCreate ? 'Company created' : 'Company updated'} successfully.`
        : `${isCreate ? 'Branch created' : 'Branch updated'} successfully.`;
      setMessage(message);
      globalThis.dispatchEvent?.(new CustomEvent('admin-toast', { detail: { message } }));
      return true;
    } catch (e) {
      const message = e?.message || 'Unable to save changes.';
      setError(message);
      globalThis.dispatchEvent?.(new CustomEvent('admin-toast', {
        detail: { message, tone: 'error' },
      }));
      return false;
    }
    finally { setSaving(false); }
  };
  return { rows, loading, saving, error, message, load, save };
}
