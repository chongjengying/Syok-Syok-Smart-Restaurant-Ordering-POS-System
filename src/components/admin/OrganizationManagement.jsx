import { useEffect, useState } from 'react';
import { useOrganization } from '../../hooks/useOrganization';
import BranchManagement from './BranchManagement';
const empty = { code: '', name: '', registration_no: '', phone: '', email: '', address: '', currency_code: '', timezone: '', status: 'INACTIVE' };
const fields = [['code','Code'],['name','Name'],['registration_no','Business registration no.'],['phone','Phone'],['email','Email'],['address','Address'],['currency_code','Currency'],['timezone','Timezone']];
export default function OrganizationManagement({ mode = 'company', permissions = [] }) {
  const state = useOrganization(mode);
  const [form, setForm] = useState(null);
  const [selected, setSelected] = useState(null);
  const canEdit = permissions.includes(mode === 'company' ? 'company.update' : 'branch.update');
  useEffect(() => { setForm(null); setSelected(null); }, [mode]);
  useEffect(() => { if (mode === 'company' && state.rows[0]) setForm(state.rows[0]); }, [mode, state.rows]);
  if (selected) return <BranchManagement branchId={selected} permissions={permissions} onBack={() => { setSelected(null); void state.load(); }} />;
  const save = async (event) => { event.preventDefault(); if (await state.save(form)) { if (mode === 'branch') setForm(null); } };
  return <section className="space-y-6">
    <header className="rounded-3xl bg-[#171717] p-7 text-white"><p className="text-xs font-bold uppercase tracking-widest text-[#D4AF37]">Organization</p><h1 className="mt-2 text-3xl font-black">{mode === 'company' ? 'Company' : 'Branches'}</h1><p className="mt-2 text-sm text-slate-300">{mode === 'company' ? 'Business identity and defaults inherited by your branches.' : 'Manage each restaurant’s people, terminals and operating settings.'}</p></header>
    {state.error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{state.error}<button onClick={state.load} className="ml-4 underline">Retry</button></div>}
    {state.message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">{state.message}</p>}
    {state.loading && <p role="status">Loading organization…</p>}
    {mode === 'branch' && !form && permissions.includes('branch.create') && <button className="rounded-xl bg-[#D4AF37] px-5 py-3 font-bold" onClick={() => setForm({ ...empty })}>Create branch</button>}
    {form && <form onSubmit={save} className="space-y-5 rounded-2xl border bg-white p-6">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{mode === 'company' ? form.name : form.id ? 'Edit branch' : 'New branch'}</h2><span className="text-xs font-bold text-slate-500">{form.status}</span></div>
      <fieldset disabled={state.saving || (form.id && !canEdit)} className="grid gap-4 md:grid-cols-2">
        {fields.map(([key,label]) => <label key={key} className="text-sm font-semibold">{label}<input className="mt-1 block w-full rounded-xl border p-3 font-normal" required={['code','name'].includes(key) || mode === 'company' && ['currency_code','timezone'].includes(key)} type={key === 'email' ? 'email' : 'text'} value={form[key] || ''} placeholder={mode === 'branch' && ['currency_code','timezone'].includes(key) ? 'Inherit company default' : ''} maxLength={key === 'code' ? 30 : key === 'name' ? 150 : 500} onChange={e => setForm({ ...form, [key]: ['code','currency_code'].includes(key) ? e.target.value.toUpperCase() : e.target.value })} /></label>)}
        {mode === 'branch' && (!form.id || permissions.includes('branch.deactivate')) && <label className="text-sm font-semibold">Status<select className="mt-1 block w-full rounded-xl border p-3" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option>INACTIVE</option><option>ACTIVE</option></select></label>}
      </fieldset>
      {form.created_at && <p className="text-xs text-slate-500">Created {new Date(form.created_at).toLocaleString()} · Updated {new Date(form.updated_at || form.created_at).toLocaleString()}</p>}
      {(canEdit || !form.id && permissions.includes('branch.create')) && <button disabled={state.saving} className="rounded-xl bg-[#D4AF37] px-5 py-3 font-bold disabled:opacity-50">{state.saving ? 'Saving…' : 'Save changes'}</button>}
      {mode === 'branch' && <button type="button" onClick={() => setForm(null)} className="ml-3 rounded-xl border px-5 py-3">Cancel</button>}
    </form>}
    {mode === 'branch' && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.rows.map(row => <article key={row.id} className="rounded-2xl border bg-white p-5"><div className="flex justify-between"><span className="font-bold">{row.code}</span><span className={`rounded-full px-2 py-1 text-xs ${row.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{row.status}</span></div><h2 className="mt-3 text-xl font-bold">{row.name}</h2><p className="mt-1 text-sm text-slate-500">{row.companies?.name}</p><p className="mt-3 text-sm">{row.address || 'Address not configured'}</p><p className="mt-2 text-xs text-slate-500">{row.currency_code || row.companies?.currency_code} · {row.timezone || row.companies?.timezone}</p><div className="mt-5 flex gap-3"><button className="flex-1 rounded-xl bg-[#171717] p-3 font-bold text-white" onClick={() => setSelected(row.id)}>Manage branch</button>{canEdit && <button className="rounded-xl border px-4" onClick={() => setForm(row)}>Edit</button>}</div></article>)}</div>}
    {!state.loading && !state.rows.length && <p className="rounded-xl border bg-white p-8 text-center text-slate-500">{mode === 'company' ? 'Company setup is unavailable. Apply the organization foundation migration.' : 'No branches available.'}</p>}
  </section>;
}
