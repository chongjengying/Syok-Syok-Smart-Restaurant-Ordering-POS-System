import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  KeyRound,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  TabletSmartphone,
  Users,
} from "lucide-react";
import { permissionGroups } from "../mockData";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import {
  Button,
  DataTable,
  Field,
  MetricCard,
  Modal,
  Pagination,
  Tag,
  TextInput,
} from "./PreviewUi";

export function RoleManagement({ roles, onChange, notify }) {
  const workspace = usePreviewWorkspace();
  const [selected, setSelected] = useState("Branch Manager");
  const [draft, setDraft] = useState(() => ({ ...roles["Branch Manager"] }));
  const [review, setReview] = useState(false);
  const [newRole, setNewRole] = useState(null);
  const [error, setError] = useState("");
  const [pendingRole, setPendingRole] = useState(null);
  const saved = roles[selected] || {};
  const changed = permissionGroups
    .flatMap((group) => group.permissions)
    .filter(
      (permission) => Boolean(draft[permission]) !== Boolean(saved[permission]),
    );
  const dirty = changed.length > 0;
  const setDirty = workspace.setDirty;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const selectRole = (name) => {
    if (dirty) {
      setPendingRole(name);
      return;
    }
    setSelected(name);
    setDraft({ ...roles[name] });
  };
  const save = () => {
    if (workspace.readOnly || selected === "Company owner") return;
    onChange({ ...roles, [selected]: { ...draft } });
    workspace.recordActivity(
      "ROLE_PERMISSIONS_UPDATED",
      selected,
      changed.join(", "),
    );
    setReview(false);
    notify("Role permissions saved in the sample workspace.");
  };
  const create = (event) => {
    event.preventDefault();
    const name = newRole.trim();
    if (
      !name ||
      Object.keys(roles).some(
        (role) => role.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("Choose a unique role name.");
      return;
    }
    if (workspace.readOnly) return;
    onChange({ ...roles, [name]: {} });
    setSelected(name);
    setDraft({});
    setNewRole(null);
    workspace.recordActivity("ROLE_CREATED", name);
  };
  return (
    <div className="preview-role-layout">
      <section className="preview-card preview-role-list">
        <div className="preview-section-heading">
          <div>
            <h2>Access profiles</h2>
            <p>{Object.keys(roles).length} company roles</p>
          </div>
          <Button
            variant="secondary"
            icon={Plus}
            disabled={workspace.readOnly || dirty}
            onClick={() => {
              setNewRole("");
              setError("");
            }}
          >
            New role
          </Button>
        </div>
        {Object.keys(roles).map((name) => (
          <button
            key={name}
            type="button"
            className={`preview-role-option ${selected === name ? "is-selected" : ""}`}
            onClick={() => selectRole(name)}
          >
            <span className="preview-role-icon">
              <Shield size={18} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>
                {name === "Company owner"
                  ? "Protected · full workspace access"
                  : "Company role · assigned branch scope"}
              </small>
            </span>
            <span className="preview-role-count">
              {Object.values(roles[name]).filter(Boolean).length}
            </span>
          </button>
        ))}
      </section>
      <section className="preview-card preview-permission-card">
        <div className="preview-section-heading">
          <div>
            <p className="preview-eyebrow">TASK-BASED PERMISSIONS</p>
            <h2>{selected}</h2>
            <p>
              {Object.values(draft).filter(Boolean).length} permissions enabled
              · access is limited to assigned branches
            </p>
          </div>
          <Tag tone={dirty ? "amber" : "green"}>
            {dirty ? `${changed.length} unsaved changes` : "Saved"}
          </Tag>
        </div>
        {permissionGroups.map((group) => (
          <fieldset
            key={group.name}
            className="preview-permission-group"
            disabled={selected === "Company owner" || workspace.readOnly}
          >
            <legend>{group.name}</legend>
            {group.permissions.map((permission) => (
              <label key={permission} className="preview-permission-row">
                <span>
                  <strong>{permission}</strong>
                  <small>
                    {/refund|discount/.test(permission)
                      ? "Financial permission · review before granting access."
                      : `Allow this role to ${permission.toLowerCase()} within assigned branches.`}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(draft[permission])}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [permission]: event.target.checked,
                    }))
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}
        <div className="preview-guard-note">
          <ShieldCheck size={18} />
          <span>
            {selected === "Company owner"
              ? "Owner permissions are protected."
              : "This role editor demonstrates local access configuration. Production authorization remains enforced by the existing backend."}
          </span>
        </div>
        <div className="preview-form-footer">
          <Button
            variant="secondary"
            disabled={!dirty}
            onClick={() => setDraft({ ...saved })}
          >
            Discard
          </Button>
          <Button
            disabled={!dirty || workspace.readOnly}
            onClick={() => setReview(true)}
          >
            Review changes
          </Button>
        </div>
      </section>
      {review && (
        <Modal
          title="Review role changes"
          description={`${selected} · assigned branches only`}
          onClose={() => setReview(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReview(false)}>
                Keep editing
              </Button>
              <Button onClick={save}>Confirm permission changes</Button>
            </>
          }
        >
          <div className="preview-detail-list">
            {changed.map((permission) => (
              <div key={permission}>
                <strong>{permission}</strong>
                <Tag tone={draft[permission] ? "green" : "red"}>
                  {draft[permission] ? "Granted" : "Removed"}
                </Tag>
              </div>
            ))}
          </div>
          <p className="preview-muted">
            Sensitive financial permissions can affect refunds and discounts.
            Review the role before saving.
          </p>
        </Modal>
      )}
      {newRole !== null && (
        <Modal
          title="Create a role"
          description="Start with no permissions, then select the tasks this role can perform."
          onClose={() => setNewRole(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setNewRole(null)}>
                Cancel
              </Button>
              <Button type="submit" form="preview-new-role">
                Create role
              </Button>
            </>
          }
        >
          <form
            id="preview-new-role"
            onSubmit={create}
            className="preview-form"
          >
            {error && (
              <p role="alert" className="preview-inline-error">
                {error}
              </p>
            )}
            <Field label="Role name">
              <TextInput
                required
                maxLength={48}
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
              />
            </Field>
          </form>
        </Modal>
      )}
      {pendingRole && (
        <Modal
          title="Discard permission changes?"
          description="Save or discard the current role before opening another role."
          onClose={() => setPendingRole(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingRole(null)}>
                Keep editing
              </Button>
              <Button
                onClick={() => {
                  setSelected(pendingRole);
                  setDraft({ ...roles[pendingRole] });
                  setPendingRole(null);
                }}
              >
                Discard & switch
              </Button>
            </>
          }
        >
          <p className="preview-muted">
            {changed.length} changes to {selected} have not been saved.
          </p>
        </Modal>
      )}
    </div>
  );
}

export function StaffDirectory({ staff, onChange, branches, roles, notify }) {
  const workspace = usePreviewWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [role, setRole] = useState("All roles");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState("");
  const scope = staff.filter(
    (person) =>
      workspace.branch === "All branches" ||
      [person.branch, ...(person.additionalBranches || [])].includes(
        workspace.branch,
      ),
  );
  const rows = scope.filter(
    (person) =>
      `${person.name} ${person.email} ${person.employeeId} ${person.role}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || person.status === status) &&
      (role === "All roles" || person.role === role),
  );
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 5)));
  const roleNames = [
    ...new Set([
      ...Object.keys(roles).filter((name) => name !== "Company owner"),
      "Waiter",
    ]),
  ];
  const save = (event) => {
    event.preventDefault();
    if (workspace.readOnly) return;
    if (!editing.name.trim() || !editing.employeeId.trim()) {
      setError("Name and employee ID are required.");
      return;
    }
    if (
      staff.some(
        (person) =>
          person.id !== editing.id &&
          person.employeeId.toLowerCase() === editing.employeeId.toLowerCase(),
      )
    ) {
      setError("Employee ID must be unique.");
      return;
    }
    const next = {
      ...editing,
      name: editing.name.trim(),
      employeeId: editing.employeeId.trim().toUpperCase(),
      additionalBranches: (editing.additionalBranches || []).filter(
        (name) => name !== editing.branch,
      ),
    };
    onChange(staff.map((person) => (person.id === next.id ? next : person)));
    workspace.recordActivity(
      "STAFF_ACCESS_UPDATED",
      `${next.employeeId} · ${next.name}`,
    );
    setEditing(null);
    notify("Staff role, branch assignments, and POS access saved.");
  };
  const act = () => {
    if (workspace.readOnly) return;
    const updates =
      confirm.action === "pin"
        ? {
            pinReady: true,
            status:
              confirm.person.status === "Pending"
                ? "Active"
                : confirm.person.status,
          }
        : {
            status:
              confirm.person.status === "Inactive"
                ? confirm.person.pinReady
                  ? "Active"
                  : "Pending"
                : "Inactive",
          };
    onChange(
      staff.map((person) =>
        person.id === confirm.person.id ? { ...person, ...updates } : person,
      ),
    );
    workspace.recordActivity(
      confirm.action === "pin"
        ? "STAFF_PIN_SETUP_SIMULATED"
        : "STAFF_STATUS_CHANGED",
      confirm.person.employeeId,
    );
    notify(
      confirm.action === "pin"
        ? "Sample PIN setup marked ready. No PIN was generated or saved."
        : "Staff status updated with record history retained.",
    );
    setConfirm(null);
  };
  return (
    <div className="preview-stack">
      <div className="preview-stat-grid">
        <MetricCard
          label="Staff records"
          value={scope.length}
          hint={`${workspace.branch} · operational staff`}
          icon={Users}
        />
        <MetricCard
          label="POS ready"
          value={
            scope.filter(
              (person) =>
                person.status === "Active" &&
                person.pinReady &&
                person.posAccess,
            ).length
          }
          hint="Active, branch assigned, and PIN ready"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Setup required"
          value={scope.filter((person) => !person.pinReady).length}
          hint="Complete PIN onboarding before POS use"
          icon={KeyRound}
        />
      </div>
      <section className="preview-info-card">
        <ShieldCheck size={19} />
        <div>
          <strong>Staff record → branch access → role → PIN → POS</strong>
          <p>
            Staff records are separate from company members. Employee ID and PIN
            identify the person at an authorized branch terminal. This preview
            simulates setup without storing a PIN.
          </p>
        </div>
      </section>
      <section className="preview-card preview-flush-card">
        <div className="preview-panel-heading">
          <div>
            <h2>Staff Management</h2>
            <p>
              Primary branch, additional branches, and POS access in one place.
            </p>
          </div>
          <Tag>{workspace.branch}</Tag>
        </div>
        <div className="preview-toolbar">
          <label className="preview-search">
            <Search size={16} />
            <input
              aria-label="Search staff"
              placeholder="Find name or employee ID…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Staff role"
            className="preview-select-compact"
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            {["All roles", ...roleNames].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <select
            aria-label="Staff status"
            className="preview-select-compact"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {["All statuses", "Active", "Pending", "Inactive"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <DataTable
          columns={[
            "Staff member",
            "Role",
            "Branch access",
            "POS setup",
            "Status",
          ]}
          rows={rows.slice((safePage - 1) * 5, safePage * 5).map((person) => ({
            _id: person.id,
            "Staff member": person.name,
            Role: person.role,
            "Branch access": [
              person.branch,
              ...(person.additionalBranches || []),
            ].join(", "),
            "POS setup": !person.posAccess
              ? "POS disabled"
              : person.pinReady
                ? "PIN ready"
                : "PIN setup required",
            Status: person.status,
            _person: person,
          }))}
          renderCell={(row, column) =>
            column === "Staff member" ? (
              <div className="preview-record-name">
                <strong>{row[column]}</strong>
                <small>
                  {row._person.employeeId} ·{" "}
                  {row._person.email || "No email required"}
                </small>
              </div>
            ) : column === "Status" ? (
              <Tag>{row.Status}</Tag>
            ) : column === "POS setup" ? (
              <Tag
                tone={
                  row._person.posAccess && row._person.pinReady
                    ? "green"
                    : "amber"
                }
              >
                {row[column]}
              </Tag>
            ) : (
              row[column]
            )
          }
          actions={(row) => (
            <>
              <Button
                variant="quiet"
                disabled={workspace.readOnly}
                onClick={() => {
                  setEditing({ ...row._person });
                  setError("");
                }}
              >
                Edit access
              </Button>
              <Button
                variant="quiet"
                disabled={workspace.readOnly}
                onClick={() =>
                  setConfirm({ person: row._person, action: "pin" })
                }
              >
                {row._person.pinReady ? "Reset PIN" : "Set up PIN"}
              </Button>
              <Button
                variant="quiet"
                disabled={workspace.readOnly}
                onClick={() =>
                  setConfirm({ person: row._person, action: "status" })
                }
              >
                {row.Status === "Inactive" ? "Reactivate" : "Deactivate"}
              </Button>
            </>
          )}
        />
        <Pagination
          page={safePage}
          count={rows.length}
          pageSize={5}
          onChange={setPage}
        />
      </section>
      {editing && (
        <Modal
          title="Edit staff access"
          description={`${editing.employeeId} · operational staff record`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" form="preview-staff-access">
                Save staff access
              </Button>
            </>
          }
        >
          <form
            id="preview-staff-access"
            className="preview-form"
            onSubmit={save}
          >
            {error && (
              <p role="alert" className="preview-inline-error">
                {error}
              </p>
            )}
            <div className="preview-two-columns">
              <Field label="Full name">
                <TextInput
                  required
                  value={editing.name}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Employee ID">
                <TextInput
                  required
                  value={editing.employeeId}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      employeeId: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Role">
                <select
                  value={editing.role}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                >
                  {roleNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Primary branch">
                <select
                  value={editing.branch}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      branch: event.target.value,
                    }))
                  }
                >
                  {branches.map((branch) => (
                    <option key={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset className="preview-permission-group">
              <legend>Additional branch access</legend>
              {branches
                .filter((branch) => branch.name !== editing.branch)
                .map((branch) => (
                  <label key={branch.id} className="preview-checkbox">
                    <input
                      type="checkbox"
                      checked={(editing.additionalBranches || []).includes(
                        branch.name,
                      )}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          additionalBranches: event.target.checked
                            ? [
                                ...(current.additionalBranches || []),
                                branch.name,
                              ]
                            : (current.additionalBranches || []).filter(
                                (name) => name !== branch.name,
                              ),
                        }))
                      }
                    />
                    {branch.name}
                  </label>
                ))}
            </fieldset>
            <label className="preview-checkbox">
              <input
                type="checkbox"
                checked={editing.posAccess}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    posAccess: event.target.checked,
                  }))
                }
              />
              Allow POS access at assigned branches
            </label>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.action === "pin"
              ? `${confirm.person.pinReady ? "Reset" : "Set up"} sample PIN?`
              : `${confirm.person.status === "Inactive" ? "Reactivate" : "Deactivate"} staff?`
          }
          description={`${confirm.person.name} · ${confirm.person.branch}`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={
                  confirm.action === "status" &&
                  confirm.person.status !== "Inactive"
                    ? "danger"
                    : "primary"
                }
                onClick={act}
              >
                Confirm{" "}
                {confirm.action === "pin"
                  ? "sample PIN setup"
                  : "status change"}
              </Button>
            </>
          }
        >
          <p className="preview-muted">
            {confirm.action === "pin"
              ? "This marks the sample record PIN-ready. No credential is generated, entered, stored, or sent."
              : "The staff record and branch history are retained."}
          </p>
        </Modal>
      )}
    </div>
  );
}

export function DeviceRegistry({ devices, onChange, branches, notify }) {
  const workspace = usePreviewWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);
  const [codeInput, setCodeInput] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [selected]);
  const scoped = devices.filter(
    (device) =>
      workspace.branch === "All branches" || device.branch === workspace.branch,
  );
  const rows = scoped.filter(
    (device) =>
      `${device.name} ${device.code} ${device.branch}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || device.status === status),
  );
  const current = devices.find((device) => device.id === selected);
  const updateDevice = (device, values, event) => {
    onChange(
      devices.map((row) =>
        row.id === device.id
          ? {
              ...row,
              ...values,
              history: [
                ...(row.history || []),
                { action: event, at: new Date().toLocaleString("en-GB") },
              ],
            }
          : row,
      ),
    );
    workspace.recordActivity(event, `${device.code} · ${device.branch}`);
  };
  const issue = () => {
    if (workspace.readOnly) return;
    if (
      !branches.some(
        (branch) =>
          branch.name === current.branch && branch.status === "Active",
      )
    ) {
      setError("Activate the branch before issuing a terminal code.");
      return;
    }
    const activationCode = String(100000 + Math.floor(Math.random() * 900000));
    updateDevice(
      current,
      { activationCode, expiresAt: Date.now() + 10 * 60 * 1000 },
      "TERMINAL_CODE_ISSUED",
    );
    setNow(Date.now());
    setError("");
    notify("Temporary sample code issued for 10 minutes.");
  };
  const activate = (event) => {
    event.preventDefault();
    if (workspace.readOnly) return;
    if (!current.activationCode || current.expiresAt <= Date.now()) {
      setError("The sample code has expired. Issue a new code.");
      return;
    }
    if (codeInput.replace(/\s/g, "") !== current.activationCode) {
      setError("The entered code does not match this terminal.");
      return;
    }
    if (!deviceName.trim()) {
      setError("Enter the physical device name.");
      return;
    }
    updateDevice(
      current,
      {
        status: "Active",
        activationCode: null,
        expiresAt: null,
        hardware: deviceName.trim(),
        lastSeen: "Just now",
      },
      "TERMINAL_ACTIVATED",
    );
    setCodeInput("");
    setError("");
    notify("Sample device bound. Code consumed; terminal is active.");
  };
  const confirm = () => {
    if (workspace.readOnly) return;
    if (
      workspace.modules["cash-shifts"].some(
        (shift) =>
          shift.Status === "Open" &&
          shift["Branch / terminal"] === `${current.branch} · ${current.code}`,
      )
    ) {
      setError(
        "Close and reconcile the open register before changing this terminal.",
      );
      return;
    }
    const next =
      action === "disable"
        ? "Disabled"
        : action === "revoke"
          ? "Revoked"
          : "Pending";
    updateDevice(
      current,
      {
        status: next,
        activationCode: null,
        expiresAt: null,
        ...(next === "Pending"
          ? { hardware: null, lastSeen: "Not activated" }
          : {}),
      },
      `TERMINAL_${action.toUpperCase()}`,
    );
    setAction(null);
    setError("");
    notify(`Terminal ${next.toLowerCase()}. Historical assignments retained.`);
  };
  return (
    <div className="preview-stack">
      <div className="preview-stat-grid">
        <MetricCard
          label="Registered terminals"
          value={scoped.length}
          hint={`${workspace.branch} · historical records retained`}
          icon={TabletSmartphone}
        />
        <MetricCard
          label="Active devices"
          value={scoped.filter((device) => device.status === "Active").length}
          hint="Assigned and ready for staff sign-in"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Awaiting activation"
          value={scoped.filter((device) => device.status === "Pending").length}
          hint="Issue a code, then bind the physical device"
          icon={Clock3}
        />
      </div>
      <section className="preview-card">
        <ol className="preview-lifecycle">
          {[
            "Choose branch & terminal",
            "Issue temporary code",
            "Activate physical device",
            "Confirm assignment",
          ].map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <section className="preview-card preview-flush-card">
        <div className="preview-panel-heading">
          <div>
            <h2>Terminal & device registry</h2>
            <p>
              Terminal identity stays intact when physical hardware is replaced.
            </p>
          </div>
          <Tag>{workspace.branch}</Tag>
        </div>
        <div className="preview-toolbar">
          <label className="preview-search">
            <Search size={16} />
            <input
              aria-label="Search devices"
              placeholder="Find terminal, code, or device…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Device status"
            className="preview-select-compact"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["All statuses", "Active", "Pending", "Revoked", "Disabled"].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </div>
        <DataTable
          columns={["Terminal", "Type", "Branch", "Status", "Last seen"]}
          rows={rows.map((device) => ({
            _id: device.id,
            Terminal: device.name,
            Type: device.type,
            Branch: device.branch,
            Status: device.status,
            "Last seen": device.lastSeen,
            _device: device,
          }))}
          renderCell={(row, column) =>
            column === "Terminal" ? (
              <div className="preview-record-name">
                <strong>{row.Terminal}</strong>
                <small>{row._device.code}</small>
              </div>
            ) : column === "Status" ? (
              <Tag>{row.Status}</Tag>
            ) : (
              row[column]
            )
          }
          actions={(row) => (
            <Button
              variant="quiet"
              onClick={() => {
                setSelected(row._device.id);
                setCodeInput("");
                setDeviceName("");
                setError("");
              }}
            >
              Manage terminal
            </Button>
          )}
        />
      </section>
      {current && (
        <Modal
          wide
          title={current.name}
          description={`${current.code} · ${current.branch} · ${current.type}`}
          onClose={() => {
            setSelected(null);
            setAction(null);
          }}
          footer={
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Done
            </Button>
          }
        >
          <div className="preview-stack">
            <div className="preview-detail-list">
              <div>
                <span>Terminal status</span>
                <Tag>{current.status}</Tag>
              </div>
              <div>
                <span>Assigned hardware</span>
                <strong>
                  {current.hardware ||
                    (current.status === "Active"
                      ? `${current.name} · sample iPad`
                      : "Not assigned")}
                </strong>
              </div>
            </div>
            {error && (
              <p className="preview-inline-error" role="alert">
                {error}
              </p>
            )}
            {current.status === "Pending" && (
              <section className="preview-activation">
                <h3>Activate this terminal</h3>
                <p className="preview-muted">
                  Use this temporary sample code on the selected physical
                  device. It can be consumed once.
                </p>
                {current.activationCode && (
                  <div className="preview-activation-code">
                    <strong>
                      {current.activationCode.slice(0, 3)}{" "}
                      {current.activationCode.slice(3)}
                    </strong>
                    <Tag tone={current.expiresAt > now ? "green" : "red"}>
                      {current.expiresAt > now
                        ? `Expires in ${Math.ceil((current.expiresAt - now) / 60000)} min`
                        : "Expired"}
                    </Tag>
                  </div>
                )}
                <Button
                  variant="secondary"
                  disabled={workspace.readOnly}
                  onClick={issue}
                >
                  {current.activationCode
                    ? "Issue replacement code"
                    : "Issue activation code"}
                </Button>
                {current.activationCode && (
                  <form className="preview-form" onSubmit={activate}>
                    <Field label="Physical device name">
                      <TextInput
                        value={deviceName}
                        placeholder="e.g. Counter iPad 2026"
                        onChange={(event) => setDeviceName(event.target.value)}
                        required
                      />
                    </Field>
                    <Field label="Enter sample activation code">
                      <TextInput
                        inputMode="numeric"
                        maxLength={7}
                        value={codeInput}
                        onChange={(event) => setCodeInput(event.target.value)}
                        required
                      />
                    </Field>
                    <Button
                      type="submit"
                      disabled={workspace.readOnly || current.expiresAt <= now}
                    >
                      Activate sample device
                    </Button>
                  </form>
                )}
              </section>
            )}
            {action ? (
              <section className="preview-confirm-box">
                <div>
                  <h3>
                    {action === "replace"
                      ? "Replace physical hardware?"
                      : action === "revoke"
                        ? "Revoke current device access?"
                        : action === "disable"
                          ? "Disable this terminal?"
                          : "Return to pending activation?"}
                  </h3>
                  <p>
                    The terminal identity, transactions, and assignment history
                    are retained.{" "}
                    {action === "replace" || action === "enable"
                      ? "A fresh code is required for activation."
                      : "Current device access becomes unavailable."}
                  </p>
                  <div className="preview-row-actions">
                    <Button variant="secondary" onClick={() => setAction(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant={
                        ["disable", "revoke"].includes(action)
                          ? "danger"
                          : "primary"
                      }
                      onClick={confirm}
                    >
                      Confirm {action}
                    </Button>
                  </div>
                </div>
              </section>
            ) : (
              <div className="preview-row-actions">
                {current.status === "Active" && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={workspace.readOnly}
                      onClick={() => setAction("replace")}
                    >
                      Replace hardware
                    </Button>
                    <Button
                      variant="danger"
                      disabled={workspace.readOnly}
                      onClick={() => setAction("revoke")}
                    >
                      Revoke device
                    </Button>
                  </>
                )}
                {current.status !== "Disabled" ? (
                  <Button
                    variant="secondary"
                    disabled={workspace.readOnly}
                    onClick={() => setAction("disable")}
                  >
                    Disable terminal
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={workspace.readOnly}
                    onClick={() => setAction("enable")}
                  >
                    Enable for activation
                  </Button>
                )}
                {current.status === "Revoked" && (
                  <Button
                    disabled={workspace.readOnly}
                    onClick={() => setAction("enable")}
                  >
                    Reactivate terminal
                  </Button>
                )}
              </div>
            )}
            <section>
              <h3>Assignment history</h3>
              {(current.history || []).length ? (
                <div className="preview-detail-list">
                  {[...current.history].reverse().map((entry, index) => (
                    <div key={index}>
                      <strong>
                        {entry.action.replaceAll("_", " ").toLowerCase()}
                      </strong>
                      <span>{entry.at}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="preview-muted">
                  No new assignment events in this preview session.
                </p>
              )}
            </section>
            <p className="preview-hint">
              This is a lifecycle simulation using mock data. The current
              production architecture still uses Auth-backed profiles and
              registered terminals.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
