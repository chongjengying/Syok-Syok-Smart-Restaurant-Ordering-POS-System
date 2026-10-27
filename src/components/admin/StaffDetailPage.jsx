import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Edit3, KeyRound, MoreVertical, RefreshCw, UserCheck, UserX, X } from 'lucide-react';
import { getAdminStaffDetail } from '../../services/admin-user.service';
import { friendlyRole, staffPosStatus } from '../../shared/staffPresentation';

const date = value => value ? new Date(value).toLocaleString() : '-';
function Fields({ values }) {
  return <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">{values.map(([label,value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-semibold">{value || '-'}</dd></div>)}</dl>;
}

export default function StaffDetailPage({ staffId, canEdit, canAssignRole, busy, onBack, onEdit, onResetPin, onDeactivate, onReactivate, onNavigate }) {
  const [data,setData] = useState(null);
  const [tab,setTab] = useState('Overview');
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(true);
  const [revision,setRevision] = useState(0);
  const [menu,setMenu] = useState(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void getAdminStaffDetail(staffId).then(result => {
      if (!active) return;
      if (result.error) { setError(result.error.message); setData(null); }
      else setData(result.data);
      setLoading(false);
    }).catch(cause => { if (active) { setError(cause.message); setData(null); setLoading(false); } });
    return () => { active = false; };
  }, [staffId,revision]);
  useEffect(() => {
    globalThis.addEventListener('admin-staff-updated',refresh);
    globalThis.addEventListener('focus',refresh);
    return () => { globalThis.removeEventListener('admin-staff-updated',refresh); globalThis.removeEventListener('focus',refresh); };
  }, [refresh]);
  useEffect(() => {
    if (!menu) return undefined;
    const close = event => { if (!event.target.closest('[data-staff-detail-menu]')) setMenu(false); };
    document.addEventListener('pointerdown',close);
    return () => document.removeEventListener('pointerdown',close);
  }, [menu]);
  const edit = () => onEdit({ ...data, assignedBranchIds: data.branches.map(branch => branch.branch_id) });
  if (!data) return <section><button onClick={onBack} className="flex items-center gap-2 text-sm"><ArrowLeft size={16}/>Staff</button>{loading ? <p role="status" className="mt-5">Loading staff details...</p> : <div role="alert" className="mt-5 text-red-700"><p>{error || 'Staff not found.'}</p><button onClick={refresh} className="mt-3 inline-flex items-center gap-2 rounded border p-2"><RefreshCw size={16}/>Retry</button></div>}</section>;
  const currentShift = data.currentShift || data.shifts.find(shift => shift.status === 'OPEN');
  const groups = data.permissions.reduce((result,permission) => { const category=friendlyRole(permission.category); (result[category] ||= []).push(permission); return result; },Object.create(null));
  return <section className="space-y-5">
    <header className="border-b border-slate-200 pb-5">
      <button onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={16}/>Staff</button>
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-bold">{data.name}</h1><span className={`text-xs font-semibold ${data.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'}`}>{data.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></div><p className="mt-1 text-sm text-slate-500">{data.staff_code} · {friendlyRole(data.role_name)}</p><p className="mt-2 text-sm">{data.branches.map(branch => branch.name).join(', ') || 'No branches assigned'}</p></div>
        <div className="flex gap-2"><button title="Refresh staff details" aria-label="Refresh staff details" disabled={loading} onClick={refresh} className="rounded border p-2"><RefreshCw size={16}/></button>{canEdit && <button onClick={edit} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm"><Edit3 size={16}/>Edit Staff</button>}{canEdit && <div className="relative" data-staff-detail-menu><button title="Staff actions" aria-label="Staff actions" aria-expanded={menu} onClick={() => setMenu(value => !value)} className="rounded border p-2"><MoreVertical size={16}/></button>{menu && <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded border bg-white p-1 shadow-lg"><button disabled={busy || data.status !== 'ACTIVE'} onClick={() => { setMenu(false); onResetPin(data); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-50"><KeyRound size={15}/>Reset POS PIN</button><button disabled={busy} onClick={() => { setMenu(false); if (data.status === 'ACTIVE') onDeactivate(data); else onReactivate(data); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">{data.status === 'ACTIVE' ? <UserX size={15}/> : <UserCheck size={15}/>} {data.status === 'ACTIVE' ? 'Deactivate Staff' : 'Reactivate Staff'}</button></div>}</div>}</div></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    </header>
    <div role="tablist" aria-label="Staff detail views" className="flex flex-wrap gap-1 border-b border-slate-200">{['Overview','Access & Permissions','Security','Shifts','Login History'].map(name => <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)} className={`border-b-2 px-3 py-3 text-sm ${tab === name ? 'border-emerald-600 font-semibold text-emerald-800' : 'border-transparent text-slate-500'}`}>{name}</button>)}</div>
    <div role="tabpanel" aria-label={tab}>
      {tab === 'Overview' && <div className="grid gap-8 lg:grid-cols-2"><section><h2 className="text-sm font-bold">Personal Information</h2><Fields values={[["Full Name",data.name],["Employee ID",data.staff_code],["Email",data.email],["Phone",data.phone]]}/></section><section><h2 className="text-sm font-bold">Access Summary</h2><Fields values={[["Role",friendlyRole(data.role_name)],["Branch Access",data.branches.map(branch => branch.name).join(', ')],["POS Access",staffPosStatus(data)],["PIN",data.pin_status === 'ACTIVE' ? 'Configured' : data.pin_status === 'TEMPORARY_RESET' ? 'Change required' : 'Required']]}/></section><section className="border-t border-slate-200 pt-5 lg:col-span-2"><h2 className="text-sm font-bold">Current Shift</h2>{!data.canViewShifts ? <p className="mt-3 text-sm text-slate-500">Shift-view permission is required.</p> : currentShift ? <><Fields values={[["Status","Shift Open"],["Shift Owner",currentShift.owner_name || data.name],["Branch",currentShift.branch],["Terminal",`${currentShift.terminal} · ${currentShift.terminal_code}`],["Started",date(currentShift.opened_at)],["Duration",`${Math.max(0,Math.floor((Date.now()-new Date(currentShift.opened_at))/3600000))}h ${Math.max(0,Math.floor((Date.now()-new Date(currentShift.opened_at))/60000)%60)}m`]]}/><button onClick={() => onNavigate?.('cash-shifts',{ shiftId: currentShift.id })} className="mt-4 rounded border px-3 py-2 text-sm">View Shift</button></> : <p className="mt-3 text-sm text-slate-500">No active shift</p>}</section></div>}
      {tab === 'Access & Permissions' && <div className="space-y-6"><section><div className="flex items-center justify-between"><h2 className="text-sm font-bold">{friendlyRole(data.role_name)}</h2>{canEdit && canAssignRole && <button onClick={edit} className="rounded border px-3 py-2 text-sm">Change Role</button>}</div><p className="mt-2 text-sm text-slate-500">{data.roleDescription}</p></section><section className="border-t pt-5"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">Branch Access</h2>{canEdit && <button onClick={edit} className="rounded border px-3 py-2 text-sm">Edit Access</button>}</div><div className="mt-3 space-y-2">{data.branches.map(branch => <p key={branch.branch_id} className="flex items-center gap-2 text-sm"><Check size={15} className="text-emerald-600"/>{branch.name}<span className="text-xs text-slate-500">{friendlyRole(branch.status)}</span></p>)}</div><p className="mt-3 text-xs text-slate-500">{data.branches.length} branches assigned</p></section><section className="border-t pt-5"><h2 className="text-sm font-bold">Permissions</h2><div className="mt-4 grid gap-6 sm:grid-cols-2">{Object.entries(groups).map(([category,permissions]) => <div key={category}><h3 className="text-xs font-bold text-slate-500">{category}</h3><ul className="mt-2 space-y-2">{permissions.map((permission,index) => <li key={index} className="flex items-start gap-2 text-sm">{permission.granted ? <Check size={15} className="mt-0.5 shrink-0 text-emerald-600"/> : <X size={15} className="mt-0.5 shrink-0 text-slate-400"/>}{permission.label}</li>)}</ul></div>)}</div></section><section className="border-t pt-5"><h2 className="text-sm font-bold">Terminal Access</h2><div className="mt-3 space-y-2">{data.terminals.map((terminal,index) => <p key={index} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{terminal.name} · {terminal.code}<small className="ml-2 text-slate-500">{terminal.branch}</small></span><span className={terminal.allowed ? 'text-emerald-700' : 'text-slate-500'}>{terminal.allowed ? 'Eligible' : friendlyRole(terminal.reason)}</span></p>)}{!data.terminals.length && <p className="text-sm text-slate-500">No terminals in assigned branches.</p>}</div></section></div>}
      {tab === 'Security' && <section><h2 className="text-sm font-bold">POS Security</h2><Fields values={[["POS Access",staffPosStatus(data)],["PIN",data.pin_status === 'ACTIVE' ? 'Configured' : 'Setup or change required'],["Account Lock",data.pinLocked ? 'Locked' : 'Not locked'],["Failed PIN Attempts",String(data.failedAttempts)],["PIN Changed",date(data.pinChangedAt)]]}/>{canEdit && <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy || data.status !== 'ACTIVE'} onClick={() => onResetPin(data)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-50"><KeyRound size={16}/>Reset POS PIN</button><button disabled={busy} onClick={() => data.status === 'ACTIVE' ? onDeactivate(data) : onReactivate(data)} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm">{data.status === 'ACTIVE' ? <UserX size={16}/> : <UserCheck size={16}/>} {data.status === 'ACTIVE' ? 'Deactivate Staff' : 'Reactivate Staff'}</button></div>}</section>}
      {tab === 'Shifts' && <section><h2 className="text-sm font-bold">Recent Shifts</h2>{!data.canViewShifts ? <p className="mt-3 text-sm text-slate-500">Shift-view permission is required.</p> : <div className="mt-3 space-y-2">{data.shifts.map(shift => <button key={shift.id} onClick={() => onNavigate?.('cash-shifts',{ shiftId: shift.id })} className="flex w-full flex-wrap items-center justify-between gap-3 border-b py-3 text-left text-sm"><span><strong>{shift.shift_number}</strong><span className="block text-xs text-slate-500">{shift.branch} · {shift.terminal}</span></span><span>{date(shift.opened_at)}</span><span>{friendlyRole(shift.status)}</span></button>)}{!data.shifts.length && <p className="text-sm text-slate-500">No shift history.</p>}</div>}</section>}
      {tab === 'Login History' && <section><h2 className="text-sm font-bold">Recent Staff Sessions</h2>{!data.canViewHistory ? <p className="mt-3 text-sm text-slate-500">Audit-view permission is required.</p> : <div className="mt-3 space-y-2">{data.loginHistory.map((event,index) => <div key={index} className="flex flex-wrap justify-between gap-3 border-b py-3 text-sm"><span>{event.branch} · {event.terminal}</span><span>{date(event.started_at)}<small className="block text-slate-500">{event.ended_at ? `Ended ${date(event.ended_at)}` : 'Not ended'}</small></span><span>{friendlyRole(event.status)}</span></div>)}{!data.loginHistory.length && <p className="text-sm text-slate-500">No staff session history.</p>}</div>}</section>}
    </div>
  </section>;
}
