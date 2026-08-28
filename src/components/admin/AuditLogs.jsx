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
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <input
          value={s.search}
          onChange={(e) => s.setSearch(e.target.value)}
          placeholder="Search action or entity"
          className="w-full rounded-xl border bg-white py-2.5 pl-10"
        />
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
              {a.reason && (
                <p className="mt-2 rounded-lg bg-gray-50 p-2">{a.reason}</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
