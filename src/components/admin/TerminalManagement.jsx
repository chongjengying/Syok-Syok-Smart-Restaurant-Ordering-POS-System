import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Check, CheckCircle2, ChevronDown, Clock, Copy, Edit3, Ellipsis, Info, LogOut, MonitorSmartphone, Plus, RotateCcw, Search, Settings2, ShieldAlert, Unplug, UserRound, Wifi, X } from "lucide-react";
import {
  changeTerminalStatus,
  resetPosDevice,
  manageTerminalDevice,
  forceTerminalStaffLogout,
  createTerminalActivationCode,
  getTerminalDeviceAssignmentHistory,
  getTerminalAudit,
  getTerminalStaffSession,
  listCashierShifts,
  listBranches,
  listTerminals,
  reassignTerminal,
  saveTerminalWithAccess,
  changeTerminalType,
  subscribeToTerminalChanges,
} from "../../services/organization.service";
import { LEGACY_TERMINAL_TYPES, TERMINAL_TYPE_OPTIONS } from "../../domain/terminalTypes";
import TerminalStaffAccessEditor from './TerminalStaffAccessEditor';

const blank = { code: "", name: "", branchId: "", type: "CASHIER" };
const types = [...TERMINAL_TYPE_OPTIONS.map((item) => item.value), ...LEGACY_TERMINAL_TYPES];
const terminalTypeLabel = (value) =>
  TERMINAL_TYPE_OPTIONS.find((option) => option.value === value)?.label || value || "—";
const terminalErrorMessage = (error, fallback = "Unable to complete terminal action.") => {
  const message = String(error?.message || error || "");
  if (message.includes('ACTIVE_SHIFT_DEVICE_CHANGE_BLOCKED')) return 'Close or reconcile the open shift before changing the device.';
  if (message.includes("STAFF_BRANCH_ACCESS_DENIED")) return "Selected staff must be active and assigned to this terminal's outlet.";
  if (message.includes("TERMINAL_STAFF_REQUIRED")) return "Select at least one staff member for this terminal.";
  if (message.includes("TERMINAL_ROLE_REQUIRED")) return "Select at least one role for this terminal.";
  if (message.includes("STAFF_TERMINAL_ACCESS_DENIED")) return "This staff member is not allowed to use this terminal.";
  if (message.includes("TERMINAL_NOT_FOUND")) return "This terminal is no longer available in your company or outlet.";
  if (message.includes("INSUFFICIENT_PERMISSION")) return "You do not have permission to manage terminal staff access.";
  if (message.includes("TERMINAL_ALREADY_BOUND")) return "This terminal is already bound to an active device.";
  if (message.includes("ACTIVATION_CODE_ALREADY_ISSUED")) return "A valid activation code already exists. Use that code or choose Generate new code after it expires.";
  if (message.includes("INVALID_TERMINAL_TYPE")) return "Select a supported terminal type.";
  if (message.includes("TERMINAL_TYPE_CHANGE_OPEN_SHIFT")) return "Close the open POS shift before changing this terminal type.";
  if (message.includes("TERMINAL_TYPE_CHANGE_ACTIVE_SESSION")) return "Log out all staff from this terminal before changing its type.";
  return message && !message.includes("Failed to fetch") ? message : fallback;
};

function Modal({ title, children, onClose, wide = false }) {
  const content = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6">
      <div className={`relative z-10 w-full ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-lg transition hover:bg-slate-950 hover:text-white"
          aria-label="Close"
        >
          <X size={22} />
        </button>
        <div className="max-h-[90vh] overflow-y-auto rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="relative flex items-start border-b border-slate-200 px-6 py-5 pr-14 sm:px-8 sm:pr-16">
          <h3 className="text-xl font-black tracking-tight text-slate-950">{title}</h3>
        </div>
        <div className="px-6 py-6 sm:px-8">{children}</div>
        </div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
}

function ConfirmActionModal({ action, busy, onCancel, onConfirm, branchName, staffName, terminal }) {
  const copy = {
    RESET: {
      title: "Reset POS device?",
      description: "This will sign out the current staff member and disconnect the activated device. The terminal will remain active, but the device must be activated again.",
      confirm: "Reset POS device",
    },
    FORCE_LOGOUT: {
      title: "Force staff logout?",
      description: "This will end only the current staff session. The terminal and activated device will remain connected.",
      confirm: "Force staff logout",
    },
    REVOKE: {
      title: "Revoke device access?",
      description: "Device access will stop immediately. Any open shift must be reconciled before reactivation. Staff access and history are preserved.",
      confirm: "Revoke device",
    },
    REPLACE: { title: 'Replace device?', description: 'The current device credential will be revoked and a new activation code generated. Close the shift first. Terminal staff access and history are preserved.', confirm: 'Replace device' },
    REACTIVATE: { title: 'Reactivate terminal?', description: 'Generate an activation code for a new device binding. Reconcile any open shift first.', confirm: 'Reactivate terminal' },
    DISABLE: {
      title: "Disable terminal?",
      description: "This will immediately stop this terminal from being used for POS operations until an administrator enables it again.",
      confirm: "Disable terminal",
    },
    ENABLE: {
      title: "Enable terminal?",
      description: "This will allow the terminal to be activated and used again.",
      confirm: "Enable terminal",
    },
    LOCK: {
      title: "Lock terminal?",
      description: "This immediately blocks staff login, shifts, and sales. Existing staff sessions will be locked and must be revalidated after the terminal is unlocked.",
      confirm: "Lock terminal",
    },
    UNLOCK: {
      title: "Unlock terminal?",
      description: "This allows the registered device to continue after staff sign-in is revalidated.",
      confirm: "Unlock terminal",
    },
  }[action] || {};
  return <Modal title={copy.title} onClose={onCancel}>
    <p className="text-sm leading-6 text-slate-600">{copy.description}</p>
    <div className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
      <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Terminal</p><p className="mt-1 font-bold text-slate-950">{terminal?.name || '—'}</p><p className="font-mono text-xs text-slate-500">{terminal?.terminal_code || ''}</p></div>
      <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Branch</p><p className="mt-1 font-bold text-slate-950">{branchName}</p></div>
      <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Current staff</p><p className="mt-1 font-bold text-slate-950">{staffName || "No active staff"}</p></div>
    </div>
    {action === "DISABLE" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-black">What happens next</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5"><li>Active staff and device sessions on this terminal are ended.</li><li>New staff sign-ins, shifts, and sales from this terminal are blocked.</li><li>The terminal can be enabled again by an authorized administrator.</li><li>Existing orders, shifts, and audit history are retained.</li></ul></div>}
    <div className="mt-6 flex justify-end gap-3">
      <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">Cancel</button>
      <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">{busy ? "Processing…" : copy.confirm}</button>
    </div>
  </Modal>;
}

export default function TerminalManagement({
  branchId = "",
  permissions = [],
  onNavigate,
}) {
  const [rows, setRows] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ ...blank, branchId });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState(branchId || "ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [_message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [activation, setActivation] = useState(null);
  const [copied, setCopied] = useState(false);
  const [activationSeconds, setActivationSeconds] = useState(0);
  const [selectedTerminalId, setSelectedTerminalId] = useState("");
  const [deviceAssignments, setDeviceAssignments] = useState([]);
  const [deviceAssignmentsLoading, setDeviceAssignmentsLoading] = useState(false);
  const [terminalAudit, setTerminalAudit] = useState([]);
  const [terminalAuditLoading, setTerminalAuditLoading] = useState(false);
  const [typeEditing, setTypeEditing] = useState(false);
  const [typeValue, setTypeValue] = useState("");
  const [activeStaffSession, setActiveStaffSession] = useState(null);
  const [staffSessionLoading, setStaffSessionLoading] = useState(false);
  const [shiftActivity, setShiftActivity] = useState([]);
  const [shiftActivityError, setShiftActivityError] = useState('');
  const canViewShifts = permissions.includes('cash.shift.view');
  useEffect(() => {
    let active = true;
    setShiftActivity([]); setShiftActivityError('');
    if (selectedTerminalId && canViewShifts) {
      void listCashierShifts('', { terminalId: selectedTerminalId }).then(result => {
        if (!active) return;
        if (result.error) setShiftActivityError(result.error.message);
        else setShiftActivity((result.data || []).slice(0, 5));
      }).catch(cause => { if (active) setShiftActivityError(cause.message); });
    }
    return () => { active = false; };
  }, [selectedTerminalId, canViewShifts, terminalAudit]);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionInfo, setActionInfo] = useState("");
  useEffect(() => {
    if (!actionMenuOpen && !actionInfo) return undefined;
    const closePopovers = (event) => {
      if (!event.target.closest("[data-terminal-popover]")) {
        setActionMenuOpen(false);
        setActionInfo("");
        setRowMenuId("");
      }
    };
    document.addEventListener("pointerdown", closePopovers);
    return () => document.removeEventListener("pointerdown", closePopovers);
  }, [actionInfo, actionMenuOpen]);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [terminalResult, branchResult] = await Promise.allSettled([
      listTerminals(branchId),
      listBranches(),
    ]);
    const terminals =
      terminalResult.status === "fulfilled"
        ? terminalResult.value
        : { error: terminalResult.reason };
    const branchRows =
      branchResult.status === "fulfilled"
        ? branchResult.value
        : { error: branchResult.reason };
    if (terminals.error || branchRows.error)
      setError(
        terminals.error?.message ||
          branchRows.error?.message ||
          "Unable to load terminal management.",
      );
    if (!terminals.error) setRows(terminals.data || []);
    if (!branchRows.error) {
      const nextBranches = branchRows.data || [];
      setBranches(nextBranches);
      setForm((current) => ({
        ...current,
        branchId: branchId || current.branchId || nextBranches[0]?.id || "",
      }));
    }
    setLoading(false);
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let refreshTimer;
    const unsubscribe = subscribeToTerminalChanges(branchId, () => {
          window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(async () => {
            const result = await listTerminals(branchId);
            if (!result.error) setRows(result.data || []);
          }, 150);
        });

    return () => {
      window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [branchId]);
  const run = async (operation, success, fallback = null) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await operation();
      if (result.error) throw result.error;
      const changed = result.data?.data || result.data || fallback;
      if (changed?.id)
        setRows((current) =>
          current.some((row) => row.id === changed.id)
            ? current.map((row) =>
                row.id === changed.id ? { ...row, ...changed } : row,
              )
            : [changed, ...current],
        );
      const refreshed = await listTerminals(branchId);
      if (!refreshed.error) setRows(refreshed.data || []);
      if (selectedTerminalId) {
        const session = await getTerminalStaffSession(selectedTerminalId);
        setActiveStaffSession(session.error ? null : session.data || null);
      }
      setMessage(success);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message: success } }));
    } catch (cause) {
      const notice = terminalErrorMessage(cause);
      setError(notice);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message: notice, tone: "error" } }));
    } finally {
      setBusy(false);
    }
  };
  const state = (terminal) => {
    if (terminal.status === "ARCHIVED" || terminal.status === "RETIRED") return "RETIRED";
    if (terminal.registration_status === "REVOKED") return "REVOKED";
    if (terminal.registration_status !== "REGISTERED")
      return "PENDING ACTIVATION";
    if (terminal.status !== "ACTIVE") return "DISABLED";
    if (terminal.lock_status === "LOCKED") return "LOCKED";
    return !terminal.last_seen_at
      ? "UNKNOWN"
      : Date.now() - new Date(terminal.last_seen_at).getTime() < 120000
        ? "ONLINE"
        : "OFFLINE";
  };
  const canIssueActivation = (terminal) =>
    ["UNREGISTERED", "REVOKED"].includes(terminal.registration_status) &&
    !["ARCHIVED", "RETIRED"].includes(terminal.status);
  const operationalLabel = (terminal) => {
    const value = state(terminal);
    return value === "PENDING ACTIVATION" ? "Setup required" : value === "ONLINE" ? "Active" : value === "UNKNOWN" ? "Active · No signal" : value.charAt(0) + value.slice(1).toLowerCase();
  };
  const visible = rows.filter(
    (terminal) =>
      (!search ||
        `${terminal.terminal_code} ${terminal.name}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "ALL" || state(terminal) === filter) &&
      (branchFilter === "ALL" || terminal.branch_id === branchFilter) &&
      (typeFilter === "ALL" || terminal.terminal_type === typeFilter),
  );
  const connectedBranches = new Set(rows.map((terminal) => terminal.branch_id)).size;
  const onlineCount = rows.filter((terminal) => ["ONLINE", "ACTIVE"].includes(state(terminal))).length;
  const pendingCount = rows.filter((terminal) => state(terminal) === "PENDING ACTIVATION").length;
  const attentionCount = rows.filter((terminal) => ["OFFLINE", "LOCKED", "REVOKED", "RETIRED"].includes(state(terminal))).length;
  const selectedTerminal = rows.find(
    (terminal) => terminal.id === selectedTerminalId,
  );
  useEffect(() => {
    if (!selectedTerminalId) {
      setTerminalAudit([]);
      setActiveStaffSession(null);
      return undefined;
    }
    let active = true;
    setTerminalAuditLoading(true);
    void getTerminalAudit(selectedTerminalId).then((result) => {
      if (!active) return;
      if (result.error) setError(terminalErrorMessage(result.error, "Unable to load terminal activity."));
      else setTerminalAudit(result.data || []);
      setTerminalAuditLoading(false);
    });
    return () => { active = false; };
  }, [selectedTerminalId]);
  useEffect(() => {
    if (!selectedTerminalId) return undefined;
    let active = true;
    setStaffSessionLoading(true);
    void getTerminalStaffSession(selectedTerminalId).then((result) => {
      if (!active) return;
      setActiveStaffSession(result.error ? null : result.data || null);
      setStaffSessionLoading(false);
    });
    return () => { active = false; };
  }, [selectedTerminalId, terminalAudit]);
  useEffect(() => {
    if (!selectedTerminalId) {
      setDeviceAssignments([]);
      return undefined;
    }
    let active = true;
    setDeviceAssignmentsLoading(true);
    void getTerminalDeviceAssignmentHistory(selectedTerminalId).then((result) => {
      if (!active) return;
      if (result.error) setError(terminalErrorMessage(result.error, "Unable to load device history."));
      else setDeviceAssignments(result.data || []);
      setDeviceAssignmentsLoading(false);
    });
    return () => { active = false; };
  }, [selectedTerminalId]);
  const branchName = (terminal) =>
    branches.find((branch) => branch.id === terminal?.branch_id)?.name ||
    branches.find((branch) => branch.id === terminal?.branch_id)?.code ||
    "—";
  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleString([], {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const auditLabel = (action) => String(action || "Activity").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
  const issueActivationCode = async (terminal, forceNew = false) => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const result = await createTerminalActivationCode(terminal.id, forceNew);
      if (result.error) throw result.error;
      setActivation(result.data);
      const refreshed = await listTerminals(branchId);
      if (!refreshed.error) setRows(refreshed.data || []);
      if (forceNew) {
        const message = "Activation code generated successfully.";
        setMessage(message);
        globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message } }));
      }
    } catch (cause) {
      setError(terminalErrorMessage(cause, "Unable to issue activation code."));
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message: terminalErrorMessage(cause, "Unable to issue activation code."), tone: "error" } }));
    } finally {
      setBusy(false);
    }
  };
  const generateNewActivationCode = (terminal) => {
    if (busy) return;
    if (window.confirm("A new code will invalidate the current activation code immediately. Continue?")) {
      void issueActivationCode(terminal, true);
    }
  };
  const resetTerminalDevice = (terminal) => {
    if (busy) return;
    void run(
      () => resetPosDevice(terminal.id),
      "POS device reset successfully. The device must be activated again.",
    );
  };
  const forceStaffLogout = (terminal) => {
    if (busy) return;
    void run(
      () => forceTerminalStaffLogout(terminal.id),
      "Staff signed out successfully.",
    );
  };
  const requestAction = (action, terminal) => {
    const required = ['RESET','REVOKE','REPLACE','DISABLE'].includes(action) ? 'terminal.deactivate' : 'terminal.update';
    if (!permissions.includes(required)) { setError('You do not have permission for this terminal action.'); return; }
    setActionMenuOpen(false);
    setConfirmAction({ action, terminal });
  };
  const confirmTerminalAction = async () => {
    const action = confirmAction?.action;
    const terminal = confirmAction?.terminal;
    if (!action || !terminal || busy) return;
    setConfirmAction(null);
    if (action === "RESET") return resetTerminalDevice(terminal);
    if (action === 'REPLACE' || action === 'REACTIVATE') {
      setBusy(true); setError('');
      try {
        const result = await manageTerminalDevice(terminal.id, action);
        if (result.error) throw result.error;
        setActivation(result.data);
        const refreshed = await listTerminals(branchId);
        if (refreshed.error) throw refreshed.error;
        setRows(refreshed.data || []);
      } catch (cause) { setError(terminalErrorMessage(cause)); }
      finally { setBusy(false); }
      return;
    }
    if (action === "FORCE_LOGOUT") return forceStaffLogout(terminal);
    if (action === "REVOKE") return run(() => changeTerminalStatus(terminal.id, "REVOKE"), "Device access revoked successfully.");
    if (action === "DISABLE") return run(() => changeTerminalStatus(terminal.id, "DEACTIVATE"), "Terminal disabled successfully.");
    if (action === "ENABLE") return run(() => changeTerminalStatus(terminal.id, "ACTIVATE"), "Terminal enabled successfully.");
    if (action === "LOCK") return run(() => changeTerminalStatus(terminal.id, "LOCK"), "Terminal locked successfully.");
    if (action === "UNLOCK") return run(() => changeTerminalStatus(terminal.id, "UNLOCK"), "Terminal unlocked successfully.");
  };
  useEffect(() => {
    if (!activation) return undefined;
    setActivationSeconds(
      Math.max(
        0,
        Math.floor(
          (new Date(activation.expiresAt || 0).getTime() - Date.now()) / 1000,
        ),
      ),
    );
    const timer = window.setInterval(
      () => setActivationSeconds((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [activation]);
  const copyActivationCode = async () => {
    const code = String(activation?.code || "");
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const input = document.createElement("textarea");
        input.value = code;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copiedWithFallback = document.execCommand("copy");
        input.remove();
        if (!copiedWithFallback) throw new Error("Clipboard access is unavailable.");
      }
    } catch {
      const message = "Unable to copy the activation code. Select and copy it manually.";
      setError(message);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message, tone: "error" } }));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const createTerminal = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!form.staffAccess || (form.staffAccess.accessMode === 'SELECTED_STAFF' && !form.staffAccess.staffIds.length)) throw new Error('Load staff access and select at least one staff member for Selected Staff mode.');
      const saved = await saveTerminalWithAccess(form);
      if (saved.error) throw saved.error;
      const terminal = saved.data?.data || saved.data;
      if (!terminal?.id)
        throw new Error("Terminal was created but its ID was not returned.");
      const code = form.id ? null : await createTerminalActivationCode(terminal.id);
      if (code?.error) throw code.error;
      setRows((current) => [
        terminal,
        ...current.filter((row) => row.id !== terminal.id),
      ]);
      if (code?.data) setActivation(code.data);
      setAddOpen(false);
      setForm({ ...blank, branchId: branchId || branches[0]?.id || "" });
      const message = form.id ? "Terminal updated successfully." : "Terminal created successfully.";
      setMessage(message);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message } }));
    } catch (cause) {
      const message = String(cause?.message || cause || "");
      const friendly = message.includes("DUPLICATE_TERMINAL_CODE")
        ? "This terminal code already exists in the selected branch. Choose another code."
        : message.includes("BRANCH_INACTIVE")
          ? "Activate this branch before creating terminals."
          : message.includes("COMPANY_INACTIVE")
            ? "This company is inactive. Activate the company before creating terminals."
            : message.includes("INVALID_TERMINAL_STATUS")
              ? "Choose a valid terminal status."
              : message.includes("INVALID_TERMINAL_TYPE")
                ? "Choose a supported terminal type."
                : message.includes("INVALID_TERMINAL_CODE")
                  ? "Terminal code must use 2–40 letters, numbers, hyphens, or underscores."
                  : message.includes("INVALID_TERMINAL_NAME")
                    ? "Enter a valid terminal name."
                    : message.includes("INSUFFICIENT_PERMISSION")
                      ? "You do not have permission to create terminals."
                      : message || "Unable to create terminal.";
      setError(friendly);
      globalThis.dispatchEvent?.(new CustomEvent("admin-toast", { detail: { message: friendly, tone: "error" } }));
    } finally {
      setBusy(false);
    }
  };
  const saveType = async () => {
    if (!selectedTerminal || !typeValue || typeValue === selectedTerminal.terminal_type) {
      setTypeEditing(false);
      return;
    }
    await run(
      () => changeTerminalType(selectedTerminal.id, typeValue),
      "Terminal type updated.",
    );
    setTypeEditing(false);
  };
  const detail = selectedTerminal && (
    <Modal
      title={`${selectedTerminal.name} · ${selectedTerminal.terminal_code}`}
      wide
      onClose={() => setSelectedTerminalId("")}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <MonitorSmartphone size={21} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{selectedTerminal.terminal_code}</p>
            <p className="truncate text-sm font-bold text-slate-700">Terminal details and device access</p>
          </div>
        </div>
        <div className="flex items-center gap-2"><button type="button" disabled={!permissions.includes("terminal.update")} onClick={() => { setForm({ id: selectedTerminal.id, code: selectedTerminal.terminal_code, name: selectedTerminal.name, branchId: selectedTerminal.branch_id, type: selectedTerminal.terminal_type }); setAddOpen(true); }} className="rounded-lg border px-3 py-2 text-xs font-black">Edit</button><span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wide ${selectedTerminal.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
          <span className="h-2 w-2 rounded-full bg-current" />{selectedTerminal.status === "ACTIVE" ? "Active" : "Disabled"}
        </span></div>
      </div>
      <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2">
        {[
          ["Terminal status", selectedTerminal.status === "ACTIVE" ? "Active" : "Disabled"],
          ["Device", selectedTerminal.registration_status === "REGISTERED" ? "Connected" : selectedTerminal.registration_status === "REVOKED" ? "Revoked" : "Not connected"],
          ["Staff session", staffSessionLoading ? "Checking…" : activeStaffSession?.profiles?.name || "No staff signed in"],
          ["Last seen", formatDate(selectedTerminal.last_seen_at)],
          ["Branch", branchName(selectedTerminal)],
          ["Terminal code", selectedTerminal.terminal_code],
        ].map(([label, value], index) => (
          <div key={label} className={`border-slate-200 bg-slate-50/70 px-4 py-4 ${index % 2 === 0 ? "sm:border-r" : ""} ${index < 4 ? "border-b" : ""}`}>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
            <p className="mt-1.5 truncate text-base font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        {canViewShifts && <section className="mb-5 border-b border-slate-200 pb-5"><h4 className="font-bold text-slate-950">Shift Activity</h4>{shiftActivityError ? <p role="alert" className="mt-2 text-sm text-red-700">{shiftActivityError}</p> : shiftActivity.map(shift => <button key={shift.id} onClick={() => onNavigate?.('cash-shifts', { shiftId: shift.id })} className="flex w-full flex-wrap justify-between gap-2 border-b py-3 text-left text-sm"><span><strong>{shift.shift_number}</strong><span className="block text-xs text-slate-500">{shift.opened_by?.name} · {new Date(shift.opened_at).toLocaleString()}</span></span><span className="font-semibold">{shift.status.replaceAll('_', ' ')}</span></button>)}{!shiftActivityError && !shiftActivity.length && <p className="mt-2 text-sm text-slate-500">No shift history.</p>}</section>}
        <div className="flex items-start gap-3"><div className="rounded-xl bg-slate-100 p-2 text-slate-700"><Settings2 size={19}/></div><div><h4 className="font-black text-slate-950">Hardware / Configuration</h4><p className="mt-1 text-xs font-semibold text-slate-500">Peripheral setup is kept in terminal detail so the list stays focused on operations.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Printer</p><p className="mt-1 text-sm font-bold text-slate-800">No terminal-specific assignment</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Cash drawer</p><p className="mt-1 text-sm font-bold text-slate-800">No terminal-specific assignment</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Scanner</p><p className="mt-1 text-sm font-bold text-slate-800">No terminal-specific assignment</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Customer display</p><p className="mt-1 text-sm font-bold text-slate-800">{selectedTerminal.terminal_type === "CUSTOMER_DISPLAY" ? "This terminal" : "Not this terminal type"}</p></div></div>
      </section>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Terminal type</p>
          {typeEditing ? (
            <select aria-label="Terminal type" value={typeValue} onChange={(event) => setTypeValue(event.target.value)} className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">
              {TERMINAL_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : <p className="mt-1 text-base font-black text-slate-950">{terminalTypeLabel(selectedTerminal.terminal_type)}</p>}
        </div>
        {permissions.includes("terminal.update") && (typeEditing ? <div className="flex gap-2"><button type="button" onClick={() => void saveType()} disabled={busy} className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-black text-white">Save</button><button type="button" onClick={() => setTypeEditing(false)} className="rounded-lg border px-3 py-2 text-xs font-black">Cancel</button></div> : <button type="button" aria-label="Edit terminal type" onClick={() => { setTypeValue(selectedTerminal.terminal_type); setTypeEditing(true); }} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Edit3 size={16} /></button>)}
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 shrink-0 text-amber-600" size={18} />
        <p className="text-xs font-semibold leading-5 text-amber-900">Disabling pauses terminal use. Revoking removes the current device binding and requires a new activation code.</p>
      </div>
      <TerminalStaffAccessEditor terminalId={selectedTerminal.id} branchId={selectedTerminal.branch_id} readOnly={!permissions.includes('terminal.update')} onSaved={(terminal) => { setRows(current => current.map(row => row.id === terminal.id ? { ...row, ...terminal } : row)); setMessage('Terminal staff access updated.'); }} />
      <div className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="font-black text-slate-950">Device assignment history</h4></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{deviceAssignments.length} records</span>
        </div>
        {deviceAssignmentsLoading ? <p className="mt-4 text-sm text-slate-500">Loading device history…</p> : deviceAssignments.length ? <div className="mt-4 space-y-2">{deviceAssignments.map((assignment) => <div key={assignment.assignment_id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-3 text-xs ${assignment.status === "ACTIVE" ? "border border-emerald-200 bg-emerald-50/60" : "bg-slate-50"}`}><div className="min-w-0"><p className="font-black text-slate-800">{assignment.device_name || "Device name not captured"}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{assignment.device_suffix}</p><p className="mt-1 text-slate-500">Assigned {formatDate(assignment.assigned_at)}{assignment.revoked_at ? ` · Revoked ${formatDate(assignment.revoked_at)}` : ""}</p>{!assignment.device_name && <p className="mt-1 text-[11px] font-semibold text-amber-700">This older assignment was created before device names were recorded.</p>}</div><span className={`rounded-full px-2 py-1 font-black ${assignment.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{assignment.status === "ACTIVE" ? "CURRENT DEVICE" : assignment.status}</span></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No device has been assigned yet.</p>}
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="font-black text-slate-950">Terminal activity</h4><p className="mt-1 text-xs font-semibold text-slate-500">Activation, staff session and device security events.</p></div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{terminalAudit.length} events</span>
        </div>
        {terminalAuditLoading ? <p className="mt-4 text-sm text-slate-500">Loading activity…</p> : terminalAudit.length ? <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-2">{terminalAudit.map((event) => <div key={event.id} className="flex gap-2.5 rounded-lg px-1 py-1"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-950" /><div className="min-w-0"><p className="text-xs font-black text-slate-800">{auditLabel(event.action)}</p><p className="text-[11px] font-semibold text-slate-500">{formatDate(event.created_at)}</p></div></div>)}</div> : <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">No recorded activity for this terminal yet.</p>}
      </div>
      <div data-terminal-popover className="mt-7 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div><h4 className="font-black text-slate-950">Device &amp; session management</h4></div>
          <MonitorSmartphone className="text-slate-400" size={19} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Wifi size={15} className={selectedTerminal.registration_status === "REGISTERED" ? "text-emerald-600" : "text-slate-400"}/>Current device</div><strong className="mt-2 block truncate text-sm text-slate-950">{deviceAssignments.find(item => item.status === "ACTIVE")?.device_name || (selectedTerminal.registration_status === "REGISTERED" ? "Connected" : "Unbound")}</strong><p className="mt-1 text-xs text-slate-500">{deviceAssignments.find(item => item.status === "ACTIVE")?.device_suffix}</p><p className="mt-1 text-xs text-slate-500">Activated {formatDate(selectedTerminal.registered_at)}</p></div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><UserRound size={15} className={activeStaffSession ? "text-emerald-600" : "text-slate-400"}/>Staff session</div><strong className="mt-2 block truncate text-sm text-slate-950">{activeStaffSession?.profiles?.name || "No staff signed in"}</strong></div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><Clock size={15} className="text-slate-400"/>Last seen</div><strong className="mt-2 block truncate text-sm text-slate-950">{selectedTerminal.last_seen_at ? formatDate(selectedTerminal.last_seen_at) : "Never"}</strong></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {permissions.includes('terminal.update') && selectedTerminal.registration_status !== 'REGISTERED' && <button type="button" disabled={busy} onClick={() => selectedTerminal.registration_status === 'REVOKED' ? requestAction('REACTIVATE', selectedTerminal) : void issueActivationCode(selectedTerminal)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold"><ShieldAlert size={16}/>{selectedTerminal.registration_status === 'REVOKED' ? 'Reactivate device' : 'Activation code'}</button>}
            {permissions.includes('terminal.update') && permissions.includes('terminal.deactivate') && selectedTerminal.registration_status === 'REGISTERED' && <button type="button" disabled={busy} onClick={() => requestAction('REPLACE', selectedTerminal)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-bold"><RotateCcw size={16}/>Replace device</button>}
            {permissions.includes("terminal.update") && selectedTerminal.registration_status === "REGISTERED" && selectedTerminal.status === "ACTIVE" && <div className="flex items-center gap-1"><button type="button" disabled={!activeStaffSession || busy} onClick={() => requestAction("FORCE_LOGOUT", selectedTerminal)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-800 disabled:cursor-not-allowed disabled:opacity-45"><LogOut size={16}/>Force staff logout</button><button type="button" aria-label="About Force staff logout" onClick={() => setActionInfo(actionInfo === "FORCE_LOGOUT" ? "" : "FORCE_LOGOUT")} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-950"><Info size={16}/></button></div>}
          </div>
          <div className="relative ml-auto">
            <button type="button" disabled={busy} onClick={() => setActionMenuOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-50">More actions <ChevronDown size={16}/></button>
            {actionMenuOpen && <div className="absolute bottom-full right-0 z-10 mb-2 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              {permissions.includes("terminal.deactivate") && selectedTerminal.registration_status === "REGISTERED" && selectedTerminal.status === "ACTIVE" && <div className="flex items-center"><button type="button" onClick={() => requestAction("RESET", selectedTerminal)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={15}/>Unbind device</button><button type="button" aria-label="About Reset POS device" onClick={() => setActionInfo(actionInfo === "RESET" ? "" : "RESET")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><Info size={15}/></button></div>}
              {permissions.includes("terminal.deactivate") && selectedTerminal.registration_status === "REGISTERED" && <div className="flex items-center"><button type="button" onClick={() => requestAction("REVOKE", selectedTerminal)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"><Unplug size={15}/>Revoke device</button><button type="button" aria-label="About Revoke device" onClick={() => setActionInfo(actionInfo === "REVOKE" ? "" : "REVOKE")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><Info size={15}/></button></div>}
              {selectedTerminal.status === "ACTIVE" ? <div className="flex items-center"><button type="button" onClick={() => requestAction("DISABLE", selectedTerminal)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-red-700 hover:bg-red-50"><Ban size={15}/>Disable terminal</button><button type="button" aria-label="About Disable terminal" onClick={() => setActionInfo(actionInfo === "DISABLE" ? "" : "DISABLE")} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><Info size={15}/></button></div> : <button type="button" onClick={() => requestAction("ENABLE", selectedTerminal)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={15}/>Enable terminal</button>}
              {selectedTerminal.status === "ACTIVE" && selectedTerminal.registration_status === "REGISTERED" && (selectedTerminal.lock_status === "LOCKED" ? <button type="button" onClick={() => requestAction("UNLOCK", selectedTerminal)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={15}/>Unlock terminal</button> : <button type="button" onClick={() => requestAction("LOCK", selectedTerminal)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold text-amber-700 hover:bg-amber-50"><ShieldAlert size={15}/>Lock terminal</button>)}
            </div>}
          </div>
        </div>
        {actionInfo && <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950" role="status">
          <Info size={16} className="mt-0.5 shrink-0 text-amber-700" />
          <div><strong className="block">{actionInfo === "REVOKE" ? "Revoke device" : actionInfo === "RESET" ? "Reset POS device" : actionInfo === "FORCE_LOGOUT" ? "Force staff logout" : "Disable terminal"}</strong>{actionInfo === "REVOKE" ? <p>Removes the current device binding and ends its staff sessions. The terminal is revoked; reconcile its open shift before reactivation at <code>/pos/setup</code>.</p> : actionInfo === "RESET" ? <p>Ends staff sessions, revokes the device session, removes the binding, invalidates old credentials, and clears the POS state. The terminal remains active, but the device must be activated again.</p> : actionInfo === "FORCE_LOGOUT" ? <p>Ends only the active staff session. The terminal stays active, the device stays connected, and the POS returns to staff sign-in.</p> : <p>Blocks the terminal, revokes its device and staff sessions, and prevents POS login or operations until an administrator enables it again.</p>}</div>
        </div>}
      </div>
      {confirmAction && <ConfirmActionModal action={confirmAction.action} busy={busy} onCancel={() => setConfirmAction(null)} onConfirm={() => void confirmTerminalAction()} branchName={branchName(selectedTerminal)} staffName={activeStaffSession?.profiles?.name} terminal={selectedTerminal} />}
    </Modal>
  );
  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-2xl font-black text-slate-950">Terminals</h2><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-500">{rows.length} Connected</span></div>
          <p className="mt-1 text-xs text-slate-500">Manage physical POS registers, card readers, and peripherals across {connectedBranches} branches.</p>
        </div>
        <div className="flex items-center gap-2">
          {permissions.includes("terminal.create") && (
          <button
            type="button"
            onClick={() => {
              setForm({
                ...blank,
                branchId: branchId || (branchFilter !== "ALL" ? branchFilter : branches[0]?.id) || "",
              });
              setAddOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            <Plus size={17} />
            Add terminal
          </button>
          )}
        </div>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Total Registered", rows.length, `${connectedBranches} locations`, "text-slate-950"], ["Online & Active", onlineCount, rows.length ? `${Math.round((onlineCount / rows.length) * 100)}% sync` : "0% sync", "text-emerald-700"], ["Pending Pairing", pendingCount, pendingCount ? "Action needed" : "Ready", "text-amber-700"], ["Needs Attention", attentionCount, attentionCount ? "Review required" : "All clear", "text-red-700"]].map(([label, value, note, color]) => <div key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><div className="flex items-center justify-between text-[10px] font-bold text-slate-500"><span>{label}</span><i className={`h-1.5 w-1.5 rounded-full ${color === "text-emerald-700" ? "bg-emerald-500" : color === "text-amber-700" ? "bg-amber-500" : color === "text-red-700" ? "bg-red-500" : "bg-slate-300"}`} /></div><div className="mt-1 flex items-end justify-between"><strong className={`text-2xl font-black ${color}`}>{value}</strong><span className="text-[10px] text-slate-400">{note}</span></div></div>)}
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <label className="relative min-w-64 flex-1">
          <Search size={16} className="absolute left-3 top-3 text-slate-400" />
          <input
            aria-label="Search terminals"
            placeholder="Search terminals…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 pl-9 text-xs outline-none focus:border-slate-400"
          />
        </label>
        <select
          aria-label="Filter terminal branch"
          value={branchFilter}
          onChange={(event) => { setBranchFilter(event.target.value); setSelectedTerminalId(""); setRowMenuId(""); }}
          className="[color-scheme:light] rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        >
          <option value="ALL">All branches</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.code} · {branch.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter terminal status"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="[color-scheme:light] rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        >
          <option value="ALL">All status</option>
          <option>ONLINE</option>
          <option>OFFLINE</option>
          <option>UNKNOWN</option>
          <option>LOCKED</option>
          <option>DISABLED</option>
          <option>PENDING ACTIVATION</option>
          <option>REVOKED</option>
          <option>RETIRED</option>
        </select>
        <select
          aria-label="Filter terminal type"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="[color-scheme:light] rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
        >
          <option value="ALL">All types</option>
          {types.map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p role="status">Loading terminals…</p>
      ) : (
        <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[27%]" />
              <col className="w-[17%]" />
              <col className="w-[11%]" />
              <col className="w-[17%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                {[
                  "Terminal",
                  "Branch",
                  "Type",
                  "Status",
                  "Last seen",
                  "Actions",
                ].map((label) => (
                    <th key={label} className="px-3 py-3.5 text-[10px] font-black tracking-wider text-slate-500">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((terminal) => (
                <tr
                  key={terminal.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setSelectedTerminalId(terminal.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedTerminalId(terminal.id);
                    }
                  }}
                  className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/70 focus:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-400"
                  aria-label={`View details for ${terminal.name}`}
                >
                  <td className="px-3 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${state(terminal) === "ONLINE" ? "bg-emerald-50 text-emerald-700" : state(terminal) === "PENDING ACTIVATION" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}><MonitorSmartphone size={17} /></span><span className="min-w-0"><strong className="block truncate text-[13px] font-bold text-slate-950" title={terminal.name}>{terminal.name}</strong><span className="mt-1 flex min-w-0 items-center gap-1 font-mono text-[10px] text-slate-400"><span className="truncate">#{terminal.terminal_code}</span><button type="button" aria-label={`Copy ${terminal.terminal_code}`} onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(terminal.terminal_code); }} className="shrink-0 text-slate-400 hover:text-slate-900"><Copy size={11}/></button></span></span></div>
                  </td>
                  <td className="px-3 py-3.5"><span className="block truncate text-xs font-semibold text-slate-800" title={branchName(terminal)}>{branchName(terminal)}</span><span className="mt-1 block truncate text-[10px] text-slate-400">{branches.find((branch) => branch.id === terminal.branch_id)?.code || "—"}</span></td>
                  <td className="px-3 py-3.5"><span className={`inline-flex max-w-full truncate rounded-md px-2 py-1 text-[10px] font-bold ${terminal.terminal_type === "BAR" ? "bg-violet-50 text-violet-700" : terminal.terminal_type === "KDS" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`}>{terminalTypeLabel(terminal.terminal_type)}</span></td>
                  <td className="px-3 py-3.5">
                    <span
                      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-bold ${state(terminal) === "ONLINE" || state(terminal) === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : state(terminal) === "PENDING ACTIVATION" ? "bg-amber-50 text-amber-700" : state(terminal) === "REVOKED" || state(terminal) === "RETIRED" || state(terminal) === "OFFLINE" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /><span className="truncate">{operationalLabel(terminal)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-slate-500"><strong className="block truncate text-slate-700">{terminal.last_seen_at ? (Date.now() - new Date(terminal.last_seen_at).getTime() < 120000 ? "Just now" : formatDate(terminal.last_seen_at)) : "Never"}</strong>{terminal.last_seen_at && <span className="mt-1 block truncate text-[10px] text-slate-400">{formatDate(terminal.last_seen_at)}</span>}</td>
                  <td className="relative px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                    <div className="flex min-w-0 items-center justify-end gap-1.5">
                      <button type="button" onClick={() => (permissions.includes("terminal.update") && canIssueActivation(terminal)) ? void issueActivationCode(terminal) : setSelectedTerminalId(terminal.id)} className={`inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[10px] font-bold shadow-sm transition focus:outline-none focus:ring-4 ${(permissions.includes("terminal.update") && canIssueActivation(terminal)) ? "bg-slate-950 text-white hover:bg-slate-800 focus:ring-slate-200" : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 focus:ring-slate-100"}`}>{(permissions.includes("terminal.update") && canIssueActivation(terminal)) ? <ShieldAlert size={13}/> : <Settings2 size={13}/>}<span>{(permissions.includes("terminal.update") && canIssueActivation(terminal)) ? "Activate" : "View"}</span></button>
                      {permissions.includes("terminal.update") && <button type="button" data-terminal-popover aria-label={`More actions for ${terminal.name}`} onClick={() => setRowMenuId(rowMenuId === terminal.id ? "" : terminal.id)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Ellipsis size={17}/></button>}
                    </div>
                    {rowMenuId === terminal.id && permissions.includes("terminal.update") && <div data-terminal-popover className="absolute right-3 top-12 z-30 w-52 rounded-xl border border-slate-200 bg-white p-1 text-left shadow-xl">
                      <button type="button" onClick={() => { setRowMenuId(""); setForm({ id: terminal.id, code: terminal.terminal_code, name: terminal.name, branchId: terminal.branch_id, type: terminal.terminal_type }); setAddOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Edit3 size={14}/>Edit terminal</button>
                      {branches.length > 1 && terminal.status !== "RETIRED" && <label className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={14}/><select aria-label={`Move ${terminal.name}`} value="" onChange={(event) => { setRowMenuId(""); if (event.target.value) void run(() => reassignTerminal(terminal.id, event.target.value), "Terminal moved to another branch."); }} className="min-w-0 flex-1 bg-transparent outline-none"><option value="">Move branch…</option>{branches.filter((branch) => branch.id !== terminal.branch_id).map((branch) => <option key={branch.id} value={branch.id}>{branch.code}</option>)}</select></label>}
                      {permissions.includes("terminal.deactivate") && terminal.registration_status === "REGISTERED" && <button type="button" onClick={() => { setRowMenuId(""); requestAction("REVOKE", terminal); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Unplug size={14}/>Revoke device</button>}
                      {permissions.includes("terminal.deactivate") && terminal.registration_status === "REGISTERED" && terminal.status === "ACTIVE" && <button type="button" onClick={() => { setRowMenuId(""); requestAction("REPLACE", terminal); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={14}/>Replace device</button>}
                      {terminal.status === "ACTIVE" ? <button type="button" onClick={() => { setRowMenuId(""); requestAction("DISABLE", terminal); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Ban size={14}/>Disable terminal</button> : terminal.status === "DISABLED" && <button type="button" onClick={() => { setRowMenuId(""); requestAction("ENABLE", terminal); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50"><CheckCircle2 size={14}/>Enable terminal</button>}
                    </div>}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                    <td colSpan="6" className="p-10 text-center text-slate-500">
                    No terminals match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {addOpen && (
        <Modal title={form.id ? "Edit terminal" : "Add terminal"} onClose={() => setAddOpen(false)}>
          <form onSubmit={createTerminal} className="mt-5 space-y-4">
            <label className="block text-sm font-bold">
              Terminal name
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="Counter 02"
              />
            </label>
            <label className="block text-sm font-bold">
              Terminal code
              <input
                required
                value={form.code}
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value.toUpperCase() })
                }
                className="mt-1 w-full rounded-xl border p-3"
                placeholder="T002"
              />
            </label>
            <label className="block text-sm font-bold">
              Branch
              <select
                required
                disabled={Boolean(branchId) || Boolean(form.id)}
                value={form.branchId}
                onChange={(event) =>
                  setForm({ ...form, branchId: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-3"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.code} · {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-bold">
              Type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value })
                }
                className="mt-1 w-full rounded-xl border p-3"
              >
                {types.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <TerminalStaffAccessEditor terminalId={form.id} branchId={form.branchId} onChange={staffAccess => setForm(current => ({ ...current, staffAccess }))} />
            <div className="flex justify-end gap-3 border-t pt-5">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-xl border px-4 py-3 font-bold"
              >
                Cancel
              </button>
              <button
                disabled={busy || !form.staffAccess || (form.staffAccess.accessMode === 'SELECTED_STAFF' && !form.staffAccess.staffIds.length)}
                className="rounded-xl bg-[#D4AF37] px-4 py-3 font-black"
              >
                {busy ? (form.id ? "Saving…" : "Creating…") : (form.id ? "Save changes" : "Create terminal")}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {activation && (
        <Modal
          title={activation.reused ? "Activation Code" : "Activation Code Generated"}
          onClose={() => setActivation(null)}
        >
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={19} strokeWidth={3} /></span><div><p className="font-black text-emerald-900">{activation.reused ? "Existing code is still active" : "New activation code generated successfully"}</p><p className="text-xs font-semibold text-emerald-700">Enter the code on the actual POS computer or tablet.</p></div></div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Terminal</p><p className="mt-1 text-lg font-black text-slate-950">{activation.terminalCode || "—"}</p></div><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Branch</p><p className="mt-1 text-lg font-black text-slate-950">{branches.find((branch) => branch.id === rows.find((row) => row.id === activation.terminalId)?.branch_id)?.name || "—"}</p></div><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">Status</p><p className="mt-1 font-black uppercase text-amber-700">Waiting for activation</p></div></div>
            <p className="text-sm font-black uppercase tracking-wider text-slate-500">
              Activation code
            </p>
            <p className="rounded-xl bg-slate-950 p-5 text-center font-mono text-4xl font-black tracking-[0.25em] text-[#D4AF37]">
              {String(activation.code || "").replace(/(\d{3})(\d{3})/, "$1 $2")}
            </p>
            <p className="text-sm font-bold text-slate-700">
              Expires in:{" "}
              {String(Math.floor(activationSeconds / 60)).padStart(2, "0")}:
              {String(activationSeconds % 60).padStart(2, "0")}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => { const terminal = rows.find((row) => row.id === activation.terminalId); if (terminal) generateNewActivationCode(terminal); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border p-3 font-black disabled:opacity-50"
            >
              Generate new code
            </button>
            <button
              type="button"
              onClick={() => void copyActivationCode()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border p-3 font-black"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}{" "}
              {copied ? "Code copied" : "Copy code"}
            </button>
            <p className="text-sm text-slate-500">
              Enter this code on the new POS device.
            </p>
            <button
              type="button"
              onClick={() => {
                setActivation(null);
                setCopied(false);
              }}
              className="w-full rounded-xl bg-[#D4AF37] p-3 font-black"
            >
              Done
            </button>
          </div>
        </Modal>
      )}
      {detail}
    </section>
  );
}
