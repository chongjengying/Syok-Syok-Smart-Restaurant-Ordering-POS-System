import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Moon,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { adminPanelGroups } from "../adminModuleData";
import { previewNav } from "../mockData";
import { usePreviewWorkspace } from "../hooks/usePreviewWorkspace";
import { Button, Modal } from "./PreviewUi";
import {
  canonicalPage,
  primaryForPage,
  primaryModules,
} from "../previewNavigation";

const initials = (value) =>
  value
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

export default function PreviewShell({
  page,
  company,
  owner,
  branches,
  activeTitle,
  navigate,
  theme,
  setTheme,
  mobileNav,
  setMobileNav,
  message,
  dismissMessage,
  notify,
  children,
}) {
  const workspace = usePreviewWorkspace();
  const [popup, setPopup] = useState("");
  const [query, setQuery] = useState("");
  const [locked, setLocked] = useState(false);
  const navRef = useRef(null);
  const menuRef = useRef(null);
  const popRef = useRef(null);
  const activeModule = primaryForPage(page);
  const allRoutes = [...adminPanelGroups, ...previewNav].flatMap(
    (group) => group.items,
  );
  const main = page === "panel/dashboard" ? "Dashboard" : activeTitle;
  const alerts = [
    {
      label: `${workspace.modules.orders.filter((row) => row.Payment === "Unpaid" && row.Status !== "Cancelled").length} orders are awaiting payment`,
      route: "panel/orders",
    },
    {
      label: `${workspace.modules.inventory.filter((row) => row.Status === "Low stock" || row.Status === "Out of stock").length} stock items need attention`,
      route: "panel/inventory",
    },
    {
      label: "Review this shift before closing service",
      route: "panel/cash-shifts",
    },
  ];
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPopup("search");
      }
      if (event.key === "Escape") {
        setPopup("");
        setMobileNav(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setMobileNav]);
  useEffect(() => {
    if (!mobileNav) return undefined;
    const previous = document.activeElement;
    navRef.current?.querySelector("button")?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const items = [
        ...navRef.current.querySelectorAll("a[href],button,select"),
      ].filter((element) => element.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus?.();
    };
  }, [mobileNav]);
  useEffect(() => {
    const close = (event) => {
      if (popRef.current && !popRef.current.contains(event.target))
        setPopup((current) =>
          ["notifications", "options"].includes(current) ? "" : current,
        );
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const go = (route) => {
    setPopup("");
    navigate(route);
  };
  return (
    <div className="preview-app" data-theme={theme}>
      <a href="#preview-main" className="preview-skip-link">
        Skip to content
      </a>
      {mobileNav && (
        <button
          type="button"
          className="preview-sidebar-backdrop is-open"
          aria-label="Close navigation backdrop"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        ref={navRef}
        className={`preview-sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Admin navigation"
      >
        <div className="preview-sidebar-brand">
          <a
            className="preview-brand"
            href="/preview/admin/panel/dashboard"
            onClick={(event) => {
              event.preventDefault();
              go("panel/dashboard");
            }}
          >
            <span className="preview-logo">
              <Utensils size={19} />
            </span>
            <span>
              <strong>RestoAdmin</strong>
              <small>{company.name}</small>
            </span>
          </a>
          <button
            type="button"
            className="preview-icon-button preview-mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={18} />
          </button>
        </div>
        <p className="preview-workspace-label">RESTAURANT WORKSPACE</p>
        <nav
          className="preview-nav preview-primary-nav"
          aria-label="Primary modules"
        >
          {primaryModules.map((module) => {
            const Icon = {
              dashboard: LayoutDashboard,
              menu: Utensils,
              orders: ClipboardList,
              tables: LayoutDashboard,
              staff: Users,
              reports: Activity,
              settings: Settings2,
            }[module.icon];
            return (
              <button
                key={module.route}
                type="button"
                className={`preview-nav-link ${activeModule.route === module.route ? "is-active" : ""}`}
                aria-current={
                  activeModule.route === module.route ? "page" : undefined
                }
                onClick={() => go(module.route)}
              >
                <Icon size={19} strokeWidth={1.7} />
                <span>{module.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="preview-sidebar-bottom">
          <button
            type="button"
            className="preview-sidebar-search preview-button preview-button-secondary"
            aria-label="Find a module"
            onClick={() => {
              setMobileNav(false);
              setPopup("search");
            }}
          >
            <Search size={16} />
            Find a module
          </button>
          <button
            className="preview-profile"
            type="button"
            onClick={() => go("profile")}
          >
            <span className="preview-avatar">{initials(owner.name)}</span>
            <span>
              <strong>{owner.name}</strong>
              <small>
                {workspace.role === "Owner"
                  ? "Owner"
                  : `${workspace.role} preview`}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="preview-main-shell">
        <header className="preview-topbar">
          <button
            ref={menuRef}
            type="button"
            className="preview-icon-button preview-mobile-menu"
            aria-label="Open navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(true)}
          >
            <Menu size={19} />
          </button>
          <div className="preview-breadcrumb">
            <strong>
              {page === "panel/dashboard" ? "Dashboard" : activeModule.label}
            </strong>
            {!["panel/dashboard", activeModule.route].includes(
              canonicalPage(page),
            ) && (
              <>
                <span>/</span>
                <span>{main}</span>
              </>
            )}
          </div>
          <span className="preview-topbar-spacer" />
          <label className="preview-top-branch">
            <Building2 size={14} />
            <select
              aria-label="Current branch"
              value={workspace.branch}
              onChange={(event) => workspace.setBranch(event.target.value)}
            >
              <option>All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.name}>
                  {branch.name} ({branch.code.split("-")[0]})
                </option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
          <div className="preview-topbar-actions" ref={popRef}>
            <span className="preview-mock-pill">
              <span />
              UI PREVIEW — MOCK DATA
            </span>
            <button
              className="preview-icon-button"
              type="button"
              aria-label="Find a module"
              title="Find a module (⌘K)"
              onClick={() => setPopup("search")}
            >
              <Search size={16} />
            </button>
            <button
              className="preview-icon-button"
              type="button"
              aria-label="Preview options"
              aria-expanded={popup === "options"}
              onClick={() => setPopup(popup === "options" ? "" : "options")}
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              className="preview-top-avatar"
              type="button"
              aria-label="My profile"
              onClick={() => go("profile")}
            >
              {initials(owner.name)}
            </button>
            {popup === "notifications" && (
              <section className="preview-popover preview-notifications">
                <header>
                  <strong>Service notifications</strong>
                  <span>{alerts.length} updates</span>
                </header>
                {alerts.map((alert) => (
                  <button
                    type="button"
                    key={alert.route}
                    onClick={() => go(alert.route)}
                  >
                    <span className="preview-notification-icon">
                      <Bell size={15} />
                    </span>
                    <span>
                      {alert.label}
                      <small>Sample workspace · just now</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
                <button
                  type="button"
                  className="preview-popover-footer"
                  onClick={() => go("panel/audit")}
                >
                  View activity log <ChevronRight size={13} />
                </button>
              </section>
            )}
            {popup === "options" && (
              <section className="preview-popover preview-options">
                <strong>Preview options</strong>
                <p>
                  Explore the same screen with different states and permissions.
                </p>
                <label>
                  Preview role
                  <select
                    aria-label="Preview role"
                    value={workspace.role}
                    onChange={(event) => workspace.setRole(event.target.value)}
                  >
                    <option>Owner</option>
                    <option>Manager</option>
                    <option>Read only</option>
                  </select>
                </label>
                <label>
                  Screen state
                  <select
                    aria-label="Preview screen state"
                    value={workspace.screenState}
                    onChange={(event) =>
                      workspace.setScreenState(event.target.value)
                    }
                  >
                    <option value="default">Populated</option>
                    <option value="loading">Loading</option>
                    <option value="empty">Empty</option>
                    <option value="error">Error</option>
                    <option value="offline">Offline</option>
                    <option value="access-denied">Permission denied</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                  {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}{" "}
                  Switch to {theme === "light" ? "dark" : "light"} mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    workspace.refresh();
                    notify("Sample workspace refreshed.");
                    setPopup("");
                  }}
                >
                  <RefreshCw size={16} />
                  Refresh sample data
                </button>
                <button type="button" onClick={() => setPopup("notifications")}>
                  <Bell size={16} />
                  Service notifications
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLocked(true);
                    setPopup("");
                  }}
                >
                  <LockKeyhole size={16} />
                  Lock preview
                </button>
                <button type="button" onClick={() => go("register")}>
                  <Users size={16} />
                  Account setup examples
                </button>
                <button type="button" onClick={() => setPopup("help")}>
                  <CircleHelp size={16} /> Workspace guide
                </button>
              </section>
            )}
          </div>
        </header>
        <div className="preview-mobile-mock-label">
          Mock Data · isolated UI preview
        </div>
        {workspace.readOnly && (
          <div className="preview-permission-banner">
            <ShieldCheck size={15} /> Read-only preview role · You can browse
            and export; editing is disabled.
            <button type="button" onClick={() => workspace.setRole("Owner")}>
              Return to owner view
            </button>
          </div>
        )}
        {message && (
          <div className="preview-toast" role="status">
            <CheckCircle2 size={17} />
            <span>{message}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={dismissMessage}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {activeModule.pages.length > 1 && (
          <nav
            className="preview-section-nav"
            aria-label={`${activeModule.label} sections`}
          >
            {activeModule.pages.map(([route, label]) => (
              <button
                key={route}
                type="button"
                aria-current={
                  canonicalPage(page) === route ? "page" : undefined
                }
                className={canonicalPage(page) === route ? "is-active" : ""}
                onClick={() => go(route)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {children}
      </div>
      {popup === "search" && (
        <Modal
          title="Find a module"
          description="Jump to any admin or workspace setup screen."
          onClose={() => setPopup("")}
        >
          <label className="preview-search">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Find module by name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search modules…"
            />
          </label>
          <div className="preview-command-results">
            {allRoutes
              .filter(([, label]) =>
                label.toLowerCase().includes(query.toLowerCase()),
              )
              .map(([route, label]) => (
                <button type="button" key={route} onClick={() => go(route)}>
                  <span>{label}</span>
                  <small>
                    {route.startsWith("panel/")
                      ? "Admin panel"
                      : "Workspace setup"}
                  </small>
                  <ArrowRight size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {popup === "help" && (
        <Modal
          title="Workspace guide"
          description="Explore connected restaurant workflows using sample data."
          onClose={() => setPopup("")}
        >
          <div className="preview-guide-links">
            {[
              [
                "Start a service",
                "Open a register, create an order, and complete a sample payment.",
                "panel/cash-shifts",
              ],
              [
                "Manage your menu",
                "Add items, set availability, and trace stock changes.",
                "panel/products",
              ],
              [
                "Set up your team",
                "Create branch-assigned staff records and review their role.",
                "panel/users",
              ],
              [
                "Review money & history",
                "Inspect receipts, refund collected payments, and view the audit trail.",
                "panel/payments",
              ],
            ].map(([title, detail, route]) => (
              <button type="button" key={title} onClick={() => go(route)}>
                <strong>{title}</strong>
                <span>{detail}</span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <p className="preview-note-box">
            UI preview — mock data only. Changes last for this browser session
            and reset when the page is refreshed.
          </p>
        </Modal>
      )}
      {locked && (
        <Modal
          title="Terminal locked"
          description={`${owner.name} · ${workspace.branch}`}
          onClose={() => setLocked(false)}
          footer={
            <Button onClick={() => setLocked(false)}>Unlock preview</Button>
          }
        >
          <div className="preview-lock-state">
            <LockKeyhole size={38} />
            <h3>Your workspace is paused</h3>
            <p>
              This lock demonstrates the screen state. No real account or
              terminal session is changed.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
