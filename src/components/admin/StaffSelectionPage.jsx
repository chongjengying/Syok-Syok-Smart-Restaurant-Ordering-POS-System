import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, UserPlus } from 'lucide-react';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { assignStaffBranch, listBranches } from '../../services/organization.service';

export default function StaffSelectionPage({ branchId }) {
  const staff = useAdminUsers();
  const [branch, setBranch] = useState(null);
  const [assigningId, setAssigningId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void listBranches().then((result) => {
      setBranch((result.data || []).find((item) => item.id === branchId) || null);
    });
  }, [branchId]);

  const available = useMemo(() => staff.users.filter((user) => (
    user.status === 'ACTIVE'
    && user.auth_linked
    && !(user.branches || []).some((assignment) => assignment.branch_id === branchId)
  )), [branchId, staff.users]);

  const assign = async (user) => {
    if (assigningId) return;
    setAssigningId(user.id);
    setError('');
    setNotice('');
    const result = await assignStaffBranch(user.id, branchId, false);
    setAssigningId('');
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setNotice(`${user.name} was assigned to ${branch?.code || 'the branch'}.`);
    await staff.refresh();
  };

  return <section className="space-y-5">
    <a href={`#admin/branches?branchId=${branchId}`} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600"><ArrowLeft size={16}/>Back to branch</a>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.2em] text-blue-700">Branch staff</p><h1 className="mt-1 text-3xl font-black">Select Staff</h1><p className="mt-1 text-sm text-slate-500">Choose an available staff member to assign to {branch ? `${branch.code} · ${branch.name}` : 'this branch'}.</p></div><a href={`#admin/users?branchId=${branchId}`} className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 font-black"><UserPlus size={17}/>Create Staff</a></header>
    <label className="relative block max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input aria-label="Search available staff" value={staff.search} onChange={event=>staff.setSearch(event.target.value)} placeholder="Search available staff…" className="w-full rounded-xl border bg-white py-2.5 pl-10"/></label>
    {(error || staff.error)&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{error || staff.error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-700">{notice}</p>}
    {staff.isLoading?<p role="status">Loading available staff…</p>:<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{available.map(user=><article key={user.id} className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{user.name}</h2><p className="text-sm text-slate-500">{user.email}</p><p className="mt-2 text-xs font-bold text-violet-700">{user.role_name}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">AVAILABLE</span></div><div className="mt-4 flex flex-wrap gap-1">{user.branches?.length?user.branches.map(item=><span key={item.branch_id} className="rounded bg-slate-100 px-2 py-1 text-xs">{item.code}{item.is_primary?' · Primary':''}</span>):<span className="text-xs text-slate-400">No current branch assignment</span>}</div><button type="button" disabled={Boolean(assigningId)} onClick={()=>void assign(user)} className="mt-5 w-full rounded-xl bg-blue-600 p-3 font-black text-white disabled:opacity-50">{assigningId===user.id?'Assigning…':'Assign to Branch'}</button></article>)}</div>}
    {!staff.isLoading&&!available.length&&<p className="rounded-2xl border bg-white p-10 text-center text-slate-500">No available staff. Create a new staff account or return to the branch.</p>}
  </section>;
}
