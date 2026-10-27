import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Armchair,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Download,
  Grid2X2,
  List,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { adminModuleData } from "./adminModuleData";
import { moduleGuides } from "./referenceData";
import { usePreviewWorkspace } from "./hooks/usePreviewWorkspace";
import { money, parseMoney } from "./previewMoney";
import {
  Button,
  DataTable,
  MetricCard,
  Modal,
  Pagination,
  Tag,
  ScreenState,
} from "./components/PreviewUi";
import {
  ActionDialog,
  OrderComposer,
  RecordEditor,
} from "./components/ModuleForms";
import { downloadCsv, downloadText } from "./previewDownloads";
import OperationsDashboard from "./components/OperationsDashboard";
import SettingsHub from "./components/SettingsHub";
import {
  dateKey,
  financialSummary,
  inPeriod,
  recordBranch,
  reportRows,
} from "./previewSelectors";
import {
  RestaurantSettings,
  SystemHealth,
} from "./components/WorkspaceSettings";

const emptyRows = [];
const editable = new Set([
  "products",
  "categories",
  "tables",
  "promotions",
  "vouchers",
  "payment-providers",
  "einvoice",
]);
const sumMoney = (rows, field) =>
  rows.reduce((sum, row) => sum + (parseMoney(row[field], true) || 0), 0);
const isStatus = (key) => /status|validation|visibility|result/i.test(key);

function metrics(moduleId, rows, workspace, financial) {
  const count = (status) => rows.filter((row) => row.Status === status).length;
  if (moduleId === "orders")
    return [
      ["Recent tickets", rows.length, "In the current branch view"],
      [
        "Awaiting payment",
        money(
          sumMoney(
            rows.filter((row) => row.Payment === "Unpaid"),
            "Total",
          ),
        ),
        "Across unsettled tickets",
      ],
      [
        "In preparation",
        count("Preparing") + count("Ready"),
        "Kitchen and ready-to-serve tickets",
      ],
    ];
  if (moduleId === "payments")
    return [
      [
        "Collected",
        money(
          sumMoney(
            rows.filter((row) =>
              ["Completed", "Partially refunded"].includes(row.Status),
            ),
            "Amount",
          ) -
            rows
              .filter((row) => row.Status === "Partially refunded")
              .reduce((sum, row) => sum + (row._refundedCents || 0), 0),
        ),
        "Successful payments after refunds",
      ],
      [
        "Refunded",
        money(rows.reduce((sum, row) => sum + (row._refundedCents || 0), 0)),
        "Original payment records retained",
      ],
      ["Failed attempts", count("Failed"), "Review linked unpaid orders"],
    ];
  if (moduleId === "products")
    return [
      ["Menu items", rows.length, "Across all menu categories"],
      [
        "Available to order",
        count("Available"),
        "Visible in the order composer",
      ],
      [
        "Low stock",
        workspace.modules.inventory.filter((row) => row.Status === "Low stock")
          .length,
        "Check ingredients before service",
      ],
    ];
  if (moduleId === "inventory")
    return [
      ["Tracked stock items", rows.length, "In the selected outlet"],
      [
        "Needs replenishment",
        count("Low stock") + count("Out of stock"),
        "Below the reorder threshold",
      ],
      [
        "Movements recorded",
        workspace.modules._movements.length,
        "Receiving, transfers, and sales",
      ],
    ];
  if (moduleId === "cash-shifts")
    return [
      ["Open registers", count("Open"), "Ready for orders and payments"],
      [
        "Expected cash",
        money(
          sumMoney(
            rows.filter((row) => row.Status === "Open"),
            "Expected cash",
          ),
        ),
        "Opening float plus cash transactions",
      ],
      ["Closed shifts", count("Closed"), "Reconciliation history preserved"],
    ];
  if (moduleId === "tables")
    return [
      ["Tables in this outlet", rows.length, "Across all dining areas"],
      ["Available", count("Available"), "Ready to seat your next guests"],
      ["Occupied", count("Occupied"), "Settle the order before releasing"],
    ];
  if (moduleId === "receipts")
    return [
      ["Receipts issued", rows.length, "Original snapshots retained"],
      [
        "Sample reprints",
        rows.reduce((sum, row) => sum + (row._reprints || 0), 0),
        "Every reprint enters the audit trail",
      ],
      [
        "Receipt value",
        money(sumMoney(rows, "Total")),
        "Original issued amounts",
      ],
    ];
  if (moduleId === "categories")
    return [
      ["Menu categories", rows.length, "Keep ordering easy to browse"],
      [
        "Linked menu items",
        workspace.modules.products.length,
        "Shared with Menu Management",
      ],
      [
        "Hidden categories",
        rows.filter((row) => row.Visibility === "Hidden").length,
        "Excluded from category pickers",
      ],
    ];
  if (moduleId === "vouchers")
    return [
      ["Active vouchers", count("Active"), "Available in the order composer"],
      [
        "Redemptions",
        rows.reduce(
          (sum, row) => sum + (Number.parseInt(row.Redemptions) || 0),
          0,
        ),
        "Usage increases after order creation",
      ],
      [
        "Scheduled campaigns",
        count("Scheduled"),
        "Review dates before activation",
      ],
    ];
  if (moduleId === "promotions")
    return [
      ["Active offers", count("Active"), "Available during their schedule"],
      ["Scheduled", count("Scheduled"), "Upcoming restaurant campaigns"],
      [
        "Redemptions",
        rows.reduce((sum, row) => sum + Number(row.Redemptions || 0), 0),
        "Attributed to original offers",
      ],
    ];
  if (moduleId === "audit")
    return [
      ["Recorded events", rows.length, "Append-only sample activity"],
      [
        "Approvals",
        rows.filter((row) => /APPROV/.test(row.Action)).length,
        "Sensitive actions with attribution",
      ],
      ["Latest event", rows[0]?.When || "—", "Time in your workspace timezone"],
    ];
  if (moduleId === "discount-activity")
    return [
      ["Discounted orders", rows.length, "In this activity snapshot"],
      [
        "Discount value",
        money(sumMoney(rows, "Discount")),
        "All offers and voucher types",
      ],
      [
        "Manager approvals",
        rows.filter((row) => row["Approved by"] !== "—").length,
        "Attributed to the approving member",
      ],
    ];
  if (moduleId === "payment-providers")
    return [
      ["Configured methods", rows.length, "Available payment configurations"],
      ["Enabled", count("Enabled"), "Available to sample checkout"],
      ["Needs setup", count("Setup"), "Complete configuration to enable"],
    ];
  if (moduleId === "einvoice")
    return [
      [
        "Accepted",
        rows.filter((row) => row.Validation === "Accepted").length,
        "Validated sample submissions",
      ],
      ["Pending", count("Pending"), "Ready to review or resubmit"],
      [
        "Action required",
        count("Action required"),
        "Correct buyer information first",
      ],
    ];
  if (moduleId === "reports")
    return [
      ["Net receipts", money(financial.net), "Collected bills after refunds"],
      [
        "Orders created",
        financial.orders.length,
        "Including unpaid and cancelled tickets",
      ],
      [
        "Average order value",
        money(financial.aov),
        "Settled bills before refunds",
      ],
    ];
  return (adminModuleData[moduleId]?.stats || []).map(
    ([label, value, hint]) => [label, value, hint],
  );
}

export default function AdminModulePage({ moduleId, notify, navigate }) {
  const workspace = usePreviewWorkspace();
  const readOnly = !workspace.canEdit(moduleId);
  const config = adminModuleData[moduleId];
  const guide = moduleGuides[moduleId] || {
    title: moduleId,
    description: config?.description,
    label: "Records",
    action: config?.action,
  };
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [category, setCategory] = useState("All categories");
  const [dateRange, setDateRange] = useState("Today");
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [view, setView] = useState(
    () =>
      new URLSearchParams(location.search).get("view") ||
      (moduleId === "tables" ? "floor" : "list"),
  );
  const [dialog, setDialog] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [dateFrom, setDateFrom] = useState(dateKey(Date.now()));
  const [dateTo, setDateTo] = useState(dateKey(Date.now()));
  const rows = useMemo(
    () =>
      moduleId === "reports"
        ? reportRows(
            workspace.modules,
            workspace.availableBranches,
            dateRange,
            dateFrom,
            dateTo,
          )
        : (workspace.modules[moduleId] || emptyRows).filter(
            (row) => !row._archived,
          ),
    [
      moduleId,
      workspace.modules,
      workspace.availableBranches,
      dateRange,
      dateFrom,
      dateTo,
    ],
  );
  const columns =
    moduleId === "products"
      ? ["Product", "Category", "Price", "Status"]
      : moduleId === "reports"
        ? [
            "Branch",
            "Gross sales",
            "Discounts",
            "Refunds",
            "Tax",
            "Service charge",
            "Net sales",
            "Orders",
            "Avg. order",
          ]
        : config?.columns || [];
  const selected =
    rows.find((row) => row._id === (dialog?.id || detailId)) || dialog?.row;
  const summary = financialSummary(
    workspace.modules,
    workspace.branch,
    dateRange,
    dateFrom,
    dateTo,
  );
  const scoped = useMemo(
    () =>
      rows
        .filter((row) => {
          if (workspace.branch === "All branches") return true;
          const branchValue = row.Branch || row["Branch / terminal"];
          if (branchValue)
            return (
              branchValue === "Workspace" ||
              String(branchValue).startsWith(workspace.branch)
            );
          if (row.Order) {
            const order = workspace.modules.orders.find(
              (item) => item.Order === row.Order,
            );
            if (order) return order.Branch === workspace.branch;
          }
          if (
            [
              "orders",
              "payments",
              "receipts",
              "discount-activity",
              "einvoice",
            ].includes(moduleId)
          )
            return recordBranch(row, workspace.modules) === workspace.branch;
          return true;
        })
        .filter(
          (row) =>
            moduleId === "reports" ||
            ![
              "orders",
              "payments",
              "receipts",
              "cash-shifts",
              "discount-activity",
              "audit",
              "einvoice",
            ].includes(moduleId) ||
            inPeriod(row._createdAt, dateRange, dateFrom, dateTo),
        ),
    [
      rows,
      workspace.branch,
      workspace.modules,
      moduleId,
      dateRange,
      dateFrom,
      dateTo,
    ],
  );
  const filtered = useMemo(
    () =>
      scoped
        .filter((row) => {
          const text = Object.entries(row)
            .filter(([key]) => !key.startsWith("_"))
            .map(([, value]) => value)
            .join(" ")
            .toLowerCase();
          return (
            text.includes(query.toLowerCase()) &&
            (status === "All" ||
              [row.Status, row.Visibility, row.Result, row.Validation].includes(
                status,
              )) &&
            (category === "All categories" || row.Category === category)
          );
        })
        .sort((a, b) =>
          !sort.key
            ? 0
            : String(a[sort.key] ?? "").localeCompare(
                String(b[sort.key] ?? ""),
                undefined,
                { numeric: true },
              ) * (sort.direction === "asc" ? 1 : -1),
        ),
    [scoped, query, status, category, sort],
  );
  const statusOptions = [
    ...new Set(
      scoped.flatMap((row) =>
        [row.Status, row.Visibility, row.Result].filter(Boolean),
      ),
    ),
  ];
  const visiblePage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / pageSize)),
  );
  const routeRecord = new URLSearchParams(location.search).get("record");
  const openedRecord = useRef(null);
  useEffect(() => {
    if (
      routeRecord &&
      openedRecord.current !== routeRecord &&
      rows.some((row) => row._id === routeRecord)
    ) {
      openedRecord.current = routeRecord;
      setDetailId(routeRecord);
    }
  }, [rows, routeRecord]);
  const finish = (message) => {
    setDialog(null);
    notify(message);
  };
  const run = (result, message) => {
    if (result?.error) return result;
    finish(message);
    return { success: true };
  };
  const exportRows = () => {
    downloadCsv(
      `restoadmin-${moduleId}-sample.csv`,
      moduleId === "products" ? config.columns : columns,
      filtered,
    );
    workspace.recordActivity("EXPORT_CREATED", moduleId);
    notify("CSV downloaded for the current view.");
  };
  const primary = () => {
    if (moduleId === "orders") workspace.setComposerOpen(true);
    else if (moduleId === "inventory") setDialog({ type: "stock" });
    else if (moduleId === "cash-shifts") setDialog({ type: "open-shift" });
    else if (editable.has(moduleId) && moduleId !== "einvoice")
      setDialog({ type: "editor" });
    else exportRows();
  };
  const change = (row, nextStatus) =>
    run(
      workspace.changeStatus(moduleId, row._id, nextStatus),
      `${row[columns[0]]} updated to ${nextStatus.toLowerCase()}.`,
    );
  const titleFor = (row) => row?.[columns[0]] || "Record";
  const recordActions = (row) => (
    <>
      <Button variant="quiet" onClick={() => setDetailId(row._id)}>
        View
      </Button>
      {editable.has(moduleId) && !["tables", "einvoice"].includes(moduleId) && (
        <Button
          variant="quiet"
          disabled={readOnly}
          onClick={() => setDialog({ type: "editor", id: row._id })}
        >
          Edit
        </Button>
      )}
      {moduleId === "orders" && row.Status === "Preparing" && (
        <Button
          variant="quiet"
          disabled={readOnly}
          onClick={() => change(row, "Ready")}
        >
          Mark ready
        </Button>
      )}
      {moduleId === "orders" &&
        row.Payment === "Unpaid" &&
        row.Status !== "Cancelled" && (
          <Button
            variant="secondary"
            disabled={!workspace.can("Take payment")}
            onClick={() => setDialog({ type: "payment", id: row._id })}
          >
            Take payment
          </Button>
        )}
      {moduleId === "products" && (
        <>
          <Button
            variant="quiet"
            disabled={readOnly}
            onClick={() =>
              change(
                row,
                row.Status === "Available" ? "Unavailable" : "Available",
              )
            }
          >
            {row.Status === "Available" ? "Disable" : "Enable"}
          </Button>
          <Button
            variant="quiet"
            disabled={readOnly}
            onClick={() => setDialog({ type: "delete-product", id: row._id })}
          >
            Delete
          </Button>
        </>
      )}
      {moduleId === "tables" && row.Status === "Available" && (
        <Button
          variant="quiet"
          disabled={readOnly}
          onClick={() => change(row, "Reserved")}
        >
          Reserve
        </Button>
      )}
      {moduleId === "tables" && row.Status !== "Occupied" && (
        <Button
          variant="quiet"
          disabled={readOnly}
          onClick={() => setDialog({ type: "editor", id: row._id })}
        >
          Edit
        </Button>
      )}
    </>
  );
  const onSort = (key) =>
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  if (!workspace.canView(moduleId))
    return (
      <ScreenState
        state="access-denied"
        onReset={() => workspace.setRole("Owner")}
      />
    );
  if (!config)
    return <div className="preview-card">This module is unavailable.</div>;
  if (moduleId === "dashboard")
    return <OperationsDashboard navigate={navigate} />;
  const settingsModule = [
    "system-administration",
    "qr-settings",
    "system-health",
  ].includes(moduleId);
  return (
    <div
      className={`preview-stack preview-module-page ${moduleId === "reports" ? "preview-financial-report" : ""}`}
    >
      <div className="preview-page-heading">
        <div>
          <p className="preview-eyebrow">
            {workspace.branch} <span> / </span>{" "}
            {readOnly ? "View access" : "Workspace"}
          </p>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
        </div>
        {!settingsModule && (
          <Button
            icon={/export/i.test(guide.action || "") ? Download : Plus}
            disabled={
              readOnly &&
              !/export/i.test(guide.action || "") &&
              ![
                "reports",
                "payments",
                "receipts",
                "audit",
                "discount-activity",
                "einvoice",
              ].includes(moduleId)
            }
            onClick={primary}
          >
            {moduleId === "einvoice"
              ? "Export invoices"
              : guide.action || "Export records"}
          </Button>
        )}
      </div>
      {moduleId === "system-administration" ? (
        <SettingsHub navigate={navigate} notify={notify} />
      ) : moduleId === "qr-settings" ? (
        <RestaurantSettings notify={notify} qrOnly />
      ) : moduleId === "system-health" ? (
        <SystemHealth notify={notify} />
      ) : (
        <>
          {moduleId === "reports" && (
            <div className="preview-report-filters">
              <label className="preview-field">
                <span className="preview-field-label">Date range</span>
                <select
                  aria-label="Date range"
                  value={dateRange}
                  onChange={(event) => {
                    setDateRange(event.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    "Today",
                    "Last 7 days",
                    "Last 30 days",
                    "All time",
                    "Custom range",
                  ].map((range) => (
                    <option key={range}>{range}</option>
                  ))}
                </select>
              </label>
              {dateRange === "Custom range" && (
                <>
                  <label className="preview-field">
                    <span className="preview-field-label">From date</span>
                    <input
                      aria-label="From date"
                      type="date"
                      value={dateFrom}
                      max={dateTo}
                      onChange={(event) => setDateFrom(event.target.value)}
                    />
                  </label>
                  <label className="preview-field">
                    <span className="preview-field-label">To date</span>
                    <input
                      aria-label="To date"
                      type="date"
                      value={dateTo}
                      min={dateFrom}
                      onChange={(event) => setDateTo(event.target.value)}
                    />
                  </label>
                </>
              )}
              <p className="preview-context-note">
                {workspace.branch} · MYR · Malaysia time
              </p>
            </div>
          )}
          <section className="preview-stat-grid preview-admin-stats">
            {metrics(moduleId, filtered, workspace, summary).map(
              ([label, value, hint], index) => (
                <MetricCard
                  key={label}
                  label={label}
                  value={value}
                  hint={hint}
                  icon={
                    index === 0 ? Activity : index === 1 ? CheckCircle2 : Clock3
                  }
                />
              ),
            )}
          </section>
          <section className="preview-card preview-flush-card">
            <div className="preview-records-tabs">
              <div>
                {["All", ...statusOptions.slice(0, 5)].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={status === value ? "is-active" : ""}
                    onClick={() => {
                      setStatus(value);
                      setPage(1);
                    }}
                  >
                    {value}
                    <span>
                      {value === "All"
                        ? scoped.length
                        : scoped.filter((row) =>
                            [row.Status, row.Visibility, row.Result].includes(
                              value,
                            ),
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              <span className="preview-small-label">{guide.label}</span>
            </div>
            <div className="preview-toolbar preview-toolbar-wrap">
              <label className="preview-search">
                <Search size={16} />
                <input
                  aria-label={`Search ${guide.label?.toLowerCase() || moduleId}`}
                  placeholder={
                    moduleId === "orders"
                      ? "Search ticket, cashier, or table…"
                      : `Search ${guide.label?.toLowerCase() || "records"}…`
                  }
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              {columns.includes("Category") && (
                <select
                  className="preview-select-compact"
                  aria-label="Filter by category"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(1);
                  }}
                >
                  <option>All categories</option>
                  {[...new Set(rows.map((row) => row.Category))].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              )}
              {[
                "orders",
                "payments",
                "receipts",
                "cash-shifts",
                "discount-activity",
                "audit",
                "einvoice",
              ].includes(moduleId) && (
                <select
                  className="preview-select-compact"
                  aria-label="Date range"
                  value={dateRange}
                  onChange={(event) => {
                    setDateRange(event.target.value);
                    setPage(1);
                  }}
                >
                  <option>Today</option>
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>All time</option>
                  <option>Custom range</option>
                </select>
              )}
              {moduleId !== "reports" && dateRange === "Custom range" && (
                <>
                  <input
                    className="preview-select-compact"
                    aria-label="From date"
                    type="date"
                    value={dateFrom}
                    max={dateTo}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                  <input
                    className="preview-select-compact"
                    aria-label="To date"
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </>
              )}
              {["tables", "orders"].includes(moduleId) && (
                <div
                  className="preview-view-toggle"
                  role="group"
                  aria-label="Record layout"
                >
                  <button
                    type="button"
                    aria-label={
                      moduleId === "orders" ? "List view" : "Table list view"
                    }
                    aria-pressed={view === "list"}
                    className={view === "list" ? "is-active" : ""}
                    onClick={() => setView("list")}
                  >
                    <List size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      moduleId === "orders"
                        ? "Kitchen board view"
                        : "Floor plan view"
                    }
                    aria-pressed={view !== "list"}
                    className={view !== "list" ? "is-active" : ""}
                    onClick={() =>
                      setView(moduleId === "orders" ? "kitchen" : "floor")
                    }
                  >
                    <Grid2X2 size={16} />
                  </button>
                </div>
              )}
              <Button
                variant="secondary"
                icon={SlidersHorizontal}
                onClick={() => {
                  setQuery("");
                  setStatus("All");
                  setCategory("All categories");
                  setPage(1);
                  setDateRange("All time");
                }}
              >
                Clear filters
              </Button>
              <Button
                variant="secondary"
                icon={Download}
                onClick={exportRows}
                aria-label={`Download ${moduleId} CSV`}
              >
                Export
              </Button>
            </div>
            {moduleId === "orders" && view === "kitchen" ? (
              <div className="preview-kitchen-board">
                {["Preparing", "Ready", "Served", "Completed"].map((state) => (
                  <section key={state}>
                    <h3>
                      <span
                        className={`preview-stage-dot stage-${state.toLowerCase()}`}
                      />
                      {state}
                      <span>
                        {filtered.filter((row) => row.Status === state).length}
                      </span>
                    </h3>
                    {filtered
                      .filter((row) => row.Status === state)
                      .map((row) => (
                        <button
                          type="button"
                          key={row._id}
                          className="preview-kitchen-ticket"
                          onClick={() => setDetailId(row._id)}
                        >
                          <strong>
                            {row.Order}
                            <small>{row.Time}</small>
                          </strong>
                          <Tag tone="blue">{row.Table}</Tag>
                          <p>{row._summary}</p>
                          <span>
                            {row.Cashier}
                            <b>{row.Total}</b>
                          </span>
                        </button>
                      ))}
                  </section>
                ))}
              </div>
            ) : moduleId === "tables" && view !== "list" ? (
              <div className="preview-floor-plan">
                {["Main Floor", "Bar Area", "Patio Garden"].map((area) => (
                  <button
                    type="button"
                    className={workspace.area === area ? "is-active" : ""}
                    key={area}
                    onClick={() => workspace.setArea(area)}
                  >
                    {area}
                  </button>
                ))}
                <div className="preview-floor-grid">
                  {filtered
                    .filter((row) => row["Dining area"] === workspace.area)
                    .map((row) => (
                      <button
                        type="button"
                        key={row._id}
                        className={`preview-floor-table table-${row.Status.toLowerCase()}`}
                        onClick={() => setDetailId(row._id)}
                      >
                        <Armchair size={28} />
                        <strong>{row.Table}</strong>
                        <small>{row.Capacity}</small>
                        <Tag>{row.Status}</Tag>
                        {row["Current order"] !== "—" && (
                          <span>{row["Current order"]}</span>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <>
                <DataTable
                  columns={columns}
                  rows={filtered.slice(
                    (visiblePage - 1) * pageSize,
                    visiblePage * pageSize,
                  )}
                  sort={sort}
                  onSort={onSort}
                  actions={recordActions}
                  renderCell={(row, column) =>
                    column === columns[0] ? (
                      <div className="preview-record-name preview-product-cell">
                        {moduleId === "products" && row._photo && (
                          <img src={row._photo} alt="" />
                        )}
                        <span className="preview-product-copy">
                          <strong>{row[column]}</strong>
                          {moduleId === "products" && <small>{row.SKU}</small>}
                        </span>
                      </div>
                    ) : isStatus(column) ? (
                      <Tag>{row[column]}</Tag>
                    ) : column === "Products" && moduleId === "categories" ? (
                      `${workspace.modules.products.filter((item) => item.Category === row.Category).length} products`
                    ) : (
                      row[column] || "—"
                    )
                  }
                />
                <Pagination
                  page={visiblePage}
                  count={filtered.length}
                  pageSize={pageSize}
                  onChange={setPage}
                  onSize={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              </>
            )}
          </section>
          {moduleId === "reports" && <ReportBreakdown summary={summary} />}
          {moduleId === "inventory" && (
            <section className="preview-card">
              <div className="preview-section-heading">
                <div>
                  <h2>Movement history</h2>
                  <p>
                    Every stock change includes its source, quantity, actor, and
                    reason.
                  </p>
                </div>
                <Tag tone="blue">
                  {workspace.modules._movements.length} entries
                </Tag>
              </div>
              {workspace.modules._movements.length ? (
                <div className="preview-movement-list">
                  {workspace.modules._movements.slice(0, 8).map((row) => (
                    <div key={row.id}>
                      <span
                        className={
                          row.quantity < 0 ? "is-negative" : "is-positive"
                        }
                      >
                        {row.quantity > 0 ? "+" : ""}
                        {row.quantity}
                      </span>
                      <span>
                        <strong>{row.item}</strong>
                        <small>
                          {row.type} · {row.branch}
                          {row.targetBranch
                            ? ` → ${row.targetBranch}`
                            : ""} · {row.reason}
                        </small>
                      </span>
                      <time>{row.time}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="preview-muted">
                  No stock movements in this preview session. Record receiving
                  or complete a sample sale to see its movement here.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {workspace.composerOpen && (
        <OrderComposer
          onClose={() => workspace.setComposerOpen(false)}
          notify={notify}
        />
      )}
      {dialog?.type === "editor" && (
        <RecordEditor
          moduleId={moduleId}
          row={selected}
          onClose={() => setDialog(null)}
          onSaved={finish}
        />
      )}
      {detailId && !dialog && selected && (
        <Modal
          drawer
          title={String(titleFor(selected))}
          description={`${guide.label} · ${workspace.branch} · Sample record`}
          onClose={() => setDetailId(null)}
          wide
          footer={
            <>
              <Button variant="secondary" onClick={() => setDetailId(null)}>
                Close
              </Button>
              {moduleId === "orders" &&
                selected.Payment === "Unpaid" &&
                selected.Status !== "Cancelled" && (
                  <Button
                    disabled={!workspace.can("Take payment")}
                    onClick={() =>
                      setDialog({ type: "payment", id: selected._id })
                    }
                  >
                    Take sample payment
                  </Button>
                )}
              {editable.has(moduleId) &&
                (moduleId !== "tables" || selected.Status !== "Occupied") && (
                  <Button
                    disabled={readOnly}
                    onClick={() =>
                      setDialog({ type: "editor", id: selected._id })
                    }
                  >
                    {moduleId === "einvoice"
                      ? "Correct buyer details"
                      : "Edit details"}
                  </Button>
                )}
            </>
          }
        >
          <div className="preview-record-context">
            <Tag>
              {selected.Status || selected.Result || selected.Visibility}
            </Tag>
            <span>Company: {workspace.identity.company}</span>
            {selected.Terminal && <span>Terminal: {selected.Terminal}</span>}
          </div>
          <div className="preview-record-details">
            {Object.entries(selected)
              .filter(([key]) => !key.startsWith("_"))
              .map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
          </div>
          {moduleId === "orders" && (
            <section className="preview-detail-section">
              <h3>Order items</h3>
              {selected._items?.length ? (
                selected._items.map((item) => (
                  <div className="preview-line-item" key={item.productId}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <strong>{money(item.priceCents * item.quantity)}</strong>
                    {item.modifiers?.length > 0 && (
                      <small>
                        {item.modifiers
                          .map((option) => option.name)
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                ))
              ) : (
                <p className="preview-muted">{selected._summary}</p>
              )}
              <dl className="preview-order-totals">
                {selected._subtotalCents != null && (
                  <>
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(selected._subtotalCents)}</dd>
                    </div>
                    <div>
                      <dt>Discount</dt>
                      <dd>−{money(selected._discountCents)}</dd>
                    </div>
                    <div>
                      <dt>Tax</dt>
                      <dd>{money(selected._taxCents)}</dd>
                    </div>
                    <div>
                      <dt>Service charge</dt>
                      <dd>{money(selected._serviceCents || 0)}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Total</dt>
                  <dd>{selected.Total}</dd>
                </div>
              </dl>
              <div className="preview-row-actions">
                {selected.Status === "Preparing" && (
                  <Button
                    variant="secondary"
                    disabled={readOnly}
                    onClick={() => change(selected, "Ready")}
                  >
                    Mark ready
                  </Button>
                )}
                {selected.Status === "Ready" && (
                  <Button
                    variant="secondary"
                    disabled={readOnly}
                    onClick={() => change(selected, "Served")}
                  >
                    Mark served
                  </Button>
                )}
                {selected.Payment === "Unpaid" &&
                  selected.Status !== "Cancelled" && (
                    <Button
                      variant="danger"
                      disabled={readOnly}
                      onClick={() =>
                        setDialog({ type: "cancel", id: selected._id })
                      }
                    >
                      Cancel order
                    </Button>
                  )}
                {selected.Payment === "Paid" && (
                  <Button
                    variant="secondary"
                    onClick={() => navigate("panel/payments")}
                  >
                    View payment <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            </section>
          )}
          {moduleId === "payments" && (
            <div className="preview-detail-section">
              <h3>Payment controls</h3>
              <p className="preview-muted">
                Refunded so far: {money(selected._refundedCents || 0)}. The
                original payment remains in history.
              </p>
              {["Completed", "Partially refunded"].includes(
                selected.Status,
              ) && (
                <Button
                  variant="danger"
                  disabled={readOnly}
                  onClick={() =>
                    setDialog({ type: "refund", id: selected._id })
                  }
                >
                  Request refund
                </Button>
              )}
              {selected.Status === "Failed" && (
                <p className="preview-inline-error">
                  This sample attempt failed. Open the related unpaid order to
                  create a new payment attempt.
                </p>
              )}
            </div>
          )}
          {moduleId === "cash-shifts" && selected.Status === "Open" && (
            <Button
              disabled={readOnly}
              onClick={() =>
                setDialog({ type: "close-shift", id: selected._id })
              }
            >
              Close &amp; reconcile shift
            </Button>
          )}
          {moduleId === "receipts" && (
            <div className="preview-detail-section">
              <p className="preview-muted">
                Sample document · not a fiscal receipt.
              </p>
              <div className="preview-row-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    downloadText(
                      `${selected.Receipt}-sample.txt`,
                      `SAMPLE RECEIPT — NOT A TRANSACTION RECEIPT\n\nResto Dining Group\n${Object.entries(
                        selected,
                      )
                        .filter(([key]) => !key.startsWith("_"))
                        .map(([key, value]) => key + ": " + value)
                        .join("\n")}\n\n${workspace.settings.receiptFooter}`,
                    );
                    notify("Sample receipt downloaded.");
                  }}
                >
                  Download sample receipt
                </Button>
                <Button
                  disabled={readOnly}
                  onClick={() =>
                    run(
                      workspace.recordReprint(selected._id),
                      "Sample reprint recorded in the audit trail.",
                    )
                  }
                >
                  Record sample reprint
                </Button>
              </div>
            </div>
          )}
          {moduleId === "tables" && (
            <div className="preview-row-actions">
              {selected.Status === "Available" && (
                <Button
                  disabled={readOnly}
                  onClick={() => change(selected, "Reserved")}
                >
                  Reserve table
                </Button>
              )}
              {selected.Status === "Reserved" && (
                <Button
                  disabled={readOnly}
                  onClick={() => change(selected, "Available")}
                >
                  Release reservation
                </Button>
              )}
              {selected.Status === "Cleaning" && (
                <Button
                  disabled={readOnly}
                  onClick={() => change(selected, "Available")}
                >
                  Mark cleaned &amp; available
                </Button>
              )}
              {selected.Status === "Occupied" && (
                <p className="preview-muted">
                  Settle its active order before releasing this table.
                </p>
              )}
            </div>
          )}
          {moduleId === "products" && (
            <Button
              disabled={readOnly}
              variant="secondary"
              onClick={() =>
                change(
                  selected,
                  selected.Status === "Unavailable"
                    ? "Available"
                    : "Unavailable",
                )
              }
            >
              {selected.Status === "Unavailable"
                ? "Make available"
                : "Mark sold out"}
            </Button>
          )}
          {["promotions", "vouchers"].includes(moduleId) &&
            ["Active", "Paused"].includes(selected.Status) && (
              <Button
                disabled={readOnly}
                variant="secondary"
                onClick={() =>
                  change(
                    selected,
                    selected.Status === "Active" ? "Paused" : "Active",
                  )
                }
              >
                {selected.Status === "Active"
                  ? "Pause campaign"
                  : "Resume campaign"}
              </Button>
            )}
          {moduleId === "payment-providers" && (
            <Button
              disabled={readOnly}
              variant="secondary"
              onClick={() =>
                setDialog({ type: "provider-status", id: selected._id })
              }
            >
              {selected.Status === "Enabled"
                ? "Disable method"
                : "Enable method"}
            </Button>
          )}
          {moduleId === "einvoice" && selected.Status === "Pending" && (
            <Button
              disabled={readOnly}
              onClick={() => {
                if (!/^[A-Z0-9]{8,20}$/i.test(selected["Tax ID"] || "")) {
                  setDialog({ type: "editor", id: selected._id });
                  return;
                }
                run(
                  workspace.saveRecord(
                    moduleId,
                    {
                      ...selected,
                      Validation: "Accepted",
                      Status: "Submitted",
                      Submitted: new Date().toLocaleTimeString("en-GB"),
                    },
                    selected._id,
                  ),
                  "Sample e-invoice accepted.",
                );
              }}
            >
              Submit sample invoice
            </Button>
          )}
        </Modal>
      )}
      {dialog?.type === "delete-product" && selected && (
        <ActionDialog
          title={`Delete ${selected.Product}?`}
          description="Remove this item from the active menu. Historical order items, receipts, and stock records are retained."
          fields={[]}
          danger
          confirmLabel="Delete menu item"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const result = workspace.deleteProduct(selected._id);
            if (!result.error) setDetailId(null);
            return run(
              result,
              "Item removed from the active sample menu. History retained.",
            );
          }}
        />
      )}
      {dialog?.type === "cancel" && selected && (
        <ActionDialog
          title={`Cancel ${selected.Order}?`}
          description="The ticket is retained with its cancellation reason."
          fields={[
            {
              name: "reason",
              label: "Cancellation reason",
              type: "textarea",
              required: true,
            },
            ...(workspace.settings.requireManagerApproval
              ? [
                  {
                    name: "approver",
                    label: "Sample approval by",
                    options: [
                      "Alex Tan · Company owner",
                      "Farah Lim · Branch Manager",
                    ],
                    hint: "Local approval simulation; no PIN or real authorization is requested.",
                  },
                ]
              : []),
          ]}
          onClose={() => setDialog(null)}
          danger
          confirmLabel="Cancel order"
          onConfirm={(values) =>
            run(
              workspace.changeStatus(
                moduleId,
                selected._id,
                "Cancelled",
                values.reason || "",
                values.approver || "",
              ),
              "Order cancelled and preserved in history.",
            )
          }
        />
      )}
      {dialog?.type === "refund" && selected && (
        <ActionDialog
          title="Review refund"
          description={`${selected.Payment} · Original payment ${selected.Amount}`}
          fields={[
            {
              name: "amount",
              label: "Refund amount (RM)",
              type: "number",
              min: ".01",
              step: ".01",
              required: true,
            },
            {
              name: "reason",
              label: "Reason for refund",
              type: "textarea",
              required: true,
            },
            {
              name: "returnStock",
              label: "Return all items to stock",
              type: "checkbox",
              hint: "For a full refund with item-level data. Leave off for consumed or damaged items.",
            },
            ...(workspace.settings.requireManagerApproval
              ? [
                  {
                    name: "approver",
                    label: "Sample approval by",
                    options: [
                      "Alex Tan · Company owner",
                      "Farah Lim · Branch Manager",
                    ],
                    hint: "Local approval simulation; no PIN or real authorization is requested.",
                  },
                ]
              : []),
          ]}
          initial={{
            amount: (
              (parseMoney(selected.Amount) - (selected._refundedCents || 0)) /
              100
            ).toFixed(2),
            reason: "",
          }}
          onClose={() => setDialog(null)}
          danger
          confirmLabel="Confirm sample refund"
          onConfirm={(values) =>
            run(
              workspace.refundPayment(
                selected._id,
                values.amount,
                values.reason || "",
                values.returnStock,
                values.approver || "",
              ),
              "Refund recorded. Original payment and order retained.",
            )
          }
        />
      )}
      {dialog?.type === "payment" && selected && (
        <ActionDialog
          title={`Pay ${selected.Order}`}
          description={`Outstanding ${selected.Total} · No real money is collected.`}
          fields={[
            {
              name: "method",
              label: "Payment method",
              options: workspace.modules["payment-providers"]
                .filter(
                  (row) =>
                    row.Status === "Enabled" &&
                    (row.Method !== "QR" || workspace.settings.qrEnabled),
                )
                .map((row) => row.Method),
            },
            {
              name: "cash",
              label: "Cash received (RM)",
              type: "number",
              min: "0",
              step: ".01",
              hint: "Used only when paying with cash.",
            },
          ]}
          initial={{
            method: "Cash",
            cash: (selected._totalCents / 100).toFixed(2),
          }}
          onClose={() => setDialog(null)}
          confirmLabel="Complete sample payment"
          renderSummary={(values) => (
            <div className="preview-note-box">
              {values.method === "Cash"
                ? `Change due: ${money(Math.max(0, (parseMoney(values.cash) || 0) - selected._totalCents))}`
                : values.method === "QR"
                  ? `${workspace.settings.merchantName} · ${workspace.settings.confirmation} · sample only`
                  : "Sample card confirmation · no provider is contacted"}
            </div>
          )}
          onConfirm={(values) =>
            run(
              workspace.settleOrder(selected._id, values.method, values.cash),
              "Payment complete. Receipt, shift cash, stock movements, and audit updated.",
            )
          }
        />
      )}
      {dialog?.type === "stock" && (
        <ActionDialog
          title="Record stock movement"
          description="Every movement updates branch stock and preserves its reason."
          fields={[
            {
              name: "rowId",
              label: "Stock item",
              options: scoped.map((row) => ({
                value: row._id,
                label: `${row.Item} · ${row.Branch} · ${row["On hand"]}`,
              })),
            },
            {
              name: "type",
              label: "Movement type",
              options: [
                "Receiving",
                "Adjustment increase",
                "Transfer",
                "Waste",
              ],
            },
            {
              name: "quantity",
              label: "Quantity (portions)",
              type: "number",
              min: 1,
              required: true,
            },
            {
              name: "targetBranch",
              label: "Receiving branch (transfers only)",
              options: workspace.availableBranches.map((row) => row.name),
            },
            {
              name: "reason",
              label: "Reason / reference",
              type: "textarea",
              required: true,
            },
          ]}
          initial={{
            rowId: scoped[0]?._id || workspace.modules.inventory[0]?._id,
            type: "Receiving",
            targetBranch: "Damansara Uptown",
          }}
          onClose={() => setDialog(null)}
          confirmLabel="Save movement"
          onConfirm={(values) =>
            run(
              workspace.stockMovement(values),
              "Stock movement recorded with its audit trail.",
            )
          }
        />
      )}
      {dialog?.type === "close-shift" && selected && (
        <ActionDialog
          title={`Close ${selected.Shift}`}
          description={`Expected cash ${selected["Expected cash"]}. Count the drawer before continuing.`}
          fields={[
            {
              name: "actual",
              label: "Counted cash (RM)",
              type: "number",
              min: 0,
              step: ".01",
              required: true,
            },
            {
              name: "reason",
              label: "Variance explanation",
              type: "textarea",
              hint: "Required if counted and expected cash differ.",
            },
          ]}
          initial={{
            actual: (parseMoney(selected["Expected cash"]) / 100).toFixed(2),
          }}
          onClose={() => setDialog(null)}
          confirmLabel="Close & reconcile"
          onConfirm={(values) =>
            run(
              workspace.closeShift(
                selected._id,
                values.actual,
                values.reason || "",
              ),
              "Shift closed. Cash reconciliation retained.",
            )
          }
        />
      )}
      {dialog?.type === "open-shift" && (
        <ActionDialog
          title="Open a register"
          description={`${workspace.branch} · Assign one open shift per terminal.`}
          fields={[
            {
              name: "terminal",
              label: "Terminal",
              options: workspace.availableTerminals
                .filter(
                  (device) =>
                    device.branch === workspace.branch &&
                    device.status === "Active" &&
                    device.type === "POS terminal",
                )
                .map((device) => device.code),
            },
            {
              name: "opening",
              label: "Opening cash (RM)",
              type: "number",
              min: 0,
              step: ".01",
              required: true,
            },
          ]}
          initial={{
            terminal:
              workspace.availableTerminals.find(
                (device) =>
                  device.branch === workspace.branch &&
                  device.status === "Active" &&
                  device.type === "POS terminal",
              )?.code || "",
            opening: "300.00",
          }}
          onClose={() => setDialog(null)}
          confirmLabel="Open register"
          onConfirm={(values) =>
            run(
              workspace.openShift(values.terminal, values.opening),
              "Register opened for this branch.",
            )
          }
        />
      )}
      {dialog?.type === "provider-status" && selected && (
        <ActionDialog
          title={`${selected.Status === "Enabled" ? "Disable" : "Enable"} ${selected.Method}?`}
          description="This changes payment-method availability in the sample order checkout."
          fields={[]}
          onClose={() => setDialog(null)}
          confirmLabel="Confirm change"
          onConfirm={() =>
            run(
              workspace.changeStatus(
                moduleId,
                selected._id,
                selected.Status === "Enabled" ? "Disabled" : "Enabled",
              ),
              "Payment method availability updated.",
            )
          }
        />
      )}
    </div>
  );
}

function ReportBreakdown({ summary }) {
  return (
    <div className="preview-stack">
      <section className="preview-card">
        <div className="preview-section-heading">
          <div>
            <h2>Sales calculation</h2>
            <p>
              Settled bills in the selected period. Cancelled and unpaid orders
              are excluded from sales.
            </p>
          </div>
        </div>
        <div className="preview-financial-breakdown">
          {[
            ["Gross sales", summary.gross],
            ["Discounts", -summary.discounts],
            ["Tax", summary.tax],
            ["Service charge", summary.service],
            ["Refunds", -summary.refunds],
            ["Net receipts", summary.net],
          ].map(([label, cents]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{money(cents)}</strong>
            </div>
          ))}
        </div>
        <p className="preview-context-note">
          Average order value uses settled bill totals before refunds. Refunds
          reduce net receipts.
        </p>
      </section>
      <section className="preview-card">
        <div className="preview-section-heading">
          <div>
            <h2>Payment methods</h2>
            <p>Collected amounts after refunds.</p>
          </div>
        </div>
        {summary.tenders.length ? (
          <div className="preview-detail-list">
            {summary.tenders.map(([method, cents]) => (
              <div key={method}>
                <span>{method}</span>
                <strong>{money(cents)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="preview-muted">No collected payments in this period.</p>
        )}
      </section>
      <section className="preview-card preview-flush-card">
        <div className="preview-panel-heading">
          <div>
            <h2>Top-selling items</h2>
            <p>
              Settled item quantities and historical receipt prices in this
              period.
            </p>
          </div>
        </div>
        <DataTable
          columns={["Item", "Quantity", "Item sales"]}
          rows={summary.topItems.map((item) => ({
            _id: item.productId,
            Item: item.name,
            Quantity: item.quantity,
            "Item sales": money(item.sales),
          }))}
          empty="No settled item sales in this period."
        />
      </section>
    </div>
  );
}
