import React from "react";
import { RefreshCw, Search } from "lucide-react";
import { useAdminOperations } from "../../hooks/useAdminOperations";
export default function AuditLogs() {
  const s = useAdminOperations("audit");
  return (
    <section className="space-y-5">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-black">Audit Logs</h1>
          <p className="text-sm text-gray-500">
            Append-only security and management activity.
          </p>
        </div>
        <button aria-label="Refresh audit logs" onClick={s.refresh} className="rounded-xl border bg-white p-3">
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-6">
        <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          aria-label="Search audit events"
          value={s.search}
          onChange={(e) => s.setSearch(e.target.value)}
          placeholder="Search event, reason or record ID"
          className="w-full rounded-xl border bg-white py-2.5 pl-10"
        />
        </div>
        <input type="date" value={s.filters.dateFrom || ""} onChange={(e) => s.setFilter("dateFrom", e.target.value)} className="rounded-xl border bg-white px-3" aria-label="From date" />
        <input type="date" value={s.filters.dateTo || ""} onChange={(e) => s.setFilter("dateTo", e.target.value)} className="rounded-xl border bg-white px-3" aria-label="To date" />
        <select value={s.filters.eventStatus || ""} onChange={(e) => s.setFilter("eventStatus", e.target.value)} className="rounded-xl border bg-white px-3" aria-label="Event status">
          <option value="">All statuses</option><option value="SUCCEEDED">Succeeded</option><option value="APPROVED">Approved</option><option value="PENDING">Pending</option><option value="REJECTED">Rejected</option><option value="FAILED">Failed</option>
        </select>
        <select value={s.filters.entityType || ""} onChange={(e) => s.setFilter("entityType", e.target.value)} className="rounded-xl border bg-white px-3" aria-label="Resource type">
          <option value="">All resources</option><option value="COMPANY">Company</option><option value="BRANCH">Branch</option><option value="TERMINAL">Terminal</option><option value="STAFF">Staff</option><option value="ROLE">Role</option><option value="CASHIER_SHIFT">Shift</option><option value="ORDER">Order</option><option value="PAYMENT">Payment</option><option value="RECEIPT">Receipt</option><option value="PRODUCT">Product</option>
        </select>
        <input value={s.filters.action || ""} onChange={(e) => s.setFilter("action", e.target.value.toUpperCase())} placeholder="Action e.g. REFUND" className="rounded-xl border bg-white px-3" aria-label="Audit action" />
      </div>
      {s.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">{s.error}</p>
      )}
      {s.isLoading ? (
        <p role="status">Loading audit logs…</p>
      ) : (
        <div className="space-y-2">
          {s.rows.length === 0 && <p className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">No audit events match these filters.</p>}
          {s.rows.map((a) => (
            <article key={a.id} className="rounded-xl bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{String(a.action).replaceAll("_", " ")}</strong>
                <time className="text-xs text-gray-400">
                  {new Date(a.created_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {a.entity_type} · Actor{" "}
                {a.actor_name || "SYSTEM"}{a.actor_role ? ` · ${a.actor_role}` : ""}
              </p>

              <p className="mt-1 text-xs text-gray-500">
                Status: {a.event_status || "SUCCEEDED"}{a.actor_name ? ` · Recorded staff: ${a.actor_name}` : ""}
              </p>
              {a.reason && (
                <p className="mt-2 rounded-lg bg-gray-50 p-2">{a.reason}</p>
              )}
              {a.approved_by_name && <p className="mt-2 text-xs text-slate-600">Approved by {a.approved_by_name}</p>}
              {a.error_message && <p className="mt-2 text-sm text-red-700">{a.error_message}</p>}
              <details className="mt-3 rounded-lg border border-slate-200 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">Record details and changes</summary>
                <p className="mt-2 break-all text-xs text-slate-500">Record: {a.entity_id || '—'}</p>
              <p className="mt-1 break-all text-xs text-gray-500">{a.company_id ? `Company ${a.company_id}` : "Company context unavailable"}{a.branch_id ? ` · Branch ${a.branch_id}` : " · Company-wide event"}{a.terminal_id ? ` · Terminal ${a.terminal_id}` : ""}</p>
              {(a.old_value || a.new_value) && (
                <div className="mt-2 grid gap-1 break-all text-xs text-gray-500">
                  {a.old_value && <span>Before: {JSON.stringify(a.old_value)}</span>}
                  {a.new_value && <span>After: {JSON.stringify(a.new_value)}</span>}
                </div>
              )}
              {a.error_code && <p className="mt-2 text-xs">Error code: {a.error_code}</p>}
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
