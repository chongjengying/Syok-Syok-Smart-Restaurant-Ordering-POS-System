import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Save, ShieldCheck, X } from 'lucide-react';
import { useRolePermissions } from '../../hooks/useRolePermissions';

export default function RolePermissions({ canEdit = false }) {
  const state = useRolePermissions();
  const [roleId, setRoleId] = useState('');
  const [selected, setSelected] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const role = useMemo(() => state.data?.roles?.find((item) => item.id === roleId), [state.data, roleId]);

  useEffect(() => {
    if (!roleId && state.data?.roles?.length) setRoleId(state.data.roles[0].id);
  }, [state.data, roleId]);
  useEffect(() => {
    if (!state.data || !roleId) return;
    const ids = new Set(state.data.assignments.filter((item) => item.role_id === roleId).map((item) => item.permission_id));
    setSelected(state.data.permissions.filter((permission) => ids.has(permission.id)).map((permission) => permission.code));
  }, [state.data, roleId]);

  if (state.isLoading) return <p>Loading permissions…</p>;
  if (state.error && !state.data) return <p className="rounded-xl bg-red-50 p-3 text-red-700">{state.error}</p>;
  const groups = state.data.permissions.reduce((result, permission) => {
    (result[permission.module] ||= []).push(permission);
    return result;
  }, {});
  const submitRole = async (event) => {
    event.preventDefault();
    const created = await state.add(form.name, form.description);
    if (!created) return;
    setShowCreate(false);
    setForm({ name: '', description: '' });
    if (created.id) setRoleId(created.id);
  };

  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-black"><ShieldCheck className="text-[#B08D20]" />Roles & Permissions</h1><p className="text-sm text-gray-500">Database-enforced permission assignments.</p></div>
      {canEdit && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 font-black"><Plus size={17} />New Role</button>}
    </div>
    {state.error && <p className="rounded-xl bg-red-50 p-3 text-red-700">{state.error}</p>}
    {state.notice && <p className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{state.notice}</p>}
    <div className="flex flex-wrap gap-2">{state.data.roles.map((item) => <button key={item.id} onClick={() => setRoleId(item.id)} className={`rounded-xl px-4 py-2 font-bold ${roleId === item.id ? 'bg-[#121212] text-[#D4AF37]' : 'bg-white'}`}>{item.name}</button>)}</div>
    <div className="grid gap-4 xl:grid-cols-2">{Object.entries(groups).map(([module, permissions]) => <article key={module} className="rounded-2xl bg-white p-5"><h2 className="mb-3 font-black uppercase text-gray-500">{module}</h2>{permissions.map((permission) => <label key={permission.id} className="flex gap-3 border-t py-3 text-sm"><input disabled={!canEdit} type="checkbox" checked={selected.includes(permission.code)} onChange={(event) => setSelected(event.target.checked ? [...selected, permission.code] : selected.filter((code) => code !== permission.code))} /><span><strong>{permission.code}</strong><small className="block text-gray-400">{permission.description}</small></span></label>)}</article>)}</div>
    {canEdit && <button disabled={state.busy || !role} onClick={() => { if (confirm(`Apply permission changes to ${role?.name}?`)) void state.save(roleId, selected); }} className="sticky bottom-3 flex items-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3 font-black shadow-xl"><Save size={17} />{state.busy ? 'Saving…' : 'Save Permissions'}</button>}
    {showCreate && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"><form onSubmit={submitRole} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black">Create Role</h2><p className="text-sm text-gray-500">The new role starts without permissions.</p></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Close"><X /></button></div><label className="block text-sm font-bold">Role Name<input autoFocus required maxLength={50} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="SUPERVISOR" className="mt-1 w-full rounded-xl border p-3 font-normal" /></label><label className="mt-4 block text-sm font-bold">Description<textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3 font-normal" /></label><button disabled={state.busy} className="mt-6 w-full rounded-xl bg-[#D4AF37] p-3 font-black disabled:opacity-50">{state.busy ? 'Creating…' : 'Create Role'}</button></form></div>}
  </section>;
}
