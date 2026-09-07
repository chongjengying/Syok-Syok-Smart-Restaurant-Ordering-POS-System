import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  FolderTree,
  LayoutDashboard,
  Logs,
  Menu,
  PackageSearch,
  ReceiptText,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  UtensilsCrossed,
  X,
  QrCode,
  FileText,
} from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import ProductManagementScreen from "../ProductManagementScreen";
import CategoryManagement from "./CategoryManagement";
import UserManagement from "./UserManagement";
import RolePermissions from "./RolePermissions";
import AdminOrders from "./AdminOrders";
import AdminPayments from "./AdminPayments";
import AuditLogs from "./AuditLogs";
import TableManagementScreen from "../TableManagementScreen";
import ReportsScreen from "../ReportsScreen";
import QrPaymentSettings from "./QrPaymentSettings";
import PaymentProviders from "./PaymentProviders";
import TerminalManagement from "./TerminalManagement";
import OrganizationManagement from "./OrganizationManagement";
import SystemHealthPage from "../../pages/admin/SystemHealthPage";
import OperationalIndicator from "../system-health/OperationalIndicator";
import { useSystemHealth } from "../../hooks/useSystemHealth";
import SystemAdministrationPage from "../../pages/admin/SystemAdministrationPage";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";
import { translate } from "../../utils/i18n";
import InventoryManagementPage from "../../pages/admin/InventoryManagementPage";
import EinvoiceOverview from "./EinvoiceOverview";
import VoucherManagement from "./VoucherManagement";
import PromotionManagement from "./PromotionManagement";
import DiscountActivity from "./DiscountActivity";
import CashShiftManagement from "./CashShiftManagement";
import { getSystemSettings } from "../../services/systemSettings.service";

const groups = [
  ["", [["dashboard", "Dashboard", "dashboard.view", LayoutDashboard]]],
  [
    "ORGANIZATION",
    [
      ["company", "Company", "company.view", Settings],
      ["branches", "Branches", "branch.view", FolderTree],
      ["terminals", "Terminals", "terminal.view", Settings],
      ["users", "Staff", "user.view", Users],
      ["roles", "Roles & Permissions", "role.view", ShieldCheck],
    ],
  ],
  [
    "OPERATIONS",
    [
      ["orders", "Orders", "order.view", ClipboardList],
      ["payments", "Payments", "payment.view", ReceiptText],
      ["cash-shifts", "Cashier Shifts", "cash.shift.view", CreditCard],
      ["tables", "Tables", "table.view", UtensilsCrossed],
    ],
  ],
  [
    "BUSINESS",
    [
      ["products", "Products", "product.view", PackageSearch],
      ["categories", "Categories", "category.view", FolderTree],
      ["promotions", "Promotions", "promotion.view", ReceiptText],
      ["vouchers", "Vouchers", "voucher.view", ReceiptText],
    ],
  ],
  [
    "REPORTS",
    [
      ["reports", "Sales Reports", "report.view", TrendingUp],
      ["discount-activity", "Voucher Usage", "voucher.activity.view", ReceiptText],
      ["audit", "Audit Logs", "audit.view", Logs],
    ],
  ],
  [
    "SYSTEM",
    [
      [
        "system-administration",
        "Restaurant Settings",
        "settings.view",
        Settings,
      ],
      ["system-health", "System Health", "system.health.view", Activity],
      ["qr-settings", "QR Payment Settings", "settings.manage", QrCode],
      ["payment-providers", "Payment Methods", "settings.manage", CreditCard],
      ["einvoice", "E-Invoice", "einvoice.view", FileText],
    ],
  ],
];
const items = groups.flatMap((group) => group[1]);

const readRoute = () => {
  const raw = globalThis.location?.hash?.replace(/^#admin\//, "") || "";
  const [section = "dashboard", query = ""] = raw.split("?");
  return { section, query };
};

export default function AdminShell({ role, permissions, onBack, onSwitchStaff, lang }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const allowed = useMemo(() => new Set(permissions), [permissions]);
  const first = items.find((item) => allowed.has(item[2]))?.[0] || "";
  const initial = readRoute();
  const [section, setSection] = useState(
    items.some((item) => item[0] === initial.section && allowed.has(item[2]))
      ? initial.section
      : first,
  );
  const [routeKey, setRouteKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [businessLabel, setBusinessLabel] = useState("Restaurant Admin");
  const healthState = useSystemHealth(allowed.has("system.health.view"));
  const networkState = useNetworkStatus();

  useEffect(() => {
    if (!allowed.has("settings.view")) return undefined;
    let active = true;
    void getSystemSettings().then((result) => {
      if (!active || result.error || !result.data) return;
      const info = result.data.restaurantInfo || {};
      const name = String(info.restaurantName || "").trim();
      const branch = String(info.branchName || "").trim();
      if (name) setBusinessLabel(branch ? `${name} · ${branch}` : name);
    });
    return () => { active = false; };
  }, [allowed]);

  const navigate = (nextSection, filters = {}) => {
    if (
      !globalThis.dispatchEvent(
        new CustomEvent("before-admin-navigate", {
          cancelable: true,
          detail: { section: nextSection },
        }),
      )
    )
      return;
    const target = items.find(
      (item) => item[0] === nextSection && allowed.has(item[2]),
    );
    if (!target) return;
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== "" && value != null) query.set(key, String(value));
    });
    const suffix = query.size ? `?${query}` : "";
    globalThis.history?.replaceState(
      null,
      "",
      `#admin/${nextSection}${suffix}`,
    );
    setSection(nextSection);
    setRouteKey((current) => current + 1);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (section && !globalThis.location.hash.startsWith(`#admin/${section}`))
      globalThis.history?.replaceState(null, "", `#admin/${section}`);
  }, [section]);
  useEffect(() => {
    const sync = () => {
      const route = readRoute();
      if (
        route.section !== section &&
        !globalThis.dispatchEvent(
          new CustomEvent("before-admin-navigate", {
            cancelable: true,
            detail: { section: route.section },
          }),
        )
      ) {
        globalThis.history?.replaceState(null, "", `#admin/${section}`);
        return;
      }
      if (
        items.some((item) => item[0] === route.section && allowed.has(item[2]))
      )
        setSection(route.section);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [allowed, section]);
  if (!first)
    return (
      <div className="flex h-full items-center justify-center bg-[#121212] text-white">
        Admin access denied.
      </div>
    );
  const activeRoute = readRoute();
  const activeParams = new URLSearchParams(activeRoute.query);

  const content = {
    dashboard: (
      <AdminDashboard
        onNavigate={navigate}
        systemHealth={healthState.data}
        canViewSystemAdministration={allowed.has("settings.view")}
      />
    ),
    products: (
      <ProductManagementScreen
        role={role}
        permissions={permissions}
        embedded
        initialProductId={activeParams.get("productId") || ""}
      />
    ),
    categories: (
      <CategoryManagement
        canCreate={allowed.has("category.create")}
        canEdit={allowed.has("category.edit")}
      />
    ),
    inventory: (
      <InventoryManagementPage
        lang={lang}
        canManage={allowed.has("inventory.manage")}
      />
    ),
    users: (
      <UserManagement
        canCreate={allowed.has("user.create")}
        canEdit={allowed.has("user.edit")}
        canAssignRole={allowed.has("user.assign_role")}
      />
    ),
    roles: <RolePermissions canEdit={allowed.has("role.edit")} />,
    orders: <AdminOrders canManage={allowed.has("order.manage")} />,
    payments: <AdminPayments canRefund={allowed.has("payment.refund")} />,
    "cash-shifts": <CashShiftManagement canForceClose={allowed.has("cash.shift.force_close")} />,
    tables: (
      <TableManagementScreen
        role={role}
        embedded
        lang={lang}
        initialStatus={activeParams.get("status") || ""}
        branchId={activeParams.get("branchId") || ""}
      />
    ),
    reports: <ReportsScreen embedded lang={lang} />,
    audit: <AuditLogs />,
    "qr-settings": <QrPaymentSettings />,
    "payment-providers": <PaymentProviders />,
    terminals: <TerminalManagement permissions={permissions} />,
    company: <OrganizationManagement mode="company" permissions={permissions} />,
    branches: <OrganizationManagement mode="branch" permissions={permissions} />,
    "system-health": <SystemHealthPage state={healthState} />,
    "system-administration": <SystemAdministrationPage lang={lang} />,
    einvoice: <EinvoiceOverview />,
    vouchers: <VoucherManagement initialStatus={activeParams.get("status") || ""} initialValidity={activeParams.get("validity") || ""} initialCreate={activeParams.get("create") === "1"} />,
    promotions: <PromotionManagement initialStatus={activeParams.get("status") || ""} initialCreate={activeParams.get("create") === "1"} />,
    "discount-activity": <DiscountActivity initialKind={activeParams.get("kind") || ""} />,
  }[section];

  const sidebar = (
    <aside className="admin-sidebar h-full w-64 overflow-y-auto bg-[#121212] p-4 text-white">
      <div className="flex justify-between">
        <button
          onClick={() => {
            globalThis.history?.replaceState(
              null,
              "",
              globalThis.location?.pathname || "/",
            );
            onBack();
          }}
          className="mb-6 flex items-center gap-2 text-sm font-bold text-gray-300"
        >
          <ArrowLeft size={17} />
          {tr("posDashboard")}
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          className="mb-6 lg:hidden"
          aria-label={tr("closeNavigation")}
        >
          <X size={20} />
        </button>
      </div>
      <div className="mb-6 flex items-center gap-2 text-lg font-black text-[#C59A2A]">
        <ChartNoAxesCombined />
        <span className="truncate" title={businessLabel}>{businessLabel}</span>
      </div>
      {groups.map(([label, groupItems]) => {
        const visible = groupItems.filter((item) => allowed.has(item[2]));
        return visible.length ? (
          <div key={label} className="mb-5">
            {label && (
              <p className="mb-2 px-3 text-[10px] font-black tracking-widest text-gray-500">
                {label}
              </p>
            )}
            {visible.map(([id, text, , Icon]) => (
              <React.Fragment key={id}>
                <button
                  onClick={() => navigate(id)}
                    className={`admin-nav-item mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${section === id ? "is-active" : "text-gray-300 hover:bg-white/10"}`}
                >
                  <Icon size={17} />
                  {text}
                </button>
                {id === "promotions" && <div className="mb-2 ml-8 space-y-1 border-l border-white/10 pl-3 text-xs">{[["All",{}],["Active",{status:"ACTIVE"}],["Scheduled",{status:"SCHEDULED"}],["Expired",{status:"EXPIRED"}],["Disabled",{status:"DISABLED"}],["+ Create Promotion",{create:"1"}]].map(([label, filters]) => <button key={label} onClick={() => navigate("promotions", filters)} className="block w-full rounded px-2 py-1.5 text-left text-gray-400 hover:bg-white/10 hover:text-white">{label}</button>)}</div>}
                {id === "vouchers" && <div className="mb-2 ml-8 space-y-1 border-l border-white/10 pl-3 text-xs">{[["All",{}],["Active",{status:"ACTIVE"}],["Scheduled",{validity:"UPCOMING"}],["Fully Redeemed",{status:"REDEEMED"}],["Expired",{status:"EXPIRED"}],["Disabled",{status:"DISABLED"}],["+ Create Voucher",{create:"1"}]].map(([label, filters]) => <button key={label} onClick={() => navigate("vouchers", filters)} className="block w-full rounded px-2 py-1.5 text-left text-gray-400 hover:bg-white/10 hover:text-white">{label}</button>)}</div>}
                {id === "discount-activity" && <div className="mb-2 ml-8 space-y-1 border-l border-white/10 pl-3 text-xs">{[["Promotion Usage","PROMOTION"],["Voucher Redemption","VOUCHER"],["Manual Discounts","MANUAL"],["Manager Overrides","OVERRIDE"]].map(([label, kind]) => <button key={kind} onClick={() => navigate("discount-activity", {kind})} className="block w-full rounded px-2 py-1.5 text-left text-gray-400 hover:bg-white/10 hover:text-white">{label}</button>)}</div>}
              </React.Fragment>
            ))}
          </div>
        ) : null;
      })}
    </aside>
  );

  return (
    <div className="admin-shell flex h-full bg-[#F5F6F8] text-[#121212]">
      <div className="hidden shrink-0 lg:block">{sidebar}</div>
      {sidebarOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setSidebarOpen(false)}
            aria-label={tr("closeNavigation")}
          />
          <div className="relative h-full">{sidebar}</div>
        </div>
      )}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {networkState !== "ONLINE" && (
          <div
            role="status"
            aria-live="assertive"
            className={`sticky top-0 z-40 px-4 py-2 text-center text-sm font-bold ${networkState === "OFFLINE" ? "bg-red-700 text-white" : "bg-amber-300 text-black"}`}
          >
            {tr(
              networkState === "OFFLINE" ? "adminOffline" : "adminReconnecting",
            )}
          </div>
        )}
        <div className="admin-topbar sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold lg:hidden"
          >
            <Menu size={18} />
            {tr("adminMenu")}
          </button>
          <span className="hidden lg:block" />
          <div className="flex items-center gap-2">
            {allowed.has("system.health.view") && (
              <OperationalIndicator
                health={healthState.data}
                onClick={() => navigate("system-health")}
              />
            )}
            {onSwitchStaff && <button type="button" onClick={onSwitchStaff} className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 transition hover:bg-amber-100" title="Return to staff PIN selection">
              <Users size={15} /> Switch Staff
            </button>}
          </div>
        </div>
        <div key={routeKey} className="admin-content p-4 sm:p-6 lg:p-8">
          {content}
        </div>
      </main>
    </div>
  );
}
