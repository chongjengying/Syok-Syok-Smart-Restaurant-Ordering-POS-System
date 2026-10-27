import { useState } from "react";
import {
  Building2,
  CreditCard,
  FileText,
  Printer,
  ReceiptText,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { downloadText } from "../previewDownloads";
import { Button, DataTable, Field, Modal, Tag, TextInput } from "./PreviewUi";
import { RestaurantSettings } from "./WorkspaceSettings";

export default function SettingsHub({ navigate, notify }) {
  const section = new URLSearchParams(location.search).get("section");
  if (section === "printers") return <PrinterSettings notify={notify} />;
  if (section)
    return (
      <RestaurantSettings
        notify={notify}
        initialTab={
          {
            tax: "Tax & regional",
            receipts: "Receipts",
            ordering: "Ordering",
            business: "Business",
          }[section] || "Business"
        }
      />
    );
  const entries = [
    [
      "Restaurant information",
      "Identity, contact details, regional defaults, and branding.",
      Building2,
      "panel/company",
    ],
    [
      "Tax & regional",
      "Review tax and service rates used for new sample orders.",
      Settings2,
      "panel/system-administration?section=tax",
    ],
    [
      "Payment methods",
      "Cash, card, e-wallet providers, and checkout availability.",
      CreditCard,
      "panel/payment-providers",
    ],
    [
      "Receipt settings",
      "Receipt footer, copies, and the information on printed bills.",
      ReceiptText,
      "panel/system-administration?section=receipts",
    ],
    [
      "Printer settings",
      "Receipt and kitchen routing, paper width, and sample test prints.",
      Printer,
      "panel/system-administration?section=printers",
    ],
    [
      "Staff permissions",
      "Review task-based roles and staff access.",
      ShieldCheck,
      "panel/roles",
    ],
    [
      "Admin profile",
      "Your personal name and contact details.",
      UserRound,
      "profile",
    ],
    [
      "Ordering preferences",
      "Numbering, takeaway, and approval requirements.",
      FileText,
      "panel/system-administration?section=ordering",
    ],
  ];
  return (
    <div className="preview-stack">
      <p className="preview-context-note">
        Choose a settings area. Changes stay in this mock workspace until the
        page is reloaded.
      </p>
      <div className="preview-settings-overview">
        {entries.map(([label, description, Icon, route]) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            className="preview-settings-tile"
            onClick={() => navigate(route)}
          >
            <Icon size={22} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PrinterSettings({ notify }) {
  const workspace = usePreviewWorkspace();
  const printers = workspace.settings.printers || [];
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const save = (event) => {
    event.preventDefault();
    if (!editing.name.trim()) {
      setError("Enter a printer name.");
      return;
    }
    if (
      editing.connection === "Network" &&
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(editing.address)
    ) {
      setError("Enter a sample IPv4 address.");
      return;
    }
    const result = workspace.saveSettings({
      printers: [
        ...printers.filter((printer) => printer.id !== editing.id),
        editing,
      ],
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(null);
    notify("Sample printer configuration saved. No hardware was contacted.");
  };
  const test = (printer) => {
    downloadText(
      `sample-print-${printer.id}.txt`,
      `MOCK TEST PRINT — NOT A FISCAL RECEIPT\n${printer.name}\n${printer.branch}\n${printer.profile} · ${printer.width} mm\n\nResto Dining Group\n1 × Sample item        RM 10.00\nTOTAL                  RM 10.00\n\nNo hardware connection was attempted.`,
    );
    workspace.recordActivity("PRINTER_TEST_DOWNLOADED", printer.name);
    notify("Sample test document downloaded.");
  };
  return (
    <section className="preview-card preview-flush-card">
      <div className="preview-panel-heading">
        <div>
          <h2>Printer settings</h2>
          <p>Assign receipt and kitchen printing by branch.</p>
        </div>
        <Button
          disabled={!workspace.can("Edit company settings")}
          onClick={() => {
            setError("");
            setEditing({
              id: crypto.randomUUID(),
              name: "",
              profile: "Receipt",
              branch:
                workspace.branch === "All branches"
                  ? workspace.availableBranches[0].name
                  : workspace.branch,
              connection: "Network",
              address: "192.0.2.10",
              width: "80",
              status: "Enabled",
            });
          }}
        >
          Add printer
        </Button>
      </div>
      <DataTable
        columns={[
          "Printer",
          "Branch",
          "Purpose",
          "Connection",
          "Paper",
          "Status",
        ]}
        rows={printers.map((printer) => ({
          _id: printer.id,
          Printer: printer.name,
          Branch: printer.branch,
          Purpose: printer.profile,
          Connection: printer.connection,
          Paper: `${printer.width} mm`,
          Status: printer.status,
          _printer: printer,
        }))}
        empty="No printers configured. Add a sample receipt or kitchen printer to explore setup."
        actions={(row) => (
          <>
            <Button
              variant="quiet"
              disabled={!workspace.can("Edit company settings")}
              onClick={() => {
                setError("");
                setEditing({ ...row._printer });
              }}
            >
              Edit
            </Button>
            <Button variant="quiet" onClick={() => test(row._printer)}>
              Download test print
            </Button>
            <Button
              variant="quiet"
              disabled={!workspace.can("Edit company settings")}
              onClick={() => {
                workspace.saveSettings({
                  printers: printers.map((printer) =>
                    printer.id === row._id
                      ? {
                          ...printer,
                          status:
                            printer.status === "Enabled"
                              ? "Disabled"
                              : "Enabled",
                        }
                      : printer,
                  ),
                });
              }}
            >
              {row.Status === "Enabled" ? "Disable" : "Enable"}
            </Button>
          </>
        )}
      />
      <div className="preview-dashboard-panel-note">
        <Tag tone="blue">Mock configuration</Tag> Test prints download a sample
        document. Actual printer discovery and hardware connections are outside
        this preview.
      </div>
      {editing && (
        <Modal
          title={editing.name ? "Edit sample printer" : "Add sample printer"}
          description="Store a mock assignment without connecting to hardware."
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" form="preview-printer-form">
                Save printer
              </Button>
            </>
          }
        >
          <form
            id="preview-printer-form"
            className="preview-form"
            onSubmit={save}
          >
            {error && (
              <p className="preview-inline-error" role="alert">
                {error}
              </p>
            )}
            {[
              ["name", "Printer name"],
              ["address", "Sample address / identifier"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <TextInput
                  required
                  value={editing[key]}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </Field>
            ))}
            {[
              [
                "branch",
                "Branch",
                workspace.availableBranches.map((branch) => branch.name),
              ],
              ["profile", "Print purpose", ["Receipt", "Kitchen"]],
              [
                "connection",
                "Connection type",
                ["Network", "USB", "Bluetooth"],
              ],
              ["width", "Paper width (mm)", ["80", "58"]],
            ].map(([key, label, options]) => (
              <Field key={key} label={label}>
                <select
                  value={editing[key]}
                  onChange={(event) =>
                    setEditing((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                >
                  {options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </Field>
            ))}
          </form>
        </Modal>
      )}
    </section>
  );
}
