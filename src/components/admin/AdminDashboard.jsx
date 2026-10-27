import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleX,
  Clock3,
  CreditCard,
  ExternalLink,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Settings,
  Sparkles,
  Table2,
  Utensils,
  WalletCards,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
  humanizeCode,
} from "../../utils/admin-dashboard-formatters";
import DashboardFilters from "./dashboard/DashboardFilters";
import {
  DashboardSkeleton,
  EmptyState,
  ErrorState,
  Panel,
  StatusBadge,
} from "./dashboard/DashboardPrimitives";
import SystemHealthSummaryCard from "../system-health/SystemHealthSummaryCard";

const paymentIcons = {
  CASH: Banknote,
  QR: QrCode,
  CARD: CreditCard,
  EWALLET: WalletCards,
};

function SalesPerformance({ data, state }) {
  const rows = data.salesPerformance || [];
  const metric = state.filters.metric;
  const valueOf = (row) =>
    metric === "orders"
      ? Number(row.order_count || 0)
      : metric === "averageOrderValue"
        ? Number(row.average_order_value || 0)
        : Number(row.revenue || 0);
  const max = Math.max(1, ...rows.map(valueOf));
  const format = metric === "orders" ? formatNumber : formatCurrency;
  const linePoints = rows
    .map(
      (row, index) =>
        `${((index + 0.5) / rows.length) * 100},${100 - Math.max(5, (valueOf(row) / max) * 100)}`,
    )
    .join(" ");
  return (
    <Panel
      title="Sales trend"
      subtitle="Recognised when an order is fully settled; refunds appear in the period they occur."
      className="xl:col-span-2"
      action={
        <div className="flex gap-2">
          <select
            aria-label="Chart metric"
            value={metric}
            onChange={(e) => state.setFilter("metric", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
          >
            <option value="revenue">Revenue</option>
            <option value="orders">Order count</option>
            <option value="averageOrderValue">Average order value</option>
          </select>
          <select
            aria-label="Chart interval"
            value={state.filters.granularity}
            onChange={(e) => state.setFilter("granularity", e.target.value)}
            className="rounded-lg border px-2 py-1.5 text-xs"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      }
    >
      {rows.length ? (
        <div className="mt-6">
          <div className="relative flex h-60 items-end gap-2 overflow-hidden rounded-xl border border-slate-100 bg-[linear-gradient(to_bottom,rgba(16,42,67,.06)_1px,transparent_1px)] bg-[length:100%_25%] px-3 pb-0 pt-4">
            <div className="absolute inset-x-3 top-4 bottom-0 border-b border-slate-200" />
            <svg
              className="pointer-events-none absolute inset-x-3 top-4 h-[calc(100%-16px)] w-[calc(100%-24px)]"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={linePoints}
                fill="none"
                stroke="#087F70"
                strokeWidth="1.4"
                vectorEffect="non-scaling-stroke"
              />
              <polyline
                points={linePoints}
                fill="none"
                stroke="#087F70"
                strokeWidth="7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity=".12"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {rows.map((row, index) => (
              <div
                key={`${row.bucket}-${index}`}
                className="group relative z-10 flex h-full min-w-0 flex-1 items-end"
              >
                <div
                  title={`${row.bucket}: ${format(valueOf(row))}`}
                  className="w-full rounded-t-md bg-gradient-to-t from-[#78CFC2] to-[#B9EEE6] transition group-hover:from-[#0F9D8A] group-hover:to-[#78CFC2]"
                  style={{
                    height: `${Math.max(5, (valueOf(row) / max) * 100)}%`,
                  }}
                />
                <span className="pointer-events-none absolute -top-1 left-1/2 z-20 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#102A43] px-2 py-1 text-[10px] font-bold text-white shadow-lg group-hover:block">
                  {format(valueOf(row))}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2 px-3">
            {rows.map((row, index) => (
              <span
                key={`${row.bucket}-label-${index}`}
                className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-slate-400"
              >
                {String(row.bucket).slice(5)}
              </span>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-sm bg-[#78CFC2]" />{" "}
              {metric === "orders" ? "Orders" : "Revenue"}
            </span>
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-[#087F70]" /> Trend
            </span>
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
    </Panel>
  );
}

function PaymentOverview({ data, navigate }) {
  const summary = data.payments || {};
  const methods = summary.methods || [];
  const lookup = new Map(methods.map((item) => [item.payment_method, item]));
  const max = Math.max(1, ...methods.map((item) => Number(item.amount || 0)));
  return (
    <Panel
      title="Payment Overview"
      subtitle="Successful and historically refunded transactions; failures never enter sales totals."
    >
      <div className="mt-5 space-y-4">
        {["CASH", "QR", "CARD", "EWALLET"].map((method) => {
          const item = lookup.get(method) || {};
          const Icon = paymentIcons[method];
          return (
            <button
              key={method}
              onClick={() => navigate("payments", { method })}
              className="block w-full text-left"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-bold text-slate-600">
                  <Icon size={15} />
                  {method === "EWALLET" ? "E-Wallet" : method}
                </span>
                <strong>{formatCurrency(item.amount)}</strong>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-amber-400"
                  style={{
                    width: `${(Number(item.amount || 0) / max) * 100}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {formatNumber(item.transaction_count)} transactions
              </p>
            </button>
          );
        })}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
        <button
          onClick={() => navigate("payments", { status: "REFUNDED" })}
          className="rounded-lg bg-amber-50 p-2"
        >
          <strong className="block text-sm text-amber-800">
            {formatCurrency(summary.refunds?.amount)}
          </strong>
          <span className="text-[10px] text-amber-700">
            {formatNumber(summary.refunds?.count)} refunds
          </span>
        </button>
        <button
          onClick={() => navigate("payments", { status: "FAILED" })}
          className="rounded-lg bg-red-50 p-2"
        >
          <strong className="block text-sm text-red-700">
            {formatNumber(summary.failed?.count)}
          </strong>
          <span className="text-[10px] text-red-600">Failed payments</span>
        </button>
        <button
          onClick={() => navigate("orders", { paymentStatus: "UNPAID" })}
          className="rounded-lg bg-slate-100 p-2"
        >
          <strong className="block text-sm">
            {formatNumber(summary.unpaidOrders)}
          </strong>
          <span className="text-[10px] text-slate-500">Unpaid orders</span>
        </button>
      </div>
    </Panel>
  );
}

function OrderOverview({ data, navigate }) {
  const summary = data.orders || {};
  const statuses = data.orderStatus || {};
  const types = data.orderTypes || {};
  const total = Math.max(1, Number(summary.total || 0));
  const statusCards = [
    ["PLACED", ShoppingBag],
    ["CONFIRMED, PREPARING", Utensils],
    ["READY", Sparkles],
    ["SERVED", WalletCards],
    ["COMPLETED", CheckCircle2],
    ["CANCELLED", CircleX],
  ];
  return (
    <Panel
      title="Order Overview"
      subtitle="Orders created in the selected period."
    >
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          onClick={() => navigate("orders", {})}
          className="rounded-xl bg-slate-950 p-3 text-left text-white"
        >
          <span className="text-[10px] uppercase text-slate-400">Total</span>
          <strong className="mt-1 block text-xl">
            {formatNumber(summary.total)}
          </strong>
        </button>
        <button
          onClick={() => navigate("orders", {})}
          className="rounded-xl bg-sky-50 p-3 text-left"
        >
          <span className="text-[10px] uppercase text-sky-600">Open</span>
          <strong className="mt-1 block text-xl">
            {formatNumber(summary.open)}
          </strong>
        </button>
        <button
          onClick={() => navigate("orders", { status: "COMPLETED" })}
          className="rounded-xl bg-emerald-50 p-3 text-left"
        >
          <span className="text-[10px] uppercase text-emerald-600">
            Completed
          </span>
          <strong className="mt-1 block text-xl">
            {formatNumber(summary.completed)}
          </strong>
        </button>
        <button
          onClick={() => navigate("orders", { status: "CANCELLED" })}
          className="rounded-xl bg-red-50 p-3 text-left"
        >
          <span className="text-[10px] uppercase text-red-600">Cancelled</span>
          <strong className="mt-1 block text-xl">
            {formatNumber(summary.cancelled)}
          </strong>
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {statusCards.map(([label, Icon]) => {
          const codes = label.split(", ");
          const value = codes.reduce(
            (sum, code) => sum + Number(statuses[code] || 0),
            0,
          );
          return (
            <button
              key={label}
              onClick={() =>
                navigate(
                  "orders",
                  codes.length === 1 ? { status: codes[0] } : {},
                )
              }
              className="flex items-center justify-between rounded-lg border p-2 text-xs hover:border-amber-300"
            >
              <span className="flex items-center gap-2 text-slate-500">
                <Icon size={14} />
                {label}
              </span>
              <strong>{value}</strong>
            </button>
          );
        })}
      </div>
      <div className="mt-5">
        <div className="mb-2 flex justify-between text-xs">
          <span>Dine-in {formatNumber(types.dineIn)}</span>
          <span>Takeaway {formatNumber(types.takeaway)}</span>
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="bg-sky-500"
            style={{ width: `${(Number(types.dineIn || 0) / total) * 100}%` }}
          />
          <div
            className="bg-violet-400"
            style={{ width: `${(Number(types.takeaway || 0) / total) * 100}%` }}
          />
        </div>
      </div>
    </Panel>
  );
}

function LiveOperations({ data, navigate }) {
  const tables = data.live?.tables || {};
  const kitchen = data.live?.kitchen || {};
  const items = [
    ...(data.access?.tables
      ? [
          [
            "Available tables",
            tables.available,
            Table2,
            "emerald",
            () => navigate("tables", { status: "AVAILABLE" }),
          ],
          [
            "Occupied tables",
            tables.occupied,
            Table2,
            "sky",
            () => navigate("tables", { status: "OCCUPIED" }),
          ],
          [
            "Cleaning tables",
            tables.cleaning,
            RefreshCw,
            "slate",
            () => navigate("tables", { status: "CLEANING" }),
          ],
        ]
      : []),
    ...(data.access?.orders
      ? [
          [
            "Waiting payment",
            tables.waitingPayment,
            WalletCards,
            "amber",
            () => navigate("orders", { paymentStatus: "UNPAID" }),
          ],
          [
            "Kitchen waiting",
            kitchen.waiting,
            Clock3,
            "amber",
            () => navigate("orders", { status: "CONFIRMED" }),
          ],
          [
            "Preparing",
            kitchen.preparing,
            Utensils,
            "sky",
            () => navigate("orders", { status: "PREPARING" }),
          ],
          [
            "Ready",
            kitchen.ready,
            Sparkles,
            "emerald",
            () => navigate("orders", { status: "READY" }),
          ],
          [
            "Delayed",
            kitchen.delayed,
            AlertTriangle,
            "red",
            () => navigate("orders", { status: "PREPARING" }),
          ],
        ]
      : []),
  ];
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-800",
    slate: "bg-slate-100 text-slate-600",
    red: "bg-red-50 text-red-700",
  };
  return (
    <Panel
      title="Live Operations"
      subtitle={`Live table and kitchen state · delayed after ${data.delayedOrderMinutes || 20} minutes`}
    >
      {items.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          {items.map(([label, value, Icon, tone, onClick]) => (
            <button
              key={label}
              onClick={onClick}
              className={`rounded-xl p-3 text-left transition hover:-translate-y-0.5 ${colors[tone]}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase">
                  {label}
                </span>
                <Icon size={15} />
              </div>
              <strong className="mt-2 block text-xl text-slate-950">
                {formatNumber(value)}
              </strong>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>You do not have access to live operations.</EmptyState>
      )}
    </Panel>
  );
}

function TopProducts({ data, navigate, canOpen }) {
  const [sort, setSort] = useState("quantity");
  const rows = useMemo(
    () =>
      [...(data.topProducts || [])].sort(
        (a, b) => Number(b[sort] || 0) - Number(a[sort] || 0),
      ),
    [data.topProducts, sort],
  );
  return (
    <Panel
      title="Top-selling items"
      subtitle="Settled sales in the selected period."
      action={
        <select
          aria-label="Sort top-selling items"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="quantity">By quantity</option>
          <option value="revenue">By sales</option>
        </select>
      }
      className="admin-dashboard-panel"
    >
      {rows.length ? (
        <div className="admin-table-scroll">
          <table className="admin-top-products">
            <thead>
              <tr>
                <th>Item</th>
                <th>Sold</th>
                <th>Sales</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((product) => (
                <tr key={product.product_id}>
                  <td>
                    {canOpen("products") ? (
                      <button
                        type="button"
                        className="admin-text-link admin-item-link"
                        onClick={() =>
                          navigate("products", {
                            productId: product.product_id,
                          })
                        }
                      >
                        {product.name}
                      </button>
                    ) : (
                      product.name
                    )}
                  </td>
                  <td>{formatNumber(product.quantity)}</td>
                  <td className="admin-money">
                    {formatCurrency(product.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No settled item sales for this period.</EmptyState>
      )}
      <p className="admin-panel-note">
        Historical sale prices · tax and service charges excluded
      </p>
    </Panel>
  );
}

function AlertsPanel({ data, navigate }) {
  const go = (alert) => {
    if (alert.destination === "payments")
      navigate("payments", { status: alert.filter_value });
    else if (alert.destination === "orders")
      navigate("orders", {
        status: alert.filter_value === "UNPAID" ? "" : alert.filter_value,
        paymentStatus: alert.filter_value === "UNPAID" ? "UNPAID" : "",
      });
    else navigate(alert.destination || "dashboard", {});
  };
  return (
    <Panel
      title="Alerts & Attention"
      subtitle="Prioritised operational exceptions, not a raw event feed."
    >
      {data.alerts?.length ? (
        <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
          {data.alerts.map((alert, index) => (
            <button
              key={`${alert.code}-${alert.reference}-${index}`}
              onClick={() => go(alert)}
              className="flex w-full items-start gap-3 rounded-xl border p-3 text-left hover:border-amber-300"
            >
              <AlertTriangle
                size={17}
                className={
                  alert.severity === "CRITICAL"
                    ? "mt-0.5 text-red-600"
                    : alert.severity === "WARNING"
                      ? "mt-0.5 text-amber-600"
                      : "mt-0.5 text-sky-600"
                }
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <strong className="text-sm">{alert.title}</strong>
                  <StatusBadge value={alert.severity} />
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {alert.reference} · {alert.message}
                </span>
              </span>
              <ExternalLink size={14} className="mt-1 text-slate-300" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState>No alerts require attention.</EmptyState>
      )}
    </Panel>
  );
}

function RecentOrders({ data, navigate }) {
  return (
    <Panel
      title="Recent orders"
      subtitle="Latest orders in the selected period."
      action={
        <button
          type="button"
          className="admin-text-link"
          onClick={() => navigate("orders")}
        >
          View all orders <ExternalLink size={13} />
        </button>
      }
      className="admin-dashboard-panel"
    >
      {data.recentOrders?.length ? (
        <div className="admin-table-scroll">
          <table className="admin-recent-orders">
            <thead>
              <tr>
                {["Order", "Service", "Total", "Payment", "Status"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.slice(0, 5).map((order) => (
                <tr key={order.id}>
                  <td>
                    <button
                      type="button"
                      className="admin-text-link admin-item-link"
                      onClick={() =>
                        navigate("orders", { search: order.order_number })
                      }
                    >
                      {order.order_number}
                    </button>
                    <small>{formatTime(order.created_at)}</small>
                  </td>
                  <td>
                    {humanizeCode(order.dining_mode)}
                    <small>{order.table_number || "Counter order"}</small>
                  </td>
                  <td className="admin-money">{formatCurrency(order.total)}</td>
                  <td>
                    <StatusBadge value={order.payment_status} />
                  </td>
                  <td>
                    <StatusBadge value={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState>No orders for this period.</EmptyState>
      )}
      <p className="admin-panel-note">Showing up to 5 recent orders</p>
    </Panel>
  );
}

function StaffPerformance({ data }) {
  return (
    <Panel
      title="Staff Performance"
      subtitle="Operational aggregates for coaching and planning—not employee surveillance."
    >
      {data.staffPerformance?.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-xs">
            <thead>
              <tr className="border-b text-left uppercase text-slate-400">
                {[
                  "Staff",
                  "Orders",
                  "Sales",
                  "AOV",
                  "Refunds",
                  "Cancelled",
                  "Account",
                ].map((label) => (
                  <th key={label} className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.staffPerformance.map((staff) => (
                <tr key={staff.id} className="border-b border-slate-100">
                  <td className="p-2">
                    <strong className="block text-sm">{staff.name}</strong>
                    <span className="text-slate-400">{staff.role}</span>
                  </td>
                  <td className="p-2 font-bold">
                    {formatNumber(staff.orders_handled)}
                  </td>
                  <td className="p-2 font-bold">
                    {formatCurrency(staff.sales_amount)}
                  </td>
                  <td className="p-2">
                    {formatCurrency(staff.average_order_value)}
                  </td>
                  <td className="p-2">{formatNumber(staff.refund_count)}</td>
                  <td className="p-2">
                    {formatNumber(staff.cancellation_count)}
                  </td>
                  <td className="p-2">
                    <StatusBadge value={staff.account_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState />
      )}
    </Panel>
  );
}

function RecentActivity({ data, navigate }) {
  return (
    <Panel
      title="Recent Activity"
      subtitle="Append-only audit history; dashboard access is read-only."
    >
      {data.recentActivities?.length ? (
        <div className="mt-4 space-y-2">
          {data.recentActivities.map((activity) => (
            <button
              key={activity.id}
              onClick={() => navigate("audit", { search: activity.action })}
              className="flex w-full items-start gap-3 rounded-xl p-2 text-left hover:bg-slate-50"
            >
              <span className="rounded-full bg-slate-100 p-2 text-slate-500">
                <Activity size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm">
                  {humanizeCode(activity.action)}
                </strong>
                <span className="block truncate text-xs text-slate-400">
                  {activity.actor_name} · {humanizeCode(activity.entity_type)}{" "}
                  {activity.entity_id || ""}
                </span>
              </span>
              <time className="text-[10px] text-slate-400">
                {formatTime(activity.created_at)}
              </time>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </Panel>
  );
}

export default function AdminDashboard({
  state,
  onNavigate = () => {},
  systemHealth = null,
  canViewSystemAdministration = false,
  canViewSystemHealth = false,
  canOpen = () => true,
}) {
  if (state.isLoading) return <DashboardSkeleton />;
  if (state.error && !state.data)
    return <ErrorState message={state.error} onRetry={state.refresh} />;
  const data = state.data || {},
    sales = data.sales || {};
  const navigate = (section, filters = {}) => {
    if (!canOpen(section)) return;
    const dates = ["orders", "payments", "audit"].includes(section)
      ? { dateFrom: state.filters.dateFrom, dateTo: state.filters.dateTo }
      : {};
    onNavigate(section, { ...dates, ...filters });
  };
  const today = state.filters.preset === "today";
  return (
    <section className="admin-dashboard">
      <header className="admin-page-heading">
        <div>
          <h1>{today ? "Today's overview" : "Business overview"}</h1>
          <p>A clear view of your restaurant’s day.</p>
        </div>
        <div className="admin-page-actions">
          <span className="admin-context-date">
            <CalendarDays size={15} />
            {formatDate(new Date())}
          </span>
          <button
            type="button"
            className="admin-button admin-button-secondary"
            disabled={state.isRefreshing}
            onClick={state.refresh}
          >
            <RefreshCw
              size={15}
              className={state.isRefreshing ? "animate-spin" : ""}
            />
            {state.isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
          {canOpen("reports") && (
            <button
              type="button"
              className="admin-button admin-button-primary"
              onClick={() => navigate("reports")}
            >
              View reports <ExternalLink size={14} />
            </button>
          )}
        </div>
      </header>
      <DashboardFilters state={state} data={data} showBranch={false} />
      {state.error && (
        <p role="alert" className="admin-error">
          {state.error} Showing the last successful snapshot from{" "}
          {state.lastUpdated
            ? formatDateTime(state.lastUpdated)
            : "an earlier refresh"}
          .
        </p>
      )}
      {data.access?.reports ? (
        <div className="admin-dashboard-metrics">
          <article className="admin-surface admin-summary-card">
            <p>{today ? "Today's sales" : "Period net sales"}</p>
            <strong>{formatCurrency(sales.netSales)}</strong>
            <small>Net receipts after refunds</small>
          </article>
          <article className="admin-surface admin-summary-card">
            <p>{today ? "Today's orders" : "Period orders"}</p>
            <strong>{formatNumber(data.orders?.total)}</strong>
            <small>
              {formatNumber(sales.settledOrders)} settled ·{" "}
              {formatNumber(data.orders?.open)} open
            </small>
          </article>
          <article className="admin-surface admin-summary-card">
            <p>Average order value</p>
            <strong>{formatCurrency(sales.averageOrderValue)}</strong>
            <small>
              Based on {formatNumber(sales.settledOrders)} settled orders
            </small>
          </article>
        </div>
      ) : (
        <p className="admin-surface p-4">
          Sales metrics require report access.
        </p>
      )}
      <div className="admin-dashboard-columns">
        {data.access?.orders && (
          <RecentOrders data={data} navigate={navigate} />
        )}
        {data.access?.reports && (
          <TopProducts data={data} navigate={navigate} canOpen={canOpen} />
        )}
      </div>
      <details className="admin-dashboard-insights">
        <summary>More insights and operational activity</summary>
        <div className="admin-insights-grid">
          {data.access?.reports && (
            <SalesPerformance data={data} state={state} />
          )}
          {data.access?.payments && (
            <PaymentOverview data={data} navigate={navigate} />
          )}
          {data.access?.orders && (
            <OrderOverview data={data} navigate={navigate} />
          )}
          <LiveOperations data={data} navigate={navigate} />
          <AlertsPanel data={data} navigate={navigate} />
          {data.access?.staffPerformance && <StaffPerformance data={data} />}
          {data.access?.audit && (
            <RecentActivity data={data} navigate={navigate} />
          )}
          {canViewSystemHealth && (
            <SystemHealthSummaryCard
              health={systemHealth}
              onOpen={() => navigate("system-health")}
            />
          )}
          {canViewSystemAdministration && (
            <button
              type="button"
              className="admin-settings-tile"
              onClick={() => navigate("system-administration")}
            >
              <Settings size={22} />
              <span>
                <strong>Restaurant preferences</strong>
                <small>
                  Tax, receipts, printers, kitchen routing, and numbering.
                </small>
              </span>
            </button>
          )}
        </div>
      </details>
      <footer className="admin-dashboard-footnote">
        <span>
          Sales are recognised at settlement; refunds follow their refund date.
        </span>
        <span>
          Updated {state.lastUpdated ? formatTime(state.lastUpdated) : "—"} ·
          Malaysia time
        </span>
      </footer>
    </section>
  );
}
