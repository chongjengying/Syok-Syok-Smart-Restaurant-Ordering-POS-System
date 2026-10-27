import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, Plus, Save, ShieldCheck, UserCheck, UserX, X, XCircle } from 'lucide-react';
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
    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-black text-slate-950">Role Directory</h2><p className="text-xs text-slate-500">Staff counts and permission scope are loaded from the database.</p></div><span className="text-xs font-bold text-slate-500">{state.data.roles.length} roles</span></div>
      <div className="divide-y">{state.data.roles.map((item) => <article key={item.id} className={`grid gap-3 px-5 py-4 transition-colors sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${roleId === item.id ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{item.name}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${item.is_active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{item.is_active === false ? 'Inactive' : 'Active'}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{Number(item.staff_count || 0)} staff</span><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">{Number(item.permission_count || 0)} permissions</span></div><p className="mt-1 truncate text-sm text-slate-500">{item.description || 'No role description configured.'}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => setRoleId(item.id)} className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${roleId === item.id ? 'bg-slate-950 text-white' : 'border border-slate-200 text-slate-700'}`}>{roleId === item.id ? 'Managing' : 'Manage'}<ArrowRight size={14} /></button>{canEdit && item.name !== 'ADMIN' && <button type="button" title={item.is_active === false ? 'Activate role' : 'Deactivate role'} onClick={() => { if (confirm(`${item.is_active === false ? 'Activate' : 'Deactivate'} ${item.name}?`)) void state.setActive(item.id, item.is_active === false); }} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">{item.is_active === false ? <UserCheck size={15} /> : <UserX size={15} />}</button>}</div></article>)}</div>
    </section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Role & Access</p><h2 className="mt-1 text-xl font-black text-slate-950">Assign a role and review access</h2><p className="mt-1 text-sm text-slate-500">Staff inherit these permissions when the role is assigned.</p></div>
        <label className="relative min-w-56 text-xs font-bold uppercase tracking-wide text-slate-500">Role
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} className="mt-1 block w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-3 pr-9 text-sm font-bold normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500">
            {state.data.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select><ChevronDown size={16} className="pointer-events-none absolute bottom-3 right-3 text-slate-500" />
        </label>
      </div>
      {role && <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{role.description || `Permissions from the ${role.name} role`}</p>}
    </section>
    <div className="grid gap-4 xl:grid-cols-2">{Object.entries(groups).map(([module, permissions]) => <article key={module} className="rounded-2xl border bg-white p-5"><h2 className="mb-2 font-black uppercase tracking-wide text-gray-500">{module}</h2>{permissions.map((permission) => { const enabled = selected.includes(permission.code); return <label key={permission.id} className="flex items-start gap-3 border-t py-3 text-sm"><input disabled={!canEdit} type="checkbox" checked={enabled} onChange={(event) => setSelected(event.target.checked ? [...selected, permission.code] : selected.filter((code) => code !== permission.code))} className="mt-0.5 h-4 w-4 accent-amber-500" /><span className="min-w-0"><strong className="flex items-center gap-1.5">{enabled ? <Check size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-slate-300" />}{permission.code}</strong><small className="block text-gray-400">{permission.description}</small></span></label>; })}</article>)}</div>
    {canEdit && <button disabled={state.busy || !role || role.is_active === false} onClick={() => { if (confirm(`Apply permission changes to ${role?.name}?`)) void state.save(roleId, selected); }} className="sticky bottom-3 flex items-center gap-2 rounded-xl bg-[#D4AF37] px-6 py-3 font-black shadow-xl"><Save size={17} />{state.busy ? 'Saving…' : 'Save Permissions'}</button>}
    {showCreate && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"><form onSubmit={submitRole} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-black">Create Role</h2><p className="text-sm text-gray-500">The new role starts without permissions.</p></div><button type="button" onClick={() => setShowCreate(false)} aria-label="Close"><X /></button></div><label className="block text-sm font-bold">Role Name<input autoFocus required maxLength={50} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} placeholder="SUPERVISOR" className="mt-1 w-full rounded-xl border p-3 font-normal" /></label><label className="mt-4 block text-sm font-bold">Description<textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 min-h-24 w-full rounded-xl border p-3 font-normal" /></label><button disabled={state.busy} className="mt-6 w-full rounded-xl bg-[#D4AF37] p-3 font-black disabled:opacity-50">{state.busy ? 'Creating…' : 'Create Role'}</button></form></div>}
  </section>;
}
