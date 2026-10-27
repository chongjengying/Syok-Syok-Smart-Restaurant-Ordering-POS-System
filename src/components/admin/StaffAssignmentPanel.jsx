import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  KeyRound,
  Pencil,
  Power,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import {
  assignStaffBranch,
  listBranches,
  setPrimaryStaffBranch,
  setStaffAssignmentStatus,
} from "../../services/organization.service";
import { editStaffAccount } from "../../services/admin-user.service";
import { getAssignableRoles } from "../../services/admin-permission.service";

export default function StaffAssignmentPanel({
  data,
  branchId,
  permissions,
  onReload,
  onError,
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const [manageStaff, setManageStaff] = useState(null);
  const [branches, setBranches] = useState([]);
  const [targetBranch, setTargetBranch] = useState("");
  const [targetPrimary, setTargetPrimary] = useState(false);
  const [notice, setNotice] = useState("");
  const [roleOptions, setRoleOptions] = useState(["MANAGER", "CASHIER", "WAITER", "KITCHEN"]);

  useEffect(() => {
    void listBranches().then((result) => setBranches(result.data || []));
    void getAssignableRoles().then((result) => {
      if (result.data?.length) setRoleOptions(result.data.map((item) => item.name));
    });
  }, []);
  const activeStaff = useMemo(
    () =>
      data.staff.filter(
        (staff) =>
          staff.assignmentStatus === "ACTIVE" && staff.status === "ACTIVE",
      ),
    [data.staff],
  );
  const rows = useMemo(
    () =>
      data.staff.filter((staff) => {
        const text =
          `${staff.name} ${staff.email || ""} ${staff.role || ""}`.toLowerCase();
        return (
          (!query || text.includes(query.toLowerCase())) &&
          (role === "ALL" || staff.role === role) &&
          (status === "ALL" || staff.status === status)
        );
      }),
    [data.staff, query, role, status],
  );
  const stats = useMemo(
    () => ({
      pinReady: activeStaff.filter((staff) => staff.pinStatus === "ACTIVE")
        .length,
      online: activeStaff.filter((staff) => staff.lastActive).length,
      roles: new Set(activeStaff.map((staff) => staff.role)).size,
    }),
    [activeStaff],
  );
  const toggleAssignment = async (staff) => {
    if (!staff.assignmentId || saving) return;
    setSaving(true);
    const next = staff.assignmentStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const result = await setStaffAssignmentStatus(staff.assignmentId, next);
    setSaving(false);
    if (result.error) {
      onError(result.error.message);
      globalThis.dispatchEvent?.(
        new CustomEvent("admin-toast", {
          detail: { message: result.error.message, tone: "error" },
        }),
      );
    } else {
      const message = `Branch assignment ${next === "ACTIVE" ? "activated" : "deactivated"} successfully.`;
      globalThis.dispatchEvent?.(
        new CustomEvent("admin-toast", { detail: { message } }),
      );
      await onReload();
    }
  };
  const makePrimary = async (staff) => {
    if (!staff.assignmentId || staff.isPrimary || saving) return;
    setSaving(true);
    const result = await setPrimaryStaffBranch(staff.assignmentId);
    setSaving(false);
    if (result.error) onError(result.error.message);
    else await onReload();
  };
  const assignToBranch = async (event) => {
    event.preventDefault();
    if (!manageStaff || !targetBranch || saving) return;
    setSaving(true);
    setNotice("");
    const result = await assignStaffBranch(
      manageStaff.id,
      targetBranch,
      targetPrimary,
    );
    setSaving(false);
    if (result.error) onError(result.error.message);
    else {
      setManageStaff(null);
      setNotice(`${manageStaff.name} was assigned successfully.`);
      await onReload();
    }
  };
  const changeRole = async (staff, nextRole) => {
    if (!nextRole || nextRole === staff.role || saving) return;
    setSaving(true);
    const result = await editStaffAccount({
      userId: staff.id,
      name: staff.name,
      role: nextRole,
      branchId,
      active: staff.status === "ACTIVE",
    });
    setSaving(false);
    if (result.error) {
      onError(result.error.message);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message: result.error.message, tone: "error" } }));
    } else {
      setNotice(`${staff.name}'s role was updated to ${nextRole}.`);
      await onReload();
      globalThis.dispatchEvent?.(new CustomEvent("admin-staff-updated", { detail: { staffId: staff.id } }));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">Staff Assignment</h2>
          <p className="text-sm text-slate-500">
            Synchronized with Staff Management. Inactive staff cannot sign in to
            POS.
          </p>
        </div>
        {permissions.includes("user.create") && (
          <a
            href={`#admin/users?branchId=${branchId}`}
            className="flex items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black"
          >
            <UserPlus size={17} />
            Create Staff
          </a>
        )}
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active Staff", activeStaff.length, "Active and assigned"],
          [
            "POS PIN Ready",
            stats.pinReady,
            `${activeStaff.length - stats.pinReady} pending setup`,
          ],
          ["Currently Online", stats.online, "Active POS sessions"],
          ["Branch Role Scope", stats.roles, "Roles assigned"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-2xl border bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>
      <div
        id="assigned-staff"
        className="overflow-hidden rounded-2xl border bg-white"
      >
        <div className="flex flex-wrap gap-3 border-b p-4">
          <label className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-3 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or role…"
              className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
            />
          </label>
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="ALL">All roles</option>
            {[...new Set(data.staff.map((staff) => staff.role))].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border px-3 text-sm"
          >
            <option value="ALL">All status</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </div>
        <div className="w-full overflow-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[27%]" />
              <col className="w-[13%]" />
              <col className="w-[18%]" />
              <col className="w-[11%]" />
              <col className="w-[14%]" />
              <col className="w-[17%]" />
            </colgroup>
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                {[
                  "Staff member",
                  "Role",
                  "POS access",
                  "POS PIN",
                  "Last POS session",
                  "Assignment",
                ].map((label) => (
                  <th key={label} className="px-3 py-3 align-middle first:pl-4 last:pr-4">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((staff) => (
                <tr key={staff.id} className="border-t">
                  <td className="px-3 py-3 align-middle first:pl-4">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-slate-900">{staff.name}</strong>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {staff.email || "No email"}
                      </span>
                      <span className="mt-1 block truncate text-[11px] font-semibold text-slate-400">
                        {staff.branchCode || "—"} · {staff.branchName || "Branch not assigned"}
                        {staff.isPrimary ? " · Primary" : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {permissions.includes("user.assign_role") ? (
                      <select
                        aria-label={`Role for ${staff.name}`}
                        value={staff.role}
                        disabled={saving}
                        onChange={(event) => void changeRole(staff, event.target.value)}
                        className="max-w-full rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 outline-none focus:border-violet-500 disabled:opacity-60"
                      >
                        {[...new Set([staff.role, ...roleOptions])].map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-block max-w-full truncate rounded-lg bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">
                        {staff.role}
                      </span>
                    )}
                    <span className="mt-1 block text-[10px] text-slate-400">Role permissions apply</span>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="max-h-14 overflow-hidden text-xs text-slate-600">
                      {staff.terminals?.length ? (
                        staff.terminals.map((terminal) => (
                          <span
                            key={terminal.code}
                            className="mb-1 mr-1 inline-block max-w-full truncate rounded bg-slate-100 px-1.5 py-1 align-middle"
                          >
                            {terminal.code}
                          </span>
                        ))
                      ) : (
                        <span>No terminal access</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${staff.pinStatus === "ACTIVE" ? "text-emerald-700" : "text-amber-700"}`}
                    >
                      <KeyRound size={13} />
                      {staff.pinStatus === "ACTIVE" ? "Ready" : "Pending"}
                    </span>
                  </td>
                  <td className="px-3 py-3 align-middle text-xs text-slate-500">
                    {staff.lastActive ? (
                      <span className="inline-flex items-start gap-1.5">
                        <Clock3 size={13} className="mt-0.5 shrink-0" />
                        <span className="leading-4">{new Date(staff.lastActive).toLocaleDateString()}<br />{new Date(staff.lastActive).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                    ) : (
                      <span className="leading-4">No session<br />recorded</span>
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle last:pr-4">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${staff.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {staff.status === "ACTIVE" ? "Active" : "Inactive"}
                    </span>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {staff.status === "INACTIVE" ? (
                      <button
                        type="button"
                        onClick={() => void toggleAssignment(staff)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Power size={13} />
                        Reactivate assignment
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => void toggleAssignment(staff)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 text-[11px] font-bold underline"
                        >
                          <Power size={13} />
                          {staff.assignmentStatus === "ACTIVE" ? "Remove" : "Add"}
                        </button>
                        {!staff.isPrimary && (
                          <button
                            onClick={() => void makePrimary(staff)}
                            disabled={saving}
                            className="text-[11px] font-bold text-amber-700 underline"
                          >
                            Primary
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setManageStaff(staff);
                            setTargetBranch(branchId);
                            setTargetPrimary(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold underline"
                        >
                          <Pencil size={13} />
                          Manage
                        </button>
                      </>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-slate-500">
                    No staff matches this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
        <ShieldCheck size={16} className="mt-0.5 text-emerald-600" />
        <p>
          Branch assignment controls where staff may work. Terminal access
          controls which devices they may use. The backend validates both before
          creating a Staff Session.
        </p>
      </div>
      {manageStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={assignToBranch}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black">
                  Manage {manageStaff.name}
                </h3>
                <p className="text-sm text-slate-500">
                  Choose a branch to assign this staff member. Setting it as
                  primary moves them from their current branch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManageStaff(null)}
                className="text-2xl"
              >
                ×
              </button>
            </div>
            <label className="mt-5 block text-sm font-bold">
              Branch
              <select
                value={targetBranch}
                onChange={(event) => setTargetBranch(event.target.value)}
                className="mt-1 w-full rounded-xl border p-3"
              >
                {branches
                  .filter((branch) => branch.status === "ACTIVE")
                  .map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.code} · {branch.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mt-4 flex items-center gap-2 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                checked={targetPrimary}
                onChange={(event) => setTargetPrimary(event.target.checked)}
              />
              Make this the primary branch and remove other active assignments
            </label>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setManageStaff(null)}
                className="flex-1 rounded-xl border p-3 font-bold"
              >
                Cancel
              </button>
              <button
                disabled={saving || !targetBranch}
                className="flex-1 rounded-xl bg-blue-600 p-3 font-black text-white"
              >
                {saving ? "Saving…" : "Save Assignment"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
