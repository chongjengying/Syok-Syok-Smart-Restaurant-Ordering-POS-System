import { useEffect, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Plus,
  Search,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import {
  Button,
  DataTable,
  Field,
  MetricCard,
  Modal,
  Tag,
  TextInput,
} from "./PreviewUi";

const regional = {
  Malaysia: { currency: "MYR", timezone: "Asia/Kuala_Lumpur" },
  Singapore: { currency: "SGD", timezone: "Asia/Singapore" },
  Thailand: { currency: "THB", timezone: "Asia/Bangkok" },
};
const companyDefaults = (company) => ({
  email: "hello@resto.example.test",
  phone: "+60 3-5555 0123",
  website: "resto.example.test",
  registration: "202401018642",
  country: "Malaysia",
  currency: "MYR",
  timezone: "Asia/Kuala_Lumpur",
  taxType: "SST service tax",
  taxRate: "6",
  receiptFooter: "Thank you for dining with us.",
  receiptCopies: "1",
  ...company,
});

export function CompanyProfileSettings({ company, onSave }) {
  const workspace = usePreviewWorkspace();
  const [draft, setDraft] = useState(() => companyDefaults(company));
  const [tab, setTab] = useState("General");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const uploadRef = useRef(null);
  const initial = companyDefaults(company);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const setDirty = workspace.setDirty;
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const check = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) {
      setError("Enter a valid company email address.");
      return;
    }
    setError("");
    setReview(true);
  };
  const save = () => {
    if (workspace.readOnly) return;
    onSave(draft);
    workspace.recordActivity("COMPANY_UPDATED", draft.name);
    setReview(false);
    setDirty(false);
  };
  const uploadLogo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG, or WebP image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result));
    reader.readAsDataURL(file);
  };
  return (
    <div className="preview-stack">
      <section className="preview-card">
        <div className="preview-company-identity">
          <span className="preview-company-logo">
            {draft.logo ? (
              <img src={draft.logo} alt={`${draft.name} logo`} />
            ) : (
              <Building2 size={28} />
            )}
          </span>
          <div>
            <h2>{draft.name}</h2>
            <p>Company ID: RESTO-001 · {draft.country}</p>
          </div>
          <Tag tone="green">Active company</Tag>
        </div>
        <nav className="preview-tabs" aria-label="Company settings sections">
          {["General", "Regional & tax", "Receipt settings", "Branding"].map(
            (name) => (
              <button
                type="button"
                key={name}
                aria-current={tab === name ? "page" : undefined}
                className={tab === name ? "is-active" : ""}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ),
          )}
        </nav>
        <form className="preview-form" onSubmit={check}>
          {error && (
            <p className="preview-inline-error" role="alert">
              {error}
            </p>
          )}
          <fieldset
            className="preview-form-fieldset"
            disabled={workspace.readOnly}
          >
            {tab === "General" && (
              <>
                <div className="preview-settings-intro">
                  <h2>Company information</h2>
                  <p>
                    Business identity and contact information for receipts,
                    reports, and branch defaults.
                  </p>
                </div>
                <div className="preview-two-columns">
                  {[
                    ["name", "Company name"],
                    ["legalName", "Legal business name"],
                    ["registration", "Registration number"],
                    ["email", "Company email"],
                    ["phone", "Phone number"],
                    ["website", "Website"],
                  ].map(([key, label]) => (
                    <Field key={key} label={label}>
                      <TextInput
                        required={["name", "email"].includes(key)}
                        type={
                          key === "email"
                            ? "email"
                            : key === "phone"
                              ? "tel"
                              : "text"
                        }
                        value={draft[key] || ""}
                        onChange={(event) => update(key, event.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </>
            )}
            {tab === "Regional & tax" && (
              <div className="preview-two-columns">
                <Field label="Country">
                  <select
                    value={draft.country}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        country: event.target.value,
                        ...regional[event.target.value],
                      }))
                    }
                  >
                    {Object.keys(regional).map((country) => (
                      <option key={country}>{country}</option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Currency"
                  hint="Currency follows the selected country."
                >
                  <TextInput value={draft.currency} readOnly />
                </Field>
                <Field label="Timezone">
                  <TextInput value={draft.timezone} readOnly />
                </Field>
                <Field label="Tax type">
                  <select
                    value={draft.taxType}
                    onChange={(event) => update("taxType", event.target.value)}
                  >
                    <option>SST service tax</option>
                    <option>SST sales tax</option>
                    <option>GST</option>
                    <option>VAT</option>
                    <option>Tax exempt</option>
                  </select>
                </Field>
                <Field label="Default tax rate (%)">
                  <TextInput
                    type="number"
                    min="0"
                    max="100"
                    step=".01"
                    value={draft.taxRate}
                    onChange={(event) => update("taxRate", event.target.value)}
                  />
                </Field>
              </div>
            )}
            {tab === "Receipt settings" && (
              <div className="preview-two-columns">
                <Field label="Receipt footer">
                  <textarea
                    rows={4}
                    value={draft.receiptFooter}
                    onChange={(event) =>
                      update("receiptFooter", event.target.value)
                    }
                  />
                </Field>
                <Field label="Receipt copies">
                  <select
                    value={draft.receiptCopies}
                    onChange={(event) =>
                      update("receiptCopies", event.target.value)
                    }
                  >
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                  </select>
                </Field>
              </div>
            )}
            {tab === "Branding" && (
              <div className="preview-brand-preview">
                <span className="preview-company-logo">
                  {draft.logo ? (
                    <img src={draft.logo} alt="Selected company logo" />
                  ) : (
                    <Building2 size={28} />
                  )}
                </span>
                <div>
                  <strong>Company logo</strong>
                  <small>
                    PNG, JPEG, or WebP · up to 2 MB · stored in preview state
                  </small>
                </div>
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={uploadLogo}
                />
                <Button
                  variant="secondary"
                  icon={Upload}
                  onClick={() => uploadRef.current?.click()}
                >
                  Upload logo
                </Button>
              </div>
            )}
          </fieldset>
          <div className="preview-form-footer">
            <span>
              {dirty ? (
                <Tag tone="amber">Unsaved changes</Tag>
              ) : (
                <>
                  <CheckCircle2 size={15} /> All changes saved
                </>
              )}
            </span>
            <div className="preview-row-actions">
              <Button
                variant="secondary"
                disabled={!dirty}
                onClick={() => {
                  setDraft(companyDefaults(company));
                  setError("");
                }}
              >
                Discard
              </Button>
              <Button type="submit" disabled={!dirty || workspace.readOnly}>
                Review changes
              </Button>
            </div>
          </div>
        </form>
      </section>
      <section className="preview-info-card">
        <ShieldCheck size={19} />
        <div>
          <strong>
            Company settings and personal account settings are separate
          </strong>
          <p>
            Manage your name and email under My profile. Company values apply to
            this business workspace.
          </p>
        </div>
      </section>
      {review && (
        <Modal
          title="Save company changes?"
          description="Review the updated company values before saving."
          onClose={() => setReview(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReview(false)}>
                Keep editing
              </Button>
              <Button onClick={save}>Save company settings</Button>
            </>
          }
        >
          <div className="preview-detail-list">
            {Object.keys(draft)
              .filter((key) => draft[key] !== initial[key])
              .map((key) => (
                <div key={key}>
                  <span>{key.replace(/([A-Z])/g, " $1")}</span>
                  <strong>
                    {key === "logo" ? "New company logo" : String(draft[key])}
                  </strong>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function MemberDirectory({
  company,
  members,
  owner,
  branches,
  onInvite,
  onChange,
  notify,
}) {
  const workspace = usePreviewWorkspace();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState("");
  const visible = members.filter(
    (member) =>
      `${member.name} ${member.email} ${member.role}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (status === "All statuses" || status === member.status),
  );
  const save = (event) => {
    event.preventDefault();
    if (workspace.readOnly) return;
    if (
      !editing.name.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email)
    ) {
      setError("Enter a name and valid email.");
      return;
    }
    if (
      owner.email.toLowerCase() === editing.email.toLowerCase() ||
      members.some(
        (member) =>
          member.id !== editing.id &&
          member.email.toLowerCase() === editing.email.toLowerCase(),
      )
    ) {
      setError("That email already belongs to another member.");
      return;
    }
    onChange(
      members.map((member) => (member.id === editing.id ? editing : member)),
    );
    workspace.recordActivity("MEMBER_ACCESS_UPDATED", editing.name);
    setEditing(null);
    notify("Company member access updated.");
  };
  const confirmAction = () => {
    if (workspace.readOnly) return;
    if (confirm.status === "Pending") {
      onChange(
        members.map((member) =>
          member.id === confirm.id
            ? { ...member, lastSent: new Date().toLocaleTimeString("en-GB") }
            : member,
        ),
      );
      workspace.recordActivity("MEMBER_INVITATION_RESENT", confirm.name);
      notify("Sample invitation reminder recorded. No email was sent.");
    } else {
      const next = confirm.status === "Active" ? "Inactive" : "Active";
      onChange(
        members.map((member) =>
          member.id === confirm.id ? { ...member, status: next } : member,
        ),
      );
      workspace.recordActivity("MEMBER_STATUS_CHANGED", confirm.name);
      notify(`Member marked ${next.toLowerCase()}.`);
    }
    setConfirm(null);
  };
  return (
    <div className="preview-stack">
      <div className="preview-stat-grid">
        <MetricCard
          label="Company members"
          value={members.length + 1}
          hint="Including the protected company owner"
          icon={Users}
        />
        <MetricCard
          label="Active access"
          value={
            members.filter((member) => member.status === "Active").length + 1
          }
          hint="Can access the sample workspace"
          icon={ShieldCheck}
        />
        <MetricCard
          label="Pending invitations"
          value={members.filter((member) => member.status === "Pending").length}
          hint="Awaiting invitation acceptance"
          icon={Plus}
        />
      </div>
      <section className="preview-card preview-owner-card">
        <div className="preview-card-heading">
          <span className="preview-avatar preview-avatar-large">
            {owner.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="preview-owner-copy">
            <p className="preview-eyebrow">COMPANY OWNER · PROTECTED</p>
            <h2>{owner.name}</h2>
            <p>{owner.email}</p>
          </div>
          <Tag tone="green">All branches</Tag>
        </div>
        <p className="preview-muted">
          Owner access to {company.name} cannot be removed from the member
          directory. POS staff records and branch PIN access are managed under
          Staff Management.
        </p>
      </section>
      <section className="preview-card preview-flush-card">
        <div className="preview-panel-heading">
          <div>
            <h2>Company membership</h2>
            <p>
              Control workspace access independently from operational staff
              records.
            </p>
          </div>
          <Button icon={Plus} disabled={workspace.readOnly} onClick={onInvite}>
            Invite member
          </Button>
        </div>
        <div className="preview-toolbar">
          <label className="preview-search">
            <Search size={16} />
            <input
              aria-label="Search company members"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a member by name or email…"
            />
          </label>
          <select
            className="preview-select-compact"
            aria-label="Member status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {["All statuses", "Active", "Pending", "Inactive"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <DataTable
          columns={["Member", "Workspace role", "Branch scope", "Status"]}
          rows={visible.map((member) => ({
            _id: member.id,
            Member: member.name,
            "Workspace role": member.role,
            "Branch scope": member.branch,
            Status: member.status,
            _member: member,
          }))}
          renderCell={(row, column) =>
            column === "Member" ? (
              <div className="preview-record-name">
                <strong>{row.Member}</strong>
                <small>{row._member.email}</small>
              </div>
            ) : column === "Status" ? (
              <Tag>{row.Status}</Tag>
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
                  setEditing({ ...row._member });
                  setError("");
                }}
              >
                Edit access
              </Button>
              <Button
                variant="quiet"
                disabled={workspace.readOnly}
                onClick={() => setConfirm(row._member)}
              >
                {row.Status === "Pending"
                  ? "Resend"
                  : row.Status === "Active"
                    ? "Deactivate"
                    : "Reactivate"}
              </Button>
            </>
          )}
        />
      </section>
      {editing && (
        <Modal
          title="Edit member access"
          description={`Company: ${company.name}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="preview-member-edit"
                disabled={workspace.readOnly}
              >
                Save access
              </Button>
            </>
          }
        >
          <form
            id="preview-member-edit"
            className="preview-form"
            onSubmit={save}
          >
            {error && (
              <p role="alert" className="preview-inline-error">
                {error}
              </p>
            )}
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
            <Field label="Email">
              <TextInput
                required
                type="email"
                value={editing.email}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Workspace role">
              <select
                value={editing.role}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
              >
                <option>Company admin</option>
                <option>Branch manager</option>
                <option>Read only</option>
              </select>
            </Field>
            <Field label="Branch scope">
              <select
                value={editing.branch}
                onChange={(event) =>
                  setEditing((current) => ({
                    ...current,
                    branch: event.target.value,
                  }))
                }
              >
                <option>All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id}>{branch.name}</option>
                ))}
              </select>
            </Field>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={
            confirm.status === "Pending"
              ? "Resend this invitation?"
              : `${confirm.status === "Active" ? "Deactivate" : "Reactivate"} member access?`
          }
          description={`${confirm.name} · ${confirm.role} · ${confirm.branch}`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant={confirm.status === "Active" ? "danger" : "primary"}
                onClick={confirmAction}
              >
                Confirm
              </Button>
            </>
          }
        >
          <p className="preview-muted">
            The member record and its access history are retained in the sample
            workspace.
          </p>
        </Modal>
      )}
    </div>
  );
}
