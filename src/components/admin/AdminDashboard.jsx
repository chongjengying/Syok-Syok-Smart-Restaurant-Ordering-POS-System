import React from 'react';
import {
  AlertTriangle,
  Banknote,
  Clock,
  CreditCard,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Table2,
  TrendingUp,
  Utensils,
  WalletCards,
  Activity,
  CheckCircle2,
  CircleX,
} from 'lucide-react';
import { useAdminDashboard } from '../../hooks/useAdminDashboard';

const money = value => `RM ${Number(value || 0).toFixed(2)}`;
const number = value => Number(value || 0).toLocaleString();

function StatCard({ label, value, helper, Icon, tone = 'gold' }) {
  const tones = {
    gold: 'bg-amber-50 text-[#8A6B0A]',
    blue: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  return (
    <article className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase text-gray-400">{label}</p>
          <p className="mt-2 text-2xl font-black text-gray-950">{value}</p>
        </div>
        <span className={`rounded-lg p-2 ${tones[tone] || tones.gold}`}>
          <Icon size={18} />
        </span>
      </div>
      {helper && <p className="mt-3 text-xs text-gray-500">{helper}</p>}
    </article>
  );
}

function Panel({ title, children, className = '' }) {
  return (
    <article className={`rounded-lg bg-white p-5 shadow-sm ${className}`}>
      <h2 className="text-sm font-black uppercase text-gray-700">{title}</h2>
      {children}
    </article>
  );
}

function DashboardSkeleton() {
  return (
    <section className="animate-pulse space-y-5" aria-label="Loading dashboard">
      <div className="h-14 w-72 rounded-lg bg-gray-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(item => <div key={item} className="h-32 rounded-lg bg-white shadow-sm" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        {[0, 1, 2].map(item => <div key={item} className="h-64 rounded-lg bg-white shadow-sm" />)}
      </div>
    </section>
  );
}

const activityLabel = value => String(value || 'Activity').replaceAll('_', ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase());

export default function AdminDashboard() {
  const state = useAdminDashboard();
  if (state.isLoading) return <DashboardSkeleton />;
  if (state.error && !state.data) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700">
        {state.error}
        <button onClick={state.refresh} className="ml-3 font-bold underline">Retry</button>
      </div>
    );
  }

  const d = state.data || {};
  const paymentMethods = d.paymentMethods || {};
  const tableStatus = d.tableStatus || {};
  const orderStatus = d.orderStatus || {};
  const alerts = d.alerts || [];
  const openOrders = d.openOrders ?? d.activeOrders ?? 0;
  const operationalCounts = [
    ['Current Occupied Tables', d.currentOccupiedTables ?? tableStatus.OCCUPIED, Table2, 'blue'],
    ['Available Tables', d.availableTables ?? tableStatus.AVAILABLE, Sparkles, 'green'],
    ['Tables Waiting for Payment', d.tablesWaitingForPayment, WalletCards, 'gold'],
    ['Tables Cleaning', d.tablesCleaning ?? tableStatus.CLEANING, RefreshCw, 'slate'],
    ['Kitchen Orders Preparing', d.kitchenOrdersPreparing, Utensils, 'red'],
    ['Orders Waiting Too Long', d.ordersWaitingTooLong, Clock, 'red'],
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">
            Live sales, orders, table flow, and kitchen alerts.
            {state.lastUpdated && <span className="ml-2">Updated {state.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <button disabled={state.isRefreshing} onClick={state.refresh} className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-bold disabled:opacity-60">
          <RefreshCw size={16} className={state.isRefreshing ? 'animate-spin' : ''} />
          {state.isRefreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </div>

      {state.error && (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <span>{state.error} Showing the last available snapshot.</span>
          <button onClick={state.refresh} className="shrink-0 font-bold underline">Retry</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today Sales" value={money(d.todaySales)} helper="Paid sales collected today" Icon={TrendingUp} />
        <StatCard label="Total Orders" value={number(d.todayOrders)} helper={`${number(d.dineInOrders)} dine-in, ${number(d.takeawayOrders)} takeaway`} Icon={ShoppingBag} tone="blue" />
        <StatCard label="Average Order Value" value={money(d.averageOrderValue)} helper="Paid orders today" Icon={WalletCards} tone="green" />
        <StatCard label="Open Orders" value={number(openOrders)} helper="Not completed or cancelled" Icon={Utensils} tone="red" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {operationalCounts.map(([label, value, Icon, tone]) => (
          <StatCard key={label} label={label} value={number(value)} Icon={Icon} tone={tone} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Cash / QR / Card Sales">
          <div className="mt-4 space-y-3">
            {[
              ['Cash', paymentMethods.CASH, Banknote],
              ['QR', paymentMethods.QR, QrCode],
              ['Card', paymentMethods.CARD, CreditCard],
              ['E-Wallet', paymentMethods.EWALLET, WalletCards],
            ].map(([label, value, Icon]) => (
              <div key={label} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                <span className="flex items-center gap-2 text-gray-600"><Icon size={15} />{label}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Top 5 Products">
          {(d.topProducts || []).length ? (
            <div className="mt-4 space-y-2">
              {d.topProducts.map((product, index) => (
                <div key={`${product.name}-${index}`} className="flex items-center justify-between rounded-lg bg-gray-50 p-3 text-sm">
                  <span className="truncate pr-3">{index + 1}. {product.name}</span>
                  <strong>{number(product.quantity)} / {money(product.sales)}</strong>
                </div>
              ))}
            </div>
          ) : <p className="mt-6 text-sm text-gray-400">No product sales today.</p>}
        </Panel>

        <Panel title="Table Status">
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'DISABLED'].map(status => (
              <div key={status} className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-500">{status.replaceAll('_', ' ')}</p>
                <strong className="text-lg">{number(tableStatus[status])}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Sales Trend">
          <div className="mt-4 flex h-44 items-end gap-2">
            {(d.salesTrend || []).map((entry, index) => {
              const max = Math.max(1, ...(d.salesTrend || []).map(item => Number(item.sales || 0)));
              return (
                <div key={`${entry.day}-${index}`} className="flex flex-1 flex-col items-center">
                  <div className="w-full rounded-t bg-[#D4AF37]" style={{ height: `${Math.max(6, (Number(entry.sales || 0) / max) * 128)}px` }} />
                  <span className="mt-2 text-[10px] text-gray-500">{String(entry.day).slice(5)}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Recent Orders">
          {(d.recentOrders || []).length ? (
            <div className="mt-4 space-y-2">
              {d.recentOrders.map(order => (
                <div key={order.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                  <div>
                    <strong>{order.order_number}</strong>
                    <p className="text-xs text-gray-500">{order.dining_mode} {order.table_number ? `/ Table ${order.table_number}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <strong>{money(order.total)}</strong>
                    <p className="text-xs text-gray-500">{order.status} / {order.payment_status}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-6 text-sm text-gray-400">No recent orders.</p>}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Today's Order Flow">
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['CONFIRMED', ShoppingBag, 'text-sky-700 bg-sky-50'],
              ['PREPARING', Utensils, 'text-amber-700 bg-amber-50'],
              ['READY', Sparkles, 'text-violet-700 bg-violet-50'],
              ['SERVED', WalletCards, 'text-indigo-700 bg-indigo-50'],
              ['COMPLETED', CheckCircle2, 'text-emerald-700 bg-emerald-50'],
              ['CANCELLED', CircleX, 'text-red-700 bg-red-50'],
            ].map(([status, Icon, tone]) => (
              <div key={status} className={`rounded-lg p-3 ${tone}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black tracking-wide">{status}</span>
                  <Icon size={15} />
                </div>
                <strong className="mt-2 block text-xl text-gray-950">{number(orderStatus[status])}</strong>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent Admin Activity">
          {(d.recentActivities || []).length ? (
            <div className="mt-4 space-y-2">
              {d.recentActivities.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                  <span className="rounded-full bg-slate-200 p-2 text-slate-600"><Activity size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{activityLabel(entry.action)}</p>
                    <p className="truncate text-xs text-gray-500">{activityLabel(entry.entity_type)} {entry.entity_id ? `· ${entry.entity_id}` : ''}</p>
                  </div>
                  <time className="shrink-0 text-[10px] text-gray-400" dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              ))}
            </div>
          ) : <p className="mt-6 text-sm text-gray-400">No recent admin activity.</p>}
        </Panel>
      </div>

      <Panel title="Alerts">
        {alerts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {alerts.map(alert => (
              <div key={alert.code} className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                <div>
                  <strong>{alert.title}</strong>
                  <p className="text-xs">{alert.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-4 text-sm text-gray-400">No action required right now.</p>}
      </Panel>

      {!d.hasInventory && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Low-stock metrics are hidden because no inventory module exists.
        </p>
      )}
    </section>
  );
}
