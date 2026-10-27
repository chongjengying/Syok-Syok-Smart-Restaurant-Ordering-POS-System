import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  TrendingUp,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import AccessibleDialog from "./AccessibleDialog";
import AdminDashboard from "./AdminDashboard";
import ProductManagementScreen from "../ProductManagementScreen";
import CategoryManagement from "./CategoryManagement";
import UserManagement from "./UserManagement";
import RolePermissions from "./RolePermissions";
import AdminOrders from "./AdminOrders";
import AdminPayments from "./AdminPayments";
import AdminReceipts from "./AdminReceipts";
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
import StaffSelectionPage from "./StaffSelectionPage";
import { getSystemSettings } from "../../services/systemSettings.service";
import { useAdminDashboard } from "../../hooks/useAdminDashboard";
import { adminSections, getAdminNavigation } from "./adminNavigation";
import AdminSettingsOverview from "./AdminSettingsOverview";
import AdminAccountPage from "./AdminAccountPage";
import "./adminWorkspace.css";

const icons = {
  dashboard: LayoutDashboard,
  menu: UtensilsCrossed,
  orders: ClipboardList,
  tables: Table2,
  staff: Users,
  reports: TrendingUp,
  settings: Settings,
};
const readRoute = () => {
  const raw =
    globalThis.location?.hash?.replace(/^#admin\//, "") || "dashboard";
  const [section = "dashboard", query = ""] = raw.split("?");
  return { section, query };
};

export default function AdminShell({
  role,
  permissions = [],
  profile,
  onProfileUpdated,
  onBack,
  onSwitchStaff,
  onLogout,
  lang,
  setLang,
  enabledLanguages,
}) {
  const tr = (key, variables) => translate(lang, key, variables);
  const allowed = useMemo(() => new Set(permissions), [permissions]);
  const navigation = useMemo(() => getAdminNavigation(allowed), [allowed]);
  const items = useMemo(
    () => adminSections.filter((item) => !item[2] || allowed.has(item[2])),
    [allowed],
  );
  const first =
    adminSections.find((item) => item[2] && allowed.has(item[2]))?.[0] || "";
  const initial = readRoute();
  const [section, setSection] = useState(
    items.some((item) => item[0] === initial.section) ? initial.section : first,
  );
  const [routeKey, setRouteKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState(profile);
  const [businessLabel, setBusinessLabel] = useState("Company workspace");
  const [toast, setToast] = useState(null);
  const routeHash = useRef(globalThis.location?.hash || "");
  const healthState = useSystemHealth(allowed.has("system.health.view"));
  const dashboardState = useAdminDashboard(
    section === "dashboard" && allowed.has("dashboard.view"),
  );
  const networkState = useNetworkStatus();
  const canOpen = useCallback(
    (id) => items.some((item) => item[0] === id),
    [items],
  );
  useEffect(() => {
    setAccount(profile);
  }, [profile]);

  useEffect(() => {
    const showToast = (event) => {
      const message = String(event.detail?.message || "").trim();
      if (!message) return;
      setToast({ message, tone: event.detail?.tone || "success" });
      window.clearTimeout(showToast.timer);
      showToast.timer = window.setTimeout(() => setToast(null), 4200);
    };
    window.addEventListener("admin-toast", showToast);
    return () => {
      window.removeEventListener("admin-toast", showToast);
      window.clearTimeout(showToast.timer);
    };
  }, []);
  useEffect(() => {
    if (!allowed.has("settings.view")) return undefined;
    let active = true;
    const load = () => {
      void getSystemSettings()
        .then((result) => {
          if (!active || result.error || !result.data) return;
          const name = String(
            result.data.restaurantInfo?.restaurantName || "",
          ).trim();
          if (name) setBusinessLabel(name);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("pos-settings-updated", load);
    return () => {
      active = false;
      window.removeEventListener("pos-settings-updated", load);
    };
  }, [allowed]);
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setSidebarOpen(false);
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const mayLeave = (next) =>
    globalThis.dispatchEvent(
      new CustomEvent("before-admin-navigate", {
        cancelable: true,
        detail: { section: next },
      }),
    );
  const navigate = (nextSection, filters = {}) => {
    if (!canOpen(nextSection)) return;
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== "" && value != null) params.set(key, String(value));
    });
    const target = `#admin/${nextSection}${params.size ? `?${params}` : ""}`;
    if (target === globalThis.location.hash) {
      setSidebarOpen(false);
      setSearchOpen(false);
      return;
    }
    if (!mayLeave(nextSection)) return;
    globalThis.history.pushState(null, "", target);
    routeHash.current = target;
    setSection(nextSection);
    setRouteKey((current) => current + 1);
    setSidebarOpen(false);
    setSearchOpen(false);
  };
  useEffect(() => {
    if (!first) return;
    if (!canOpen(readRoute().section))
      globalThis.history.replaceState(null, "", `#admin/${section}`);
    routeHash.current = globalThis.location.hash;
  }, [canOpen, first, section]);
  useEffect(() => {
    const filtersChanged = (event) => {
      if (typeof event.detail?.hash === "string")
        routeHash.current = event.detail.hash;
    };
    const sync = () => {
      if (globalThis.location.hash === routeHash.current) return;
      const route = readRoute();
      if (!canOpen(route.section) || !mayLeave(route.section)) {
        globalThis.history.replaceState(null, "", routeHash.current);
        return;
      }
      routeHash.current = globalThis.location.hash;
      setSection(route.section);
      setRouteKey((current) => current + 1);
      setSidebarOpen(false);
      setSearchOpen(false);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    window.addEventListener("admin-filters-changed", filtersChanged);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("admin-filters-changed", filtersChanged);
    };
  }, [canOpen]);
  if (!first)
    return (
      <div className="admin-workspace admin-access-denied">
        <h1>Admin access denied</h1>
        <p>Your account does not have permission to open this workspace.</p>
      </div>
    );
  const activeRoute = readRoute();
  const activeParams = new URLSearchParams(activeRoute.query);
  const content = {
    dashboard: (
      <AdminDashboard
        state={dashboardState}
        onNavigate={navigate}
        systemHealth={healthState.data}
        canViewSystemAdministration={allowed.has("settings.view")}
        canViewSystemHealth={allowed.has("system.health.view")}
        canOpen={canOpen}
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
    users: activeParams.get("assignBranchId") ? (
      <StaffSelectionPage branchId={activeParams.get("assignBranchId")} />
    ) : (
      <UserManagement
        staffId={activeParams.get("staffId") || ""}
        onNavigate={navigate}
        canCreate={allowed.has("user.create")}
        canEdit={allowed.has("user.edit")}
        canAssignRole={allowed.has("user.assign_role")}
      />
    ),
    roles: <RolePermissions canEdit={allowed.has("role.edit")} />,
    orders: <AdminOrders canManage={allowed.has("order.manage")} />,
    payments: (
      <AdminPayments
        canRefund={allowed.has("payment.refund")}
        canManageStock={allowed.has("inventory.manage")}
      />
    ),
    receipts: <AdminReceipts canReprint={allowed.has("receipt.reprint")} />,
    "cash-shifts": (
      <CashShiftManagement
        initialShiftId={activeParams.get("shiftId") || ""}
        canForceClose={allowed.has("cash.shift.force_close")}
      />
    ),
    tables: (
      <TableManagementScreen
        role={role}
        canManage={allowed.has("table.manage")}
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
    terminals: (
      <TerminalManagement permissions={permissions} onNavigate={navigate} />
    ),
    company: (
      <OrganizationManagement mode="company" permissions={permissions} />
    ),
    branches: (
      <OrganizationManagement
        mode="branch"
        permissions={permissions}
        initialBranchId={activeParams.get("branchId") || ""}
      />
    ),
    "system-health": <SystemHealthPage state={healthState} />,
    "system-administration": (
      <SystemAdministrationPage
        lang={lang}
        initialTab={activeParams.get("tab") || "General"}
      />
    ),
    settings: <AdminSettingsOverview canOpen={canOpen} onNavigate={navigate} />,
    profile: (
      <AdminAccountPage
        profile={account}
        lang={lang}
        setLang={setLang}
        enabledLanguages={enabledLanguages}
        onLogout={() => {
          if (mayLeave("logout")) onLogout?.();
        }}
        onUpdated={(updated) => {
          setAccount(updated);
          void onProfileUpdated?.();
        }}
      />
    ),
    einvoice: <EinvoiceOverview />,
    vouchers: (
      <VoucherManagement
        initialStatus={activeParams.get("status") || ""}
        initialValidity={activeParams.get("validity") || ""}
        initialCreate={activeParams.get("create") === "1"}
      />
    ),
    promotions: (
      <PromotionManagement
        initialStatus={activeParams.get("status") || ""}
        initialCreate={activeParams.get("create") === "1"}
      />
    ),
    "discount-activity": (
      <DiscountActivity initialKind={activeParams.get("kind") || ""} />
    ),
  }[section];

  const activeModule = navigation.find((module) =>
    module.sections.some((item) => item[0] === section),
  );
  const activeLabel =
    items.find((item) => item[0] === section)?.[1] || "Overview";
  const displayName = account?.name || role || "Account";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const matches = navigation
    .flatMap((module) =>
      module.sections.map((item) => ({ module: module.label, item })),
    )
    .filter(({ module, item }) =>
      `${module} ${item[0]} ${item[1]}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
  const leaveWorkspace = () => {
    if (mayLeave("pos")) onBack?.();
  };
  const sidebar = (
    <aside aria-label="Admin navigation" className="admin-sidebar">
      <button
        type="button"
        className="admin-brand"
        onClick={() => navigate(first)}
      >
        <span className="admin-brand-icon">
          <UtensilsCrossed size={19} />
        </span>
        <span>
          <strong>RestoAdmin</strong>
          <small title={businessLabel}>{businessLabel}</small>
        </span>
      </button>
      <p className="admin-workspace-label">RESTAURANT WORKSPACE</p>
      <nav className="admin-primary-nav" aria-label="Primary modules">
        {navigation.map((module) => {
          const Icon = icons[module.id];
          return (
            <button
              type="button"
              key={module.id}
              aria-current={activeModule?.id === module.id ? "page" : undefined}
              className={`admin-nav-item ${activeModule?.id === module.id ? "is-active" : ""}`}
              onClick={() => navigate(module.sections[0][0])}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{module.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="admin-sidebar-bottom">
        <button
          type="button"
          className="admin-profile-trigger"
          onClick={() => navigate("profile")}
        >
          <span className="admin-avatar">{initials}</span>
          <span>
            <strong>{displayName}</strong>
            <small>{role === "ADMIN" ? "Administrator" : role}</small>
          </span>
        </button>
        <button
          type="button"
          className="admin-exit-button"
          onClick={leaveWorkspace}
        >
          <ArrowLeft size={15} />
          {tr("posDashboard")}
        </button>
      </div>
    </aside>
  );
  return (
    <div className="admin-shell admin-workspace">
      <a
        className="admin-skip-link"
        href="#admin-main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("admin-main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="admin-sidebar-desktop">{sidebar}</div>
      {sidebarOpen && (
        <AccessibleDialog
          title="Admin navigation"
          onClose={() => setSidebarOpen(false)}
          className="admin-mobile-navigation"
          panelClassName="admin-navigation-panel"
        >
          <button
            type="button"
            className="admin-icon-button admin-close-navigation"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
          {sidebar}
        </AccessibleDialog>
      )}
      <div className="admin-main-shell">
        {networkState !== "ONLINE" && (
          <div
            role="status"
            aria-live="assertive"
            className={`admin-network-banner ${networkState === "OFFLINE" ? "is-offline" : ""}`}
          >
            {tr(
              networkState === "OFFLINE" ? "adminOffline" : "adminReconnecting",
            )}
          </div>
        )}
        <header className="admin-topbar">
          <button
            type="button"
            aria-label={tr("adminMenu")}
            aria-expanded={sidebarOpen}
            aria-haspopup="dialog"
            className="admin-icon-button admin-mobile-menu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={19} />
          </button>
          <div className="admin-breadcrumb">
            <strong>{activeModule?.label || "Administration"}</strong>
            {activeModule?.sections.length > 1 && <span> / {activeLabel}</span>}
          </div>
          <div className="admin-topbar-actions">
            {section === "dashboard" &&
            dashboardState.data?.filterOptions?.branches?.length ? (
              <label className="admin-header-branch">
                <Building2 size={14} aria-hidden="true" />
                <select
                  aria-label="Dashboard branch"
                  value={dashboardState.filters.branchId}
                  onChange={(event) =>
                    dashboardState.setFilter("branchId", event.target.value)
                  }
                >
                  <option value="">All branches</option>
                  {dashboardState.data.filterOptions.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="admin-company-context">
                <Building2 size={14} />
                {businessLabel}
              </span>
            )}
            {allowed.has("system.health.view") && (
              <OperationalIndicator
                health={healthState.data}
                onClick={() => navigate("system-health")}
              />
            )}
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Find a module"
              title="Find a module (Ctrl/⌘ K)"
              onClick={() => {
                setQuery("");
                setSearchOpen(true);
              }}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              className="admin-avatar admin-avatar-button"
              aria-label="My profile"
              onClick={() => navigate("profile")}
            >
              {initials}
            </button>
            {onSwitchStaff && role !== "ADMIN" && (
              <button
                type="button"
                className="admin-button admin-button-secondary admin-switch-staff"
                onClick={() => {
                  if (mayLeave("pos")) onSwitchStaff();
                }}
              >
                <Users size={15} />
                Switch staff
              </button>
            )}
          </div>
        </header>
        {activeModule?.sections.length > 1 && (
          <nav
            aria-label={`${activeModule.label} sections`}
            className="admin-section-nav"
          >
            {activeModule.sections.map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={section === id ? "is-active" : ""}
                aria-current={section === id ? "page" : undefined}
                onClick={() => navigate(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        <main id="admin-main-content" tabIndex={-1} className="admin-content">
          <div key={routeKey}>{content}</div>
        </main>
      </div>
      {toast && (
        <div
          className={`admin-toast ${toast.tone === "error" ? "is-error" : ""}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          <ShieldCheck size={18} />
          <p>{toast.message}</p>
          <button
            type="button"
            className="admin-icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {searchOpen && (
        <AccessibleDialog
          title="Find a module"
          onClose={() => setSearchOpen(false)}
          className="admin-command-dialog"
          panelClassName="admin-command-panel"
        >
          <header className="admin-dialog-heading">
            <div>
              <h2>Find a module</h2>
              <p>Search the pages available to your account.</p>
            </div>
            <button
              type="button"
              className="admin-icon-button"
              aria-label="Close module search"
              onClick={() => setSearchOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <label className="admin-command-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Find module by name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu, orders, staff, settings…"
            />
          </label>
          <div className="admin-command-results">
            {matches.length ? (
              matches.map(({ module, item }) => (
                <button
                  type="button"
                  key={item[0]}
                  data-admin-section={item[0]}
                  onClick={() => navigate(item[0])}
                >
                  <span>{item[1]}</span>
                  <small>{module}</small>
                </button>
              ))
            ) : (
              <p role="status">No matching modules.</p>
            )}
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
