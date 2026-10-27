import { useEffect, useState } from "react";
import {
  Activity,
  Check,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { Button, Field, MetricCard, Modal, Tag, TextInput } from "./PreviewUi";

const settingTabs = ["Business", "Tax & regional", "Receipts", "Ordering"];

export function RestaurantSettings({
  notify,
  qrOnly = false,
  initialTab = "Business",
}) {
  const workspace = usePreviewWorkspace();
  const [draft, setDraft] = useState(workspace.settings);
  const [tab, setTab] = useState(initialTab);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const setDirty = workspace.setDirty;
  const dirty = JSON.stringify(draft) !== JSON.stringify(workspace.settings);
  useEffect(() => {
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
  const update = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    const result = workspace.saveSettings(draft);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirm(false);
    notify(
      qrOnly
        ? "QR payment configuration saved locally."
        : "Restaurant settings saved locally.",
    );
  };
  const review = (event) => {
    event.preventDefault();
    if (
      !draft.name.trim() ||
      !/^[A-Z0-9]{1,10}$/.test(draft.orderPrefix) ||
      Number(draft.taxRate) < 0 ||
      Number(draft.taxRate) > 100 ||
      Number(draft.serviceRate) < 0 ||
      Number(draft.serviceRate) > 100
    ) {
      setError(
        "Enter a business name, an order prefix using 1–10 letters/numbers, and tax/service rates from 0 to 100.",
      );
      return;
    }
    setError("");
    setConfirm(true);
  };
  return (
    <div className="preview-settings-layout">
      <aside className="preview-settings-nav">
        <span className="preview-eyebrow">
          {qrOnly ? "CHECKOUT" : "CONFIGURATION"}
        </span>
        {(qrOnly
          ? ["Merchant identity", "Payment instructions"]
          : settingTabs
        ).map((name) => (
          <button
            type="button"
            key={name}
            className={
              tab === name ||
              (qrOnly && tab === "Business" && name === "Merchant identity")
                ? "is-active"
                : ""
            }
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
        <p>
          Company defaults apply to new branches. Existing branch overrides stay
          visible in branch settings.
        </p>
      </aside>
      <section className="preview-card">
        <div className="preview-section-heading">
          <div>
            <h2>
              {qrOnly
                ? "DuitNow QR configuration"
                : tab === "Business"
                  ? "Business identity"
                  : tab}
            </h2>
            <p>
              {qrOnly
                ? "A sample merchant configuration for the checkout experience."
                : "Review the values used by your restaurant workspace."}
            </p>
          </div>
          <Tag tone={dirty ? "amber" : "green"}>
            {dirty ? "Unsaved changes" : "Saved"}
          </Tag>
        </div>
        {error && (
          <p className="preview-inline-error" role="alert">
            {error}
          </p>
        )}
        <form className="preview-form" onSubmit={review}>
          <fieldset
            disabled={!workspace.can("Edit company settings")}
            className="preview-form-fieldset"
          >
            {qrOnly ? (
              <>
                <div className="preview-qr-layout">
                  <div
                    className="preview-sample-qr"
                    role="img"
                    aria-label="Decorative, non-payable sample QR"
                  >
                    <span />
                    <span />
                    <span />
                    <CreditCard size={27} />
                  </div>
                  <div>
                    <h3>Payment QR</h3>
                    <p className="preview-muted">
                      Sample QR · not a payment code
                    </p>
                    <Tag tone={draft.qrEnabled ? "green" : "neutral"}>
                      {draft.qrEnabled
                        ? "Enabled at checkout"
                        : "Disabled at checkout"}
                    </Tag>
                  </div>
                </div>
                <div className="preview-two-columns">
                  {tab !== "Payment instructions" && (
                    <>
                      <Field label="Merchant display name">
                        <TextInput
                          required
                          value={draft.merchantName}
                          onChange={(event) =>
                            update("merchantName", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Sample merchant identifier">
                        <TextInput
                          required
                          value={draft.merchantId}
                          onChange={(event) =>
                            update("merchantId", event.target.value)
                          }
                        />
                      </Field>
                    </>
                  )}
                  {tab === "Payment instructions" && (
                    <>
                      <Field label="Payment confirmation">
                        <select
                          value={draft.confirmation}
                          onChange={(event) =>
                            update("confirmation", event.target.value)
                          }
                        >
                          <option>Cashier confirmation</option>
                          <option>Provider confirmation</option>
                        </select>
                      </Field>
                      <Field label="Checkout availability">
                        <select
                          value={String(draft.qrEnabled)}
                          onChange={(event) =>
                            update("qrEnabled", event.target.value === "true")
                          }
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      </Field>
                      <p className="preview-note-box preview-span-two">
                        Checkout displays the saved merchant identity and
                        confirmation method. This sample QR cannot collect
                        money.
                      </p>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {tab === "Business" && (
                  <div className="preview-two-columns">
                    <Field label="Restaurant name">
                      <TextInput
                        required
                        value={draft.name}
                        onChange={(event) => update("name", event.target.value)}
                      />
                    </Field>
                    <Field label="Order number prefix">
                      <TextInput
                        required
                        maxLength={10}
                        value={draft.orderPrefix}
                        onChange={(event) =>
                          update(
                            "orderPrefix",
                            event.target.value.toUpperCase(),
                          )
                        }
                      />
                    </Field>
                    <Field
                      label="Sample currency"
                      hint="This preview uses MYR amounts. Company regional defaults are managed in Company settings."
                    >
                      <select
                        value={draft.currency}
                        onChange={(event) =>
                          update("currency", event.target.value)
                        }
                      >
                        <option>MYR</option>
                      </select>
                    </Field>
                    <Field label="Timezone">
                      <select
                        value={draft.timezone}
                        onChange={(event) =>
                          update("timezone", event.target.value)
                        }
                      >
                        <option>Asia/Kuala_Lumpur</option>
                        <option>Asia/Singapore</option>
                        <option>Asia/Bangkok</option>
                      </select>
                    </Field>
                  </div>
                )}
                {tab === "Tax & regional" && (
                  <>
                    <div className="preview-two-columns">
                      <Field label="Tax rate (%)">
                        <TextInput
                          type="number"
                          min="0"
                          max="100"
                          step=".01"
                          value={draft.taxRate}
                          onChange={(event) =>
                            update("taxRate", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Service charge (%)">
                        <TextInput
                          type="number"
                          min="0"
                          max="100"
                          step=".01"
                          value={draft.serviceRate}
                          onChange={(event) =>
                            update("serviceRate", event.target.value)
                          }
                        />
                      </Field>
                    </div>
                    <p className="preview-note-box">
                      Tax is calculated after eligible discounts. Sample order
                      totals use the saved rate.
                    </p>
                  </>
                )}
                {tab === "Receipts" && (
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
                    <Field label="Copies">
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
                {tab === "Ordering" && (
                  <div className="preview-toggle-list">
                    {[
                      [
                        "allowTakeaway",
                        "Allow takeaway orders",
                        "Let the team place orders without a dining table.",
                      ],
                      [
                        "requireManagerApproval",
                        "Manager approval for sensitive actions",
                        "Review refunds, voids, and exceptional discounts.",
                      ],
                    ].map(([key, title, description]) => (
                      <label key={key}>
                        <span>
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </span>
                        <input
                          type="checkbox"
                          checked={draft[key]}
                          onChange={(event) =>
                            update(key, event.target.checked)
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </fieldset>
          <div className="preview-form-footer">
            <span>
              {dirty ? (
                "You have unsaved changes."
              ) : (
                <>
                  <Check size={14} /> All changes saved
                </>
              )}
            </span>
            <div className="preview-row-actions">
              <Button
                variant="secondary"
                disabled={!dirty}
                onClick={() => {
                  setDraft(workspace.settings);
                  setError("");
                }}
              >
                Discard
              </Button>
              <Button
                type="submit"
                disabled={!dirty || !workspace.can("Edit company settings")}
              >
                Review changes
              </Button>
            </div>
          </div>
        </form>
      </section>
      {confirm && (
        <Modal
          title="Save configuration changes?"
          description="Review the values that will be used in this sample workspace."
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Keep editing
              </Button>
              <Button onClick={save}>Save changes</Button>
            </>
          }
        >
          <div className="preview-detail-list">
            {Object.keys(draft)
              .filter((key) => draft[key] !== workspace.settings[key])
              .map((key) => (
                <div key={key}>
                  <span>{key.replace(/([A-Z])/g, " $1")}</span>
                  <strong>
                    {String(workspace.settings[key])} → {String(draft[key])}
                  </strong>
                </div>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export function SystemHealth({ notify }) {
  const workspace = usePreviewWorkspace();
  const [busy, setBusy] = useState(false);
  const [checkedAt, setCheckedAt] = useState(new Date());
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 550));
    setCheckedAt(new Date());
    workspace.refresh();
    setBusy(false);
    notify("Sample service status refreshed.");
  };
  return (
    <div className="preview-stack">
      <section className="preview-health-banner">
        <span className="preview-health-check">
          <CheckCircle2 size={30} />
        </span>
        <div>
          <h2>All systems operational</h2>
          <p>
            Sample restaurant services are healthy. Last checked{" "}
            {checkedAt.toLocaleTimeString("en-GB")}.
          </p>
        </div>
        <Button
          icon={RefreshCw}
          variant="secondary"
          disabled={busy}
          onClick={refresh}
        >
          {busy ? "Checking…" : "Refresh status"}
        </Button>
      </section>
      <div className="preview-dashboard-metrics">
        {[
          ["Database", "42 ms", "Connection healthy"],
          ["Authentication", "81 ms", "Sessions available"],
          ["Order functions", "96 ms", "Queue responsive"],
          ["Payment functions", "114 ms", "No active incidents"],
        ].map(([label, value, hint]) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            hint={hint}
            icon={Activity}
          />
        ))}
      </div>
      <section className="preview-card">
        <div className="preview-section-heading">
          <div>
            <h2>Service availability</h2>
            <p>Illustrative availability over the last 30 days.</p>
          </div>
          <Tag tone="green">99.98% uptime</Tag>
        </div>
        {workspace.modules["system-health"].map((service) => (
          <div className="preview-uptime-service" key={service._id}>
            <div>
              <strong>{service.Service}</strong>
              <Tag tone="green">Operational</Tag>
            </div>
            <div
              className="preview-uptime-bars"
              aria-label="30 days operational"
            >
              {Array.from({ length: 30 }, (_, index) => (
                <span key={index} title={`Day ${index + 1}: operational`} />
              ))}
            </div>
            <small>
              30 days ago <span>Today</span>
            </small>
          </div>
        ))}
      </section>
      <section className="preview-card preview-inline-info">
        <ShieldCheck size={19} />
        <div>
          <strong>No active incidents</strong>
          <p>
            This dashboard demonstrates health states using local sample data.
            Refresh does not contact production services.
          </p>
        </div>
      </section>
    </div>
  );
}
