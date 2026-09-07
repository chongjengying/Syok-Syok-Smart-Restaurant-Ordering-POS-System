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
        <button onClick={s.refresh} className="rounded-xl border bg-white p-3">
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
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
      </div>
      {s.error && (
        <p className="rounded-xl bg-red-50 p-3 text-red-700">{s.error}</p>
      )}
      {s.isLoading ? (
        <p>Loading audit logs…</p>
      ) : (
        <div className="space-y-2">
          {s.rows.map((a) => (
            <article key={a.id} className="rounded-xl bg-white p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{a.action}</strong>
                <time className="text-xs text-gray-400">
                  {new Date(a.created_at).toLocaleString()}
                </time>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {a.entity_type} · {a.entity_id || "-"} · Actor{" "}
                {a.actor_id || "SYSTEM"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Status: {a.event_status || "SUCCEEDED"}{a.actor_name ? ` · Recorded staff: ${a.actor_name}` : ""}
              </p>
              {a.reason && (
                <p className="mt-2 rounded-lg bg-gray-50 p-2">{a.reason}</p>
              )}
              {(a.old_value || a.new_value || a.approved_by_name || a.error_message) && (
                <div className="mt-2 grid gap-1 text-xs text-gray-500">
                  {a.approved_by_name && <span>Approved by {a.approved_by_name}</span>}
                  {a.error_message && <span className="text-red-600">{a.error_code || "ERROR"}: {a.error_message}</span>}
                  {a.old_value && <span>Before: {JSON.stringify(a.old_value)}</span>}
                  {a.new_value && <span>After: {JSON.stringify(a.new_value)}</span>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
