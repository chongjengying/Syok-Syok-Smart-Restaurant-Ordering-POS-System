import { useEffect, useState } from "react";
import {
  Check,
  Edit3,
  Eye,
  KeyRound,
  MonitorSmartphone,
  MoreVertical,
  Plus,
  Search,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import {
  listBranches,
} from "../../services/organization.service";
import { getAssignableRoles } from "../../services/admin-permission.service";
import StaffDetailPage from './StaffDetailPage';
import { staffPosStatus, hasStaffBranch, friendlyRole } from '../../shared/staffPresentation';

const empty = { name: "", staffCode: "", email: "", phone: "", branchId: "", additionalBranches: [], role: "CASHIER", allowPosLogin: true, pinMode: "STAFF_SET", status: "ACTIVE" };

export default function UserManagement({ canCreate = false, canEdit = false, canAssignRole = false, staffId = '', onNavigate }) {
  const state = useAdminUsers();
  const [form, setForm] = useState(empty),
    [creating, setCreating] = useState(false),
    [branches, setBranches] = useState([]),
    [temporaryPin, setTemporaryPin] = useState(""),
    [copied, setCopied] = useState(false);
  const [menuUserId, setMenuUserId] = useState(""),
    [menuPosition, setMenuPosition] = useState(null),
    [viewing, setViewing] = useState(staffId ? { id: staffId } : null),
    [editing, setEditing] = useState(null),
    [deactivating, setDeactivating] = useState(null),
    [reactivating, setReactivating] = useState(null);
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [roleOptions, setRoleOptions] = useState([]);
  useEffect(() => {
    void listBranches().then((result) => setBranches(result.data || []));
    void getAssignableRoles().then((result) => {
      if (result.data?.length) setRoleOptions(result.data.map((role) => role.name));
    });
  }, []);
  useEffect(() => {
    if (!menuUserId) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest("[data-staff-menu]")) {
        setMenuUserId("");
        setMenuPosition(null);
      }
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [menuUserId]);
  const submit = async (event) => {
    event.preventDefault();
    const result = await state.invite(form);
    if (result) {
      setCreating(false);
      setForm(empty);
      setTemporaryPin(result.temporaryPin || result.data?.temporaryPin || "");
    }
  };
  const copy = async () => {
    if (temporaryPin) {
      await navigator.clipboard.writeText(temporaryPin);
      setCopied(true);
    }
  };
  const openAccess = user => openDetail(user);
  const saveEdit = async (event) => {
    event.preventDefault();
    const result = await state.edit({
      userId: editing.id,
      name: editing.name,
      role: editing.role_name,
      branchId: editing.branch_id,
      active: editing.status === "ACTIVE",
      additionalBranchIds: (editing.assignedBranchIds || []).filter((id) => id !== editing.branch_id),
    });
    if (result) setEditing(null);
  };
  const deactivate = async () => {
    const user = deactivating;
    if (!user) return;
    const result = await state.edit({
      userId: user.id,
      name: user.name,
      role: user.role_name,
      branchId: user.branch_id,
      active: false,
      additionalBranchIds: (user.assignedBranchIds || user.branches?.map(branch => branch.branch_id) || []).filter(id => id !== user.branch_id),
    });
    if (result) setDeactivating(null);
  };
  const reactivate = async () => {
    const user = reactivating;
    if (!user) return;
    const result = await state.edit({
      userId: user.id,
      name: user.name,
      role: user.role_name,
      branchId: user.branch_id,
      active: true,
      additionalBranchIds: (user.assignedBranchIds || user.branches?.map(branch => branch.branch_id) || []).filter(id => id !== user.branch_id),
    });
    if (result) setReactivating(null);
  };
  const visibleUsers = state.users.filter((user) =>
    (branchFilter === "ALL" || hasStaffBranch(user, branchFilter)) &&
    (roleFilter === "ALL" || user.role_name === roleFilter) &&
    (statusFilter === "ALL" || user.status === statusFilter),
  );
  const pinLabel = staffPosStatus;
  const openDetail = user => { setViewing(user); setMenuUserId(''); onNavigate?.('users', { staffId: user.id }); };
  const resetPin = async user => { const result = await state.requirePinSetup(String(user.id)); if (result.ok) { setCopied(false); setTemporaryPin(result.temporaryPin); globalThis.dispatchEvent(new Event('admin-staff-updated')); } };
  return (
    <section className="space-y-5">
      {viewing && <StaffDetailPage staffId={viewing.id} canEdit={canEdit} canAssignRole={canAssignRole} busy={state.busy} onBack={() => { setViewing(null); onNavigate?.('users'); }} onEdit={setEditing} onResetPin={resetPin} onDeactivate={setDeactivating} onReactivate={setReactivating} onNavigate={onNavigate} />}
      {viewing && state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {!viewing && <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Staff</h1>
          <p className="text-sm text-gray-500">
            Manage staff, branch assignments, roles, and POS access.
          </p>
        </div>
        {canCreate && <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus size={17} />
          Create Staff
        </button>}
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        <label className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            aria-label="Search staff"
            value={state.search}
            onChange={(event) => state.setSearch(event.target.value)}
            placeholder="Search name, staff code, role…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-10 text-sm outline-none focus:bg-white"
        />
        </label>
        <select aria-label="Filter by branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select>
        <select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">All roles</option>{roleOptions.map((role) => <option key={role}>{role}</option>)}</select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-emerald-700"
        >
          {state.notice}
        </p>
      )}
      {state.isLoading ? (
        <p role="status">Loading staff…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed text-sm">
            <colgroup><col style={{width:'25%'}}/><col style={{width:'13%'}}/><col style={{width:'21%'}}/><col style={{width:'17%'}}/><col style={{width:'11%'}}/><col style={{width:'13%'}}/></colgroup>
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {[
                  "Staff",
                  "Role",
                  "Branch Access",
                  "POS access",
                  "Status",
                  "Actions",
                ].map((label) => (
                  <th
                    key={label}
                    className="break-words px-2 py-3 text-[10px] sm:px-3"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="break-words px-2 py-3 sm:px-3">
                    <button onClick={() => openDetail(user)} className="text-left font-bold text-slate-950 hover:text-emerald-700 hover:underline">{user.name}</button>
                    <span className="block text-xs text-slate-500">
                      {user.staff_code || user.username}
                    </span>
                  </td>
                  <td className="break-words px-2 py-3 font-semibold sm:px-3">{friendlyRole(user.role_name)}</td>
                  <td className="break-words px-2 py-3 sm:px-3">
                    <strong className="text-xs">{user.branches?.[0]?.name || "No branches"}</strong>
                    <span className="block text-xs text-slate-500">
                      {user.branches?.length > 1 ? `+${user.branches.length - 1} branches` : user.branches?.[0]?.code || ''}
                    </span>
                  </td>
                  <td className="break-words px-2 py-3 sm:px-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${pinLabel(user) === "POS Ready" ? "bg-emerald-50 text-emerald-700" : user.status !== "ACTIVE" ? "bg-slate-100 text-slate-500" : user.pinLocked ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                      {pinLabel(user)}
                    </span>
                  </td>
                  <td className="break-words px-2 py-3 sm:px-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${user.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"}`}>
                      {user.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td
                    data-staff-menu
                    className="bg-white px-2 py-3 sm:px-3"
                  >
                    <button type="button" aria-label={`View ${user.name}`} title="View staff" onClick={() => openDetail(user)} className="mr-1 rounded border border-slate-200 p-1.5 text-slate-600"><Eye size={14}/></button>
                    <button
                      type="button"
                      aria-label={`Manage ${user.name}`}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        const width = 224;
                        const height = 240;
                        const top =
                          rect.top > height + 12
                            ? rect.top - height
                            : rect.bottom + 8;
                        setMenuPosition({
                          top,
                          left: Math.max(
                            8,
                            Math.min(
                              rect.right - width,
                              window.innerWidth - width - 8,
                            ),
                          ),
                        });
                        setMenuUserId(menuUserId === user.id ? "" : user.id);
                      }}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    >
                      <MoreVertical size={17} />
                    </button>
                    {menuUserId === user.id && menuPosition && (
                      <div
                        data-staff-menu
                        className="fixed z-[100] w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
                        style={{
                          top: menuPosition.top,
                          left: menuPosition.left,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            openDetail(user);
                            setMenuUserId("");
                            setMenuPosition(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"
                        >
                          <Eye size={14} />
                          View staff
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            setEditing({ ...user, assignedBranchIds: user.assignedBranchIds || user.branches?.map((branch) => branch.branch_id) || [user.branch_id] });
                            setMenuUserId("");
                            setMenuPosition(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"
                        >
                          <Edit3 size={14} />
                          Edit staff
                        </button>
                        <button
                          type="button"
                          onClick={() => void openAccess(user)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-slate-50"
                        >
                          <MonitorSmartphone size={14} />
                          View terminal access
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit || state.busy || user.status !== "ACTIVE"}
                          onClick={async () => {
                            setMenuUserId("");
                            setMenuPosition(null);
                            const result = await state.requirePinSetup(
                              String(user.id),
                            );
                            if (result.ok) {
                              setCopied(false);
                              setTemporaryPin(result.temporaryPin);
                            }
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-amber-50 disabled:opacity-50"
                        >
                          <KeyRound size={14} />
                          Reset POS PIN
                        </button>
                        {user.status === "ACTIVE" ? (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => {
                              setDeactivating(user);
                              setMenuUserId("");
                              setMenuPosition(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-red-700 hover:bg-red-50"
                          >
                            <UserX size={14} />
                            Deactivate staff
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => {
                              setReactivating(user);
                              setMenuUserId("");
                              setMenuPosition(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50"
                          >
                            <UserCheck size={14} />
                            Reactivate staff
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!visibleUsers.length && (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-slate-500">
                    No staff records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </>}
      {creating && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <form
            onSubmit={submit}
            className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 sm:px-8">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Staff management</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Create Staff</h2>
                <p className="text-sm text-slate-500">
                  Set identity, branch access, and POS sign-in policy.
                </p>
              </div>
              <button type="button" onClick={() => setCreating(false)}>
                <X />
              </button>
            </div>
            <div className="space-y-7 px-6 py-6 sm:px-8">
              <fieldset>
                <legend className="text-sm font-black text-slate-950">1. Staff Information</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Employee ID *<input required value={form.staffCode} onChange={(event) => setForm({ ...form, staffCode: event.target.value.toUpperCase() })} placeholder="EMP001" className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Full Name *<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jason Tan" className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="jason@company.com" className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500" /></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+60 12 345 6789" className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500" /></label>
                </div>
              </fieldset>
              <fieldset className="border-t border-slate-200 pt-6">
                <legend className="text-sm font-black text-slate-950">2. Assignment</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Role *<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500">{roleOptions.map((role) => <option key={role}>{role}</option>)}</select></label>
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-600">Primary Branch *<select required value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500"><option value="">Select branch</option>{branches.filter((branch) => branch.status === "ACTIVE").map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}</select></label>
                </div>
                <div className="mt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Additional Branches</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{branches.filter((branch) => branch.status === "ACTIVE" && branch.id !== form.branchId).map((branch) => <label key={branch.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><input type="checkbox" checked={form.additionalBranches.includes(branch.id)} onChange={(event) => setForm({ ...form, additionalBranches: event.target.checked ? [...form.additionalBranches, branch.id] : form.additionalBranches.filter((id) => id !== branch.id) })} className="h-4 w-4 accent-slate-900" />{branch.code} · {branch.name}</label>)}</div></div>
              </fieldset>
              <fieldset className="border-t border-slate-200 pt-6">
                <legend className="text-sm font-black text-slate-950">3. POS Access</legend>
                <div className="mt-3 space-y-4">
                  <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-800">Allow POS Login<input type="checkbox" checked={form.allowPosLogin} onChange={(event) => setForm({ ...form, allowPosLogin: event.target.checked })} className="h-5 w-5 accent-slate-900" /></label>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Terminal Access</p><label className="mt-2 flex items-center gap-2 text-sm text-slate-700"><input type="radio" checked readOnly className="accent-slate-900" />All eligible terminals in assigned branches</label><p className="ml-6 mt-1 text-xs text-slate-500">Specific terminal restrictions can be configured after staff creation.</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">POS PIN</p><label className="mt-2 flex items-center gap-2 text-sm text-slate-700"><input type="radio" checked={form.pinMode === "STAFF_SET"} onChange={() => setForm({ ...form, pinMode: "STAFF_SET" })} className="accent-slate-900" />Require staff to set PIN</label><label className="mt-2 flex items-center gap-2 text-sm text-slate-700"><input type="radio" checked={form.pinMode === "ADMIN_TEMPORARY"} onChange={() => setForm({ ...form, pinMode: "ADMIN_TEMPORARY" })} className="accent-slate-900" />Admin creates temporary PIN</label></div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
                </div>
              </fieldset>
            </div>
            <div className="flex gap-3 border-t border-slate-200 px-6 py-5 sm:px-8">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="flex-1 rounded-lg border border-slate-200 p-3 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={state.busy}
                className="flex-1 rounded-lg bg-slate-950 p-3 font-black text-white"
              >
                {state.busy ? "Creating…" : "Create Staff"}
              </button>
            </div>
          </form>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={saveEdit}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
              <div>
                <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-500">{editing.staff_code || editing.username || "—"}</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Edit Staff</h2>
                <p className="mt-1 text-sm text-slate-500">Update identity, assignment, and POS access settings.</p>
              </div>
              <button
                type="button"
                aria-label="Close edit staff"
                onClick={() => setEditing(null)}
              >
                <X />
              </button>
            </div>
            <div className="space-y-7 px-6 py-6 sm:px-8">
            <section><h3 className="text-sm font-black text-slate-950">1. Staff Information</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wide text-slate-600">Employee ID<input readOnly value={editing.staff_code || editing.username || ""} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-mono text-slate-600" /></label><label className="text-xs font-bold uppercase tracking-wide text-slate-600">Full Name *<input required value={editing.name || ""} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-500" /></label></div></section>
            <section className="border-t border-slate-200 pt-6"><h3 className="text-sm font-black text-slate-950">2. Role & Assignment</h3><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold uppercase tracking-wide text-slate-600">Role *
              <select
                value={editing.role_name}
                disabled={!canAssignRole}
                onChange={(event) =>
                  setEditing({ ...editing, role_name: event.target.value })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
                {[...new Set([editing.role_name, ...roleOptions])].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              {!canAssignRole && <p className="mt-1 text-xs font-normal text-slate-500">You do not have permission to assign staff roles.</p>}
            </label><label className="text-xs font-bold uppercase tracking-wide text-slate-600">Primary Branch *
              <select
                required
                value={editing.branch_id || ""}
                onChange={(event) =>
                  setEditing({ ...editing, branch_id: event.target.value, assignedBranchIds: [...new Set([...(editing.assignedBranchIds || []), event.target.value])] })
                }
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
                {branches
                  .filter(
                    (branch) =>
                      branch.status === "ACTIVE" ||
                      branch.id === editing.branch_id,
                  )
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
              </select>
            </label></div><div className="mt-5 rounded-xl border border-slate-200 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-600">Branch assignment</p><p className="mt-1 text-xs text-slate-500">Select the branches where this staff member may work. The primary branch is kept separately.</p><div className="mt-3 flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" name="staff-branches" checked={branches.filter(branch => branch.status === "ACTIVE").length > 0 && branches.filter(branch => branch.status === "ACTIVE").every(branch => (editing.assignedBranchIds || []).includes(branch.id))} onChange={() => setEditing({ ...editing, assignedBranchIds: [...new Set([editing.branch_id, ...branches.filter(branch => branch.status === "ACTIVE").map(branch => branch.id)])] })}/>All Branches</label><label className="flex items-center gap-2"><input type="radio" name="staff-branches" checked={!branches.filter(branch => branch.status === "ACTIVE").every(branch => (editing.assignedBranchIds || []).includes(branch.id))} onChange={() => setEditing({ ...editing, assignedBranchIds: [editing.branch_id] })}/>Selected Branches</label></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{branches.filter((branch) => branch.status === "ACTIVE" || (editing.assignedBranchIds || []).includes(branch.id)).map((branch) => { const checked = (editing.assignedBranchIds || []).includes(branch.id); return <label key={branch.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm"><span className="min-w-0 truncate"><span className="font-bold">{branch.code}</span><span className="ml-1 text-slate-500">{branch.name}</span></span><input type="checkbox" checked={checked} disabled={branch.id === editing.branch_id} onChange={(event) => setEditing({ ...editing, assignedBranchIds: event.target.checked ? [...(editing.assignedBranchIds || []), branch.id] : (editing.assignedBranchIds || []).filter((id) => id !== branch.id) })} className="h-4 w-4 shrink-0 accent-amber-500" /></label>; })}</div><p className="mt-3 text-xs font-semibold text-slate-500">{(editing.assignedBranchIds || []).length} branch{(editing.assignedBranchIds || []).length === 1 ? "" : "es"} assigned</p></div></section>
            <section className="border-t border-slate-200 pt-6"><h3 className="text-sm font-black text-slate-950">3. POS Access</h3><div className="mt-3 space-y-3"><label className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm font-bold text-slate-800">POS sign-in enabled
              <input
                type="checkbox"
                checked={editing.status === "ACTIVE"}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    status: event.target.checked ? "ACTIVE" : "INACTIVE",
                  })
                }
                className="h-4 w-4 accent-amber-500"
              /></label><div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><p className="font-bold">Terminal access</p><p className="mt-1 text-xs text-slate-500">Eligible terminals in assigned branches, subject to each terminal’s access policy.</p></div></div></section>
            </div>
            <div className="flex gap-3 border-t border-slate-200 px-6 py-5 sm:px-8">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-lg border border-slate-200 p-3 font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={state.busy}
                className="flex-1 rounded-lg bg-slate-950 p-3 font-black text-white"
              >
                {state.busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
      {deactivating && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-red-600">
                  Deactivate staff
                </p>
                <h2 className="mt-1 text-xl font-black">
                  Deactivate {deactivating.name}?
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close deactivate staff"
                onClick={() => setDeactivating(null)}
              >
                <X />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              This blocks POS sign-in and ends the staff member&apos;s active
              terminal sessions. Their historical records are preserved.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeactivating(null)}
                className="flex-1 rounded-xl border p-3 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={state.busy}
                onClick={() => void deactivate()}
                className="flex-1 rounded-xl bg-red-600 p-3 font-black text-white"
              >
                {state.busy ? "Deactivating…" : "Deactivate staff"}
              </button>
            </div>
          </div>
        </div>
      )}
      {reactivating && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-emerald-600">
                  Reactivate staff
                </p>
                <h2 className="mt-1 text-xl font-black">
                  Reactivate {reactivating.name}?
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close reactivate staff"
                onClick={() => setReactivating(null)}
              >
                <X />
              </button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              This restores POS sign-in eligibility for this staff member at
              their assigned active branch. Terminal access rules still apply.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setReactivating(null)}
                className="flex-1 rounded-xl border p-3 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={state.busy}
                onClick={() => void reactivate()}
                className="flex-1 rounded-xl bg-emerald-600 p-3 font-black text-white"
              >
                {state.busy ? "Reactivating…" : "Reactivate staff"}
              </button>
            </div>
          </div>
        </div>
      )}
      {temporaryPin && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <div className="flex items-center gap-2 text-emerald-700">
              <Check size={18} />
              <h2 className="text-xl font-black">PIN reset successfully</h2>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Staff PIN reset. The temporary PIN is shown in this confirmation
              dialog.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Give this one-time PIN to the staff member. They must set a
              permanent PIN after their first terminal sign-in.
            </p>
            <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-500">
              Temporary PIN
            </p>
            <div className="my-2 flex items-center justify-between rounded-xl border border-slate-300 bg-slate-950 px-4 py-3 font-mono text-2xl font-black tracking-[0.25em] text-white">
              <span>{temporaryPin}</span>
              <button
                type="button"
                onClick={() => void copy()}
                className="rounded-lg border border-white/30 px-3 py-2 text-xs font-sans font-black tracking-normal text-white hover:bg-white/10"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-4 text-xs font-semibold text-slate-500">
              For security, this PIN will only be shown once.
            </p>
            <button
              type="button"
              onClick={() => {
                setTemporaryPin("");
                setCopied(false);
              }}
              className="mt-5 w-full rounded-xl bg-slate-950 p-3 font-black text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
