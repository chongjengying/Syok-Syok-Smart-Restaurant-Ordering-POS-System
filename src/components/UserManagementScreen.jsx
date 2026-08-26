import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import { listStaffProfiles, updateStaffAccess } from '../features/auth/authService';
import { translate } from '../utils/i18n';

const ROLES = ['ADMIN', 'MANAGER', 'WAITER', 'CASHIER', 'KITCHEN'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'];

export default function UserManagementScreen({ currentUserId, onBack, lang = 'en' }) {
  const tr = (key) => translate(lang, key);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: loadError } = await listStaffProfiles();
    if (loadError) setError(loadError.message || translate(lang, 'staffLoadFailed'));
    else setStaff(data || []);
    setLoading(false);
  }, [lang]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const changeDraft = (id, field, value) => {
    setStaff((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setNotice('');
  };

  const save = async (account) => {
    setSavingId(account.id);
    setError('');
    setNotice('');
    const { data, error: saveError } = await updateStaffAccess(account.id, account.role_name, account.status);
    if (saveError) setError(saveError.message || tr('staffSaveFailed'));
    else {
      setStaff((rows) => rows.map((row) => row.id === data.id ? data : row));
      setNotice(tr('staffAccessSaved'));
    }
    setSavingId(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#121212] p-6 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="rounded-xl border border-white/15 p-3 hover:border-[#D4AF37]" aria-label={tr('back')}><ArrowLeft className="h-5 w-5" /></button>
            <div><h1 className="text-2xl font-black">{tr('staffAccounts')}</h1><p className="text-sm text-gray-400">{tr('staffAccountsHelp')}</p></div>
          </div>
          <button onClick={loadStaff} disabled={loading} className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold hover:border-[#D4AF37]"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{tr('refresh')}</button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}
        {notice && <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-300">{notice}</div>}

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {loading ? <div className="p-10 text-center text-gray-400">{tr('loading')}</div> : staff.length === 0 ? <div className="p-10 text-center text-gray-400">{tr('noStaffAccounts')}</div> : (
            <div className="divide-y divide-white/10">
              {staff.map((account) => {
                const isSelf = account.id === currentUserId;
                return <div key={account.id} className="grid gap-4 p-4 md:grid-cols-[1fr_170px_170px_110px] md:items-center">
                  <div className="min-w-0"><div className="flex items-center gap-2 font-bold"><Users className="h-4 w-4 text-[#D4AF37]" />{account.name || account.username || tr('unnamedStaff')}{isSelf && <span className="rounded bg-[#D4AF37]/20 px-2 py-0.5 text-[10px] text-[#D4AF37]">{tr('you')}</span>}</div><div className="truncate text-xs text-gray-400">{account.email}</div></div>
                  <select value={account.role_name} disabled={isSelf} onChange={(event) => changeDraft(account.id, 'role_name', event.target.value)} className="rounded-xl border border-white/15 bg-[#1c1c1c] px-3 py-3 text-sm disabled:opacity-50">{ROLES.map((role) => <option key={role}>{role}</option>)}</select>
                  <select value={account.status} disabled={isSelf} onChange={(event) => changeDraft(account.id, 'status', event.target.value)} className="rounded-xl border border-white/15 bg-[#1c1c1c] px-3 py-3 text-sm disabled:opacity-50">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
                  <button onClick={() => save(account)} disabled={isSelf || savingId === account.id} className="flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-3 py-3 text-sm font-black text-black disabled:opacity-40"><Save className="h-4 w-4" />{savingId === account.id ? tr('saving') : tr('save')}</button>
                </div>;
              })}
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-500"><ShieldCheck className="h-4 w-4" />{tr('adminStaffSecurityNotice')}</div>
      </div>
    </div>
  );
}
