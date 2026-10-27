import React, { useEffect, useRef, useState } from "react";
import { FileText, RefreshCw, Search, X } from "lucide-react";
import { useAdminOperations } from "../../hooks/useAdminOperations";
import { usePaymentProviders } from "../../hooks/usePaymentProviders";
import { refundOrder } from "../../services/payment.service";
import { fetchOrder } from "../../repositories/order.repository";
import { fetchAdminRefunds } from "../../repositories/admin.repository";
import AccessibleDialog from "./AccessibleDialog";
import RefundStockReturn from "./RefundStockReturn";

function RefundHistory({ canManageStock = false }) {
  const [filters, setFilters] = useState({ search: "", refundStatus: "", refundType: "", dateFrom: "", dateTo: "", page: 1 });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const update = (key, value) => setFilters((current) => ({ ...current, [key]: value, ...(key === "page" ? {} : { page: 1 }) }));
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await fetchAdminRefunds(filters);
      if (cancelled) return;
      setRows(Array.isArray(result.data) ? result.data : []);
      setTotal(Number(result.data?.[0]?.total_count || 0));
      setError(result.error?.message || "");
      setLoading(false);
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters]);
  const page = Number(filters.page || 1);
  return <section className="space-y-4">
    {canManageStock && <RefundStockReturn refunds={rows} onReturned={() => update('page', page)} />}
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Refund History</h2><p className="text-sm text-gray-500">Original sales stay unchanged. Each refund is recorded as a separate financial document.</p></div></div>
    <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-3">
      <div className="relative min-w-64 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" /><input aria-label="Search refund history" value={filters.search} onChange={(e) => update("search", e.target.value)} placeholder="Refund, receipt, order, payment, reason" className="w-full rounded-xl border py-2.5 pl-10 pr-3" /></div>
      <select aria-label="Refund status" value={filters.refundStatus} onChange={(e) => update("refundStatus", e.target.value)} className="rounded-xl border bg-white px-3"><option value="">All statuses</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="CANCELLED">Cancelled</option></select>
      <select aria-label="Refund type" value={filters.refundType} onChange={(e) => update("refundType", e.target.value)} className="rounded-xl border bg-white px-3"><option value="">All types</option><option value="FULL">Full</option><option value="PARTIAL">Partial</option><option value="ITEM">Item</option></select>
      <input aria-label="From date" type="date" value={filters.dateFrom} onChange={(e) => update("dateFrom", e.target.value)} className="rounded-xl border px-3" /><input aria-label="To date" type="date" value={filters.dateTo} onChange={(e) => update("dateTo", e.target.value)} className="rounded-xl border px-3" />
    </div>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p>Loading refund history…</p> : rows.length === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-gray-400">No refunds found.</p> : <div className="overflow-x-auto rounded-2xl bg-white"><table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Refund</th><th className="p-3">Original sale</th><th className="p-3">Type</th><th className="p-3">Payment</th><th className="p-3">Requested by</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3">Time</th></tr></thead><tbody>{rows.map((refund) => <tr key={refund.id} className="border-t align-top"><td className="p-3"><strong>{refund.refund_number}</strong><span className="block text-xs text-gray-400">{refund.original_receipt_number || "No receipt"}</span></td><td className="p-3"><strong>{refund.order_number}</strong><span className="block text-xs text-gray-400">{refund.payment_number}</span></td><td className="p-3"><span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{refund.refund_type}</span>{Array.isArray(refund.items) && refund.items.length > 0 && <span className="mt-2 block text-xs text-gray-500">{refund.items.map((item) => `${item.quantity}× ${item.product}`).join(", ")}</span>}</td><td className="p-3">{refund.payment_method}</td><td className="p-3">{refund.requester_name || "-"}</td><td className="p-3">{refund.status}</td><td className="p-3 text-right font-black">RM {Number(refund.amount).toFixed(2)}<span className="block text-xs font-normal text-gray-400">Tax RM {Number(refund.tax_amount || 0).toFixed(2)}</span></td><td className="p-3 text-xs">{new Date(refund.refunded_at).toLocaleString()}<span className="block text-gray-400">{refund.reason}</span></td></tr>)}</tbody></table><div className="flex items-center justify-between border-t p-3 text-xs"><span>{total} refunds</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => update("page", page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>Page {page}</span><button disabled={page * 25 >= total} onClick={() => update("page", page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div></div></div>}
  </section>;
}

export default function AdminPayments({ canRefund = false, canManageStock = false }) {
  const s = useAdminOperations("payments");
  const { providers } = usePaymentProviders(true);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [screen, setScreen] = useState("payments");
  const [refundOrderDetail, setRefundOrderDetail] = useState(null);
  const [itemSelections, setItemSelections] = useState({});
  const [loadingRefundOrder, setLoadingRefundOrder] = useState(false);
  const refundPending = useRef(false);
  const refundAttempt = useRef({ fingerprint: "", key: "" });
  const openRefund = async (payment) => {
    refundAttempt.current = { fingerprint: "", key: "" };
    setSelected(payment);
    setReason("");
    setRefundAmount(String(Number(payment.amount).toFixed(2)));
    setConfirmation("");
    setActionError("");
    setItemSelections({});
    setRefundOrderDetail(null);
    setLoadingRefundOrder(true);
    const result = await fetchOrder(payment.order_id);
    setRefundOrderDetail(result.data || null);
    if (result.error) setActionError(`Unable to load original sale items: ${result.error.message}`);
    setLoadingRefundOrder(false);
  };
  if (screen === "refunds") return <section className="space-y-5"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-black">Payments & Refunds</h1><p className="text-sm text-gray-500">Review completed refunds and their original transactions.</p></div><button onClick={() => setScreen("payments")} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">Back to Payments</button></div><RefundHistory canManageStock={canManageStock && canRefund} /></section>;
  const refund = async () => {
    if (refundPending.current || !selected) return;
    if (reason.trim().length < 3) {
      setActionError("Refund reason must contain at least 3 characters.");
      return;
    }
    if (confirmation.trim() !== selected.payment_number) {
      setActionError("Type the payment number exactly to confirm this refund.");
      return;
    }
    const selectedItems = Object.entries(itemSelections)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) }));
    const amount = selectedItems.length > 0 ? null : Number(refundAmount);
    const fingerprint = JSON.stringify({ orderId: selected.order_id, reason: reason.trim(), amount, items: selectedItems });
    if (refundAttempt.current.fingerprint !== fingerprint) {
      refundAttempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    refundPending.current = true;
    setBusy(true);
    setActionError("");
    try {
      const r = await refundOrder(selected.order_id, reason.trim(), refundAttempt.current.key, amount, selectedItems);
      if (r.error) {
        setActionError(r.error.message);
        return;
      }
      refundAttempt.current = { fingerprint: "", key: "" };
      setSelected(null);
      await s.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to refund this payment.");
    } finally {
      refundPending.current = false;
      setBusy(false);
    }
  };
  const page = Number(s.filters.page || 1);
  return (
    <section className="space-y-5">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-black">Payments</h1>
          <p className="text-sm text-gray-500">
            Payment records are read-only; refunds use the secured refund flow.
          </p>
        </div>
        <div className="flex gap-2"><button onClick={() => setScreen("refunds")} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"><FileText className="mr-2 inline" size={16} />Refund History</button><button onClick={s.refresh} aria-label="Refresh payments" className="rounded-xl border bg-white p-3"><RefreshCw size={17} /></button></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            aria-label="Search payments"
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder="Payment, order, or cashier"
            className="w-full rounded-xl border bg-white py-2.5 pl-10"
          />
        </div>
        <select
          aria-label="Payment method"
          value={s.filters.method || ""}
          onChange={(e) => s.setFilter("method", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All methods</option>
          {["CASH", "QR", "CARD", "EWALLET"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Status"
          value={s.filters.status || ""}
          onChange={(e) => s.setFilter("status", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All statuses</option>
          {[
            "PENDING",
            "PROCESSING",
            "PAID",
            "FAILED",
            "CANCELLED",
            "REFUNDED",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Payment provider"
          value={s.filters.provider || ""}
          onChange={(e) => s.setFilter("provider", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All providers</option>
          {providers.map((provider) => (
            <option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="From date"
          value={s.filters.dateFrom || ""}
          onChange={(e) => s.setFilter("dateFrom", e.target.value)}
          className="rounded-xl border px-3"
        />
        <input
          type="date"
          aria-label="To date"
          value={s.filters.dateTo || ""}
          onChange={(e) => s.setFilter("dateTo", e.target.value)}
          className="rounded-xl border px-3"
        />
      </div>
      {s.error && (
        <p className="rounded-xl bg-red-50 p-3 text-red-700">{s.error}</p>
      )}
      {s.isLoading ? (
        <p>Loading payments…</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Payment</th>
                <th className="p-3">Order</th>
                <th className="p-3">Method</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Cashier</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.rows.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-bold">{p.payment_number}</td>
                  <td className="p-3">{p.order_number || p.order_id}</td>
                  <td className="p-3">{p.payment_method}</td>
                  <td className="p-3">{p.provider_name || p.provider_id || p.provider || "-"}</td>
                  <td className="p-3">{p.staff_name || p.user_id}</td>
                  <td className="p-3">{p.status}</td>
                  <td className="p-3 text-right font-black">
                    RM {Number(p.amount).toFixed(2)}
                  </td>
                  <td className="p-3 text-xs">
                    {new Date(p.paid_at || p.created_at).toLocaleString()}
                  </td>
                  <td>
                    {canRefund && p.status === "PAID" && (
                      <button
                        onClick={() => void openRefund(p)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600"
                      >
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t p-3 text-xs">
            <span>{s.total} records</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => s.setFilter("page", page - 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="p-1">Page {page}</span>
              <button
                disabled={page * 25 >= s.total}
                onClick={() => s.setFilter("page", page + 1)}
                className="rounded border px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
      {selected && (
        <AccessibleDialog
          title={`Refund ${selected.payment_number}`}
          onClose={() => setSelected(null)}
          className="max-w-md"
        >
            <div className="flex justify-between">
              <h2 aria-hidden="true" className="text-xl font-black">
                Refund {selected.payment_number}
              </h2>
              <button onClick={() => setSelected(null)} aria-label="Close">
                <X />
              </button>
            </div>
            <p className="mt-2 text-sm">
              Enter the amount to refund. The backend checks the remaining
              refundable balance and keeps the original payment history.
            </p>
            <div className="mt-4 rounded-xl border bg-gray-50 p-3">
              <div className="flex items-center justify-between"><strong className="text-sm">Refund selected items</strong><span className="text-xs text-gray-500">Optional</span></div>
              {loadingRefundOrder ? <p className="mt-2 text-xs text-gray-500">Loading original sale items…</p> : (refundOrderDetail?.order_items || refundOrderDetail?.items || []).length === 0 ? <p className="mt-2 text-xs text-gray-500">No item details available. Use an amount refund.</p> : <div className="mt-2 space-y-2">{(refundOrderDetail.order_items || refundOrderDetail.items || []).map((item) => { const selectedQuantity = Number(itemSelections[item.id] || 0); const maxQuantity = Number(item.quantity || 0); return <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white p-2"><input type="number" min="0" max={maxQuantity} value={selectedQuantity || ""} onChange={(event) => setItemSelections((current) => ({ ...current, [item.id]: Math.min(maxQuantity, Math.max(0, Number(event.target.value) || 0)) }))} aria-label={`Refund quantity for ${item.product_name_snapshot || item.name}`} className="w-16 rounded-lg border p-2 text-center" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.product_name_snapshot || item.name}</p><p className="text-xs text-gray-500">Up to {maxQuantity} · Original RM {Number(item.line_total || item.subtotal || 0).toFixed(2)}</p></div></div>; })}</div>}
              {Object.values(itemSelections).some((quantity) => Number(quantity) > 0) && <p className="mt-2 text-xs font-semibold text-amber-700">The backend will calculate the final item refund from the original sale snapshot.</p>}
            </div>
            <label className="mt-4 block text-sm font-bold">
              Refund amount
              <input
                inputMode="decimal"
                value={refundAmount}
                disabled={Object.values(itemSelections).some((quantity) => Number(quantity) > 0)}
                onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="mt-1 w-full rounded-xl border p-3 font-normal disabled:bg-gray-100"
              />
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required refund reason"
              className="mt-4 w-full rounded-xl border p-3"
            />
            <label className="mt-3 block text-sm font-bold">
              Type {selected.payment_number} to confirm
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1 w-full rounded-xl border p-3 font-normal"
              />
            </label>
            {actionError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {actionError}
              </p>
            )}
            <button
              disabled={busy || confirmation.trim() !== selected.payment_number}
              onClick={refund}
              className="mt-4 w-full rounded-xl bg-red-600 p-3 font-black text-white disabled:opacity-40"
            >
              {busy ? "Refunding…" : "Confirm Refund"}
            </button>
        </AccessibleDialog>
      )}
    </section>
  );
}
