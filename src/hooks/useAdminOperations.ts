import { useCallback, useEffect, useState } from "react";
import {
  getAdminOrders,
  getAdminPayments,
  getAuditLogs,
} from "../services/admin-operations.service";
const filterKeys = [
  "search",
  "status",
  "paymentStatus",
  "method",
  "provider",
  "diningMode",
  "dateFrom",
  "dateTo",
] as const;
const routeFilters = () => {
  const query = (globalThis.location?.hash || "").split("?")[1] || "";
  const params = new URLSearchParams(query);
  return Object.fromEntries([
    ...filterKeys.map((key) => [key, params.get(key) || ""]),
    ["page", Math.max(1, Number(params.get("page") || 1))],
  ]);
};
const persistFilters = (filters: Record<string, unknown>, replace = false) => {
  const [path] = String(globalThis.location?.hash || "#admin/dashboard").split(
    "?",
  );
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (
      value !== "" &&
      value != null &&
      !(key === "page" && Number(value) === 1)
    )
      params.set(key, String(value));
  });
  const target = `${path}${params.size ? `?${params}` : ""}`;
  if (target === globalThis.location.hash) return;
  globalThis.history?.[replace ? "replaceState" : "pushState"](
    null,
    "",
    target,
  );
};
export function useAdminOperations(kind: string) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown>>(routeFilters);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setIsLoading(true);
    const r =
      kind === "orders"
        ? await getAdminOrders(filters)
        : kind === "payments"
          ? await getAdminPayments(filters)
          : await getAuditLogs(String(filters.search || ""));
    const payload = r.data as any;
    setRows(kind === "audit" ? payload || [] : payload?.rows || []);
    setTotal(
      kind === "audit" ? payload?.length || 0 : Number(payload?.total || 0),
    );
    setError(r.error?.message || "");
    setIsLoading(false);
  }, [kind, filters]);
  useEffect(() => {
    const id = setTimeout(() => void refresh(), 200);
    return () => clearTimeout(id);
  }, [refresh]);
  useEffect(() => {
    const sync = () => setFilters(routeFilters());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const setFilter = (key: string, value: unknown) =>
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
        ...(key === "page" ? {} : { page: 1 }),
      };
      persistFilters(next, key === "search");
      return next;
    });
  return {
    rows,
    filters,
    setFilter,
    search: String(filters.search || ""),
    setSearch: (value: string) => setFilter("search", value),
    total,
    isLoading,
    error,
    refresh,
  };
}
