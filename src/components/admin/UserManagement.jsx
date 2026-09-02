import React, { useState } from 'react';
import { Check, Copy, KeyRound, Pencil, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { useAdminUsers } from '../../hooks/useAdminUsers';

const roles = ['ADMIN', 'MANAGER', 'WAITER', 'KITCHEN'];
const emptyForm = { name: '', email: '', username: '', role: 'WAITER', status: 'ACTIVE', enablePosAccess: true };

export default function UserManagement() {
  const state = useAdminUsers();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [pinResetUser, setPinResetUser] = useState(null);
  const [temporaryPin, setTemporaryPin] = useState('');
  const [pinCopied, setPinCopied] = useState(false);
  const [createdPin, setCreatedPin] = useState('');

  const open = (user = null) => {
    setEditing(user || { isNew: true });
    setForm(user ? {
      name: user.name || '', email: user.email || '', username: user.username || '',
      role: roles.includes(user.role_name) ? user.role_name : 'WAITER',
      status: user.status === 'MISSING_PROFILE' ? 'INACTIVE' : user.status,
      enablePosAccess: user.pos_access !== false,
    } : emptyForm);
  };
  const submit = async (event) => {
    event.preventDefault();
    const result = editing.id ? await state.edit({ userId: editing.id, ...form }) : await state.invite(form);
    if (result) {
      setEditing(null);
      const pin = result?.temporaryPin || result?.data?.temporaryPin || '';
      if (pin) { setCreatedPin(pin); setPinCopied(false); }
    }
  };
  const resetPin = async () => {
    if (!pinResetUser) return;
    const result = await state.requirePinSetup(pinResetUser.id);
    if (result.ok) setTemporaryPin(result.temporaryPin);
  };
  const closePinReset = () => {
    setPinResetUser(null);
    setTemporaryPin('');
    setPinCopied(false);
  };
  const copyTemporaryPin = async () => {
    if (!temporaryPin) return;
    await navigator.clipboard.writeText(temporaryPin);
    setPinCopied(true);
  };
  const copyCreatedPin = async () => { if (!createdPin) return; await navigator.clipboard.writeText(createdPin); setPinCopied(true); };

  return <section className="space-y-5">
    <div className="flex justify-between"><div><h1 className="text-2xl font-black">Users</h1><p className="text-sm text-gray-500">Create staff accounts, assign roles, and issue temporary staff PIN resets.</p></div><button onClick={() => open()} className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 font-black"><Plus size={17}/>Create Staff</button></div>
    <div className="relative max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={state.search} onChange={event => state.setSearch(event.target.value)} placeholder="Search users" className="w-full rounded-xl border bg-white py-2.5 pl-10"/></div>
    {state.error&&<p className="rounded-xl bg-red-50 p-3 text-red-700">{state.error}</p>}{state.notice&&<p className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{state.notice}</p>}
    {state.isLoading?<p>Loading users…</p>:<div className="overflow-x-auto rounded-2xl bg-white"><table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Staff</th><th className="p-3">Role</th><th className="p-3">Profile</th><th className="p-3">POS Access</th><th className="p-3">Supabase Auth</th><th className="p-3">Created</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{state.users.map(user=><tr key={user.id} className="border-t"><td className="p-3"><strong>{user.name}</strong><p className="text-xs text-gray-400">{user.email}</p></td><td className="p-3 font-bold">{user.role_name||'Not assigned'}</td><td className="p-3">{user.status}</td><td className="p-3"><strong className={user.pin_status==='ACTIVE'?'text-emerald-600':user.pin_status==='SETUP_REQUIRED'||user.pin_status==='TEMPORARY_RESET'?'text-amber-600':'text-gray-400'}>{user.pin_status==='ACTIVE'?'PIN active':user.pin_status==='TEMPORARY_RESET'?'Temporary PIN issued':user.pin_status==='SETUP_REQUIRED'?'PIN setup required':'Not enabled'}</strong><p className="text-xs text-gray-400">{user.pin_status==='TEMPORARY_RESET'?'Staff must create a permanent PIN':'Staff uses a private 6-digit PIN'}</p></td><td className="p-3"><strong className={user.auth_linked?'text-emerald-600':'text-red-600'}>{user.auth_linked?'Linked':'Missing Auth user'}</strong><p className="text-xs text-gray-400">{user.auth_linked?(user.email_confirmed?'Email confirmed':'Email pending'):'Cannot sign in'}</p></td><td className="p-3 text-xs">{new Date(user.created_at).toLocaleDateString()}</td><td className="p-3 text-right">{user.status!=='MISSING_PROFILE'&&<div className="flex justify-end gap-2"><button title="Edit staff" onClick={()=>open(user)} className="rounded-lg border p-2"><Pencil size={15}/></button><button disabled={state.busy||!user.auth_linked} onClick={()=>setPinResetUser(user)} className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 disabled:opacity-40"><ShieldCheck size={15}/>Reset PIN</button><button title="Send password reset" disabled={!user.auth_linked} onClick={()=>{if(confirm(`Send password reset instructions to ${user.email}?`))void state.reset(user.id)}} className="rounded-lg border p-2 disabled:opacity-40"><KeyRound size={15}/></button></div>}</td></tr>)}</tbody></table></div>}
    {editing&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"><form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white p-6"><div className="mb-5 flex justify-between"><div><h2 className="text-xl font-black">{editing.id?'Edit Staff':'Create Staff Account'}</h2><p className="text-sm text-gray-500">Assign role and issue a temporary POS PIN for first sign-in.</p></div><button type="button" onClick={()=>setEditing(null)}><X/></button></div><label className="block text-sm font-bold">Name<input required value={form.name} onChange={event=>setForm({...form,name:event.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>{!editing.id&&<label className="mt-4 block text-sm font-bold">Email<input required type="email" value={form.email} onChange={event=>setForm({...form,email:event.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label>}<label className="mt-4 block text-sm font-bold">Role<select value={form.role} onChange={event=>setForm({...form,role:event.target.value})} className="mt-1 w-full rounded-xl border p-3">{roles.map(role=><option key={role}>{role}</option>)}</select></label><label className="mt-4 flex items-center gap-3 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={form.enablePosAccess} onChange={event=>setForm({...form,enablePosAccess:event.target.checked})}/>Enable POS Access<span className="ml-auto text-xs font-normal text-gray-400">Generate temporary PIN</span></label>{editing.id&&<label className="mt-4 block text-sm font-bold">Status<select value={form.status} onChange={event=>setForm({...form,status:event.target.value})} className="mt-1 w-full rounded-xl border p-3"><option>ACTIVE</option><option>INACTIVE</option><option>LOCKED</option></select></label>}<button disabled={state.busy} className="mt-6 w-full rounded-xl bg-[#D4AF37] p-3 font-black">{state.busy?'Saving…':'Confirm'}</button></form></div>}
    {createdPin&&<div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Staff account created</p><h2 className="mt-1 text-xl font-black">Temporary POS PIN</h2></div><button type="button" onClick={()=>setCreatedPin('')}><X/></button></div><p className="mt-5 text-sm text-gray-600">Give this PIN securely to the staff member. It is shown only once.</p><div className="my-5 rounded-2xl bg-slate-950 p-5 text-center text-white"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">Temporary PIN</span><strong className="mt-2 block font-mono text-4xl tracking-[0.3em] text-[#D4AF37]">{createdPin}</strong></div><p className="text-xs text-gray-500">The staff member signs in with the invited email, selects their name, enters this PIN, then creates a permanent six-digit PIN.</p><button type="button" onClick={()=>void copyCreatedPin()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border p-3 font-black">{pinCopied?<Check size={18}/>:<Copy size={18}/>} {pinCopied?'Copied':'Copy PIN'}</button><button type="button" onClick={()=>setCreatedPin('')} className="mt-3 w-full rounded-xl bg-[#D4AF37] p-3 font-black">Done</button></div></div>}
    {pinResetUser&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-wider text-amber-700">Staff access</p><h2 className="mt-1 text-xl font-black">Reset Staff PIN</h2></div><button type="button" onClick={closePinReset} disabled={state.busy}><X/></button></div>{temporaryPin?<><p className="mt-5 text-sm text-gray-600">Give this one-time temporary PIN to <strong>{pinResetUser.name}</strong>. It is shown only now.</p><div className="my-5 rounded-2xl bg-slate-950 p-5 text-center text-white"><span className="text-xs font-bold uppercase tracking-widest text-slate-400">Temporary PIN</span><strong className="mt-2 block font-mono text-4xl tracking-[0.3em] text-[#D4AF37]">{temporaryPin}</strong></div><button type="button" onClick={()=>void copyTemporaryPin()} className="flex w-full items-center justify-center gap-2 rounded-xl border p-3 font-black">{pinCopied?<Check size={18}/>:<Copy size={18}/>} {pinCopied?'Copied':'Copy PIN'}</button><p className="mt-4 text-xs text-gray-500">The staff member must use this temporary PIN, then create a new permanent six-digit PIN.</p><button type="button" onClick={closePinReset} className="mt-5 w-full rounded-xl bg-[#D4AF37] p-3 font-black">Done</button></>:<><p className="mt-5 text-sm text-gray-600">Reset the POS PIN for <strong>{pinResetUser.name}</strong>? Their current PIN will stop working immediately.</p><p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">A temporary six-digit PIN will be generated and displayed once.</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={closePinReset} disabled={state.busy} className="rounded-xl border p-3 font-bold">Cancel</button><button type="button" onClick={()=>void resetPin()} disabled={state.busy} className="rounded-xl bg-[#D4AF37] p-3 font-black">{state.busy?'Resetting…':'Reset PIN'}</button></div></>}</div></div>}
  </section>;
}
