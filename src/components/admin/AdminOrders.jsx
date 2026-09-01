import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { useAdminOperations } from "../../hooks/useAdminOperations";
import { getOrder, voidOrderWithManagerApproval } from "../../services/order.service";
import { listSelectableStaff } from "../../features/auth/authService";
export default function AdminOrders({ canManage = false }) {
  const s = useAdminOperations("orders");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [managers, setManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [managerSearch, setManagerSearch] = useState("");
  const [recentManagerIds, setRecentManagerIds] = useState([]);
  const [pin, setPin] = useState("");
  const pinRef = useRef(null);
  const selectedManager = useMemo(
    () => managers.find((manager) => manager.id === managerId) || null,
    [managerId, managers],
  );
  const recentManagers = useMemo(
    () =>
      recentManagerIds
        .map((id) => managers.find((manager) => manager.id === id))
        .filter(Boolean),
    [managers, recentManagerIds],
  );
  const filteredManagers = useMemo(() => {
    const q = managerSearch.trim().toLowerCase();
    if (!q) return managers;
    return managers.filter((manager) =>
      `${manager.name} ${manager.role}`.toLowerCase().includes(q),
    );
  }, [managerSearch, managers]);
  useEffect(() => {
    if (!approvalOpen) return;
    void listSelectableStaff().then((result) => {
      setManagers((result.data || []).filter((staff) => ["MANAGER", "ADMIN"].includes(staff.role)));
      if (result.error) setDetailError(result.error.message);
    });
  }, [approvalOpen]);
  useEffect(() => {
    if (!approvalOpen) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem("recentVoidManagers") || "[]");
      if (Array.isArray(saved)) setRecentManagerIds(saved.slice(0, 3));
    } catch {
      setRecentManagerIds([]);
    }
  }, [approvalOpen]);
  const open = async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailError("");
    const r = await getOrder(row.id);
    setDetail(r.data);
    setDetailError(r.error?.message || "");
  };
  const requestCancellation = () => {
    if (reason.trim().length < 3) {
      setDetailError("Cancellation reason must contain at least 3 characters.");
      return;
    }
    setDetailError("");
    setManagerId("");
    setManagerSearch("");
    setPin("");
    setApprovalOpen(true);
  };
  const selectManager = (manager) => {
    setManagerId(manager.id);
    setManagerSearch("");
    setDetailError("");
    window.setTimeout(() => pinRef.current?.focus(), 0);
  };
  const cancel = async () => {
    if (!managerId || pin.length !== 6) {
      setDetailError("Select a manager and enter their six-digit PIN.");
      return;
    }
    setBusy(true);
    setDetailError("");
    const r = await voidOrderWithManagerApproval(selected.id, managerId, pin, reason);
    setBusy(false);
    if (r.error) {
      setDetailError(r.error.message);
      return;
    }
    const nextRecentManagerIds = [managerId, ...recentManagerIds.filter((id) => id !== managerId)].slice(0, 3);
    setRecentManagerIds(nextRecentManagerIds);
    window.localStorage.setItem("recentVoidManagers", JSON.stringify(nextRecentManagerIds));
    setApprovalOpen(false);
    setSelected(null);
    setReason("");
    await s.refresh();
  };
  const closeOrder = () => {
    if (busy) return;
    setApprovalOpen(false);
    setSelected(null);
    setReason("");
    setDetailError("");
  };
  return (
    <section className="space-y-5">
      <div className="flex justify-between">
        <div>
          <h1 className="text-2xl font-black">Orders</h1>
          <p className="text-sm text-gray-500">
            All restaurant orders and financial states.
          </p>
        </div>
        <button onClick={s.refresh} className="rounded-xl border bg-white p-3">
          <RefreshCw size={17} />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <input
            value={s.search}
            onChange={(e) => s.setSearch(e.target.value)}
            placeholder="Order, table, or staff"
            className="w-full rounded-xl border bg-white py-2.5 pl-10"
          />
        </div>
        <select
          value={s.filters.status || ""}
          onChange={(e) => s.setFilter("status", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All statuses</option>
          {[
            "DRAFT",
            "PLACED",
            "CONFIRMED",
            "PREPARING",
            "READY",
            "SERVED",
            "COMPLETED",
            "CANCELLED",
            "REFUNDED",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          value={s.filters.paymentStatus || ""}
          onChange={(e) => s.setFilter("paymentStatus", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All payments</option>
          {["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          value={s.filters.diningMode || ""}
          onChange={(e) => s.setFilter("diningMode", e.target.value)}
          className="rounded-xl border bg-white px-3"
        >
          <option value="">All modes</option>
          <option value="dine-in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
        </select>
        <input
          type="date"
          value={s.filters.dateFrom || ""}
          onChange={(e) => s.setFilter("dateFrom", e.target.value)}
          className="rounded-xl border px-3"
        />
        <input
          type="date"
          value={s.filters.dateTo || ""}
          onChange={(e) => s.setFilter("dateTo", e.target.value)}
          className="rounded-xl border px-3"
        />
      </div>
      {s.error && (
        <p className="rounded-xl bg-red-50 p-3 text-red-700">{s.error}</p>
      )}
      {s.isLoading ? (
        <p>Loading orders…</p>
      ) : s.rows.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-gray-400">
          No orders found.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Mode / Table</th>
                <th className="p-3">Staff</th>
                <th className="p-3">Order Status</th>
                <th className="p-3">Payment</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => void open(o)}
                  className="cursor-pointer border-t hover:bg-amber-50"
                >
                  <td className="p-3 font-bold">{o.order_number}</td>
                  <td className="p-3">
                    {o.dining_mode}
                    <small className="block text-gray-400">
                      {o.table_number || "-"}
                    </small>
                  </td>
                  <td className="p-3">{o.staff_name || o.user_id}</td>
                  <td className="p-3">{o.status}</td>
                  <td className="p-3">{o.payment_status}</td>
                  <td className="p-3 text-right font-black">
                    RM {Number(o.total).toFixed(2)}
                  </td>
                  <td className="p-3 text-xs">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager state={s} />
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex justify-between">
              <h2 className="text-xl font-black">{selected.order_number}</h2>
              <button onClick={closeOrder} aria-label="Close order details">
                <X />
              </button>
            </div>
            {detailError && (
              <p className="my-3 rounded-xl bg-red-50 p-3 text-red-700">
                {detailError}
              </p>
            )}
            {!detail && !detailError ? (
              <p className="py-8">Loading details…</p>
            ) : (
              detail && (
                <>
                  <div className="my-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      Status
                      <br />
                      <strong>{detail.status}</strong>
                    </div>
                    <div>
                      Payment
                      <br />
                      <strong>{detail.paymentStatus}</strong>
                    </div>
                    <div>
                      Total
                      <br />
                      <strong>RM {detail.total.toFixed(2)}</strong>
                    </div>
                  </div>
                  <h3 className="font-black">Items</h3>
                  {detail.items.map((i) => (
                    <div
                      key={i.id}
                      className="flex justify-between border-b py-2 text-sm"
                    >
                      <span>
                        {i.quantity}× {i.name}
                      </span>
                      <strong>RM {i.subtotal.toFixed(2)}</strong>
                    </div>
                  ))}
                  <h3 className="mt-5 font-black">Timeline</h3>
                  {detail.statusHistory.map((h) => (
                    <div
                      key={h.id}
                      className="border-l-2 border-[#D4AF37] py-2 pl-3 text-sm"
                    >
                      <strong>{h.newStatus}</strong>
                      <small className="ml-3 text-gray-400">
                        {new Date(h.changedAt).toLocaleString()}
                      </small>
                      <p className="text-xs text-gray-500">{h.notes}</p>
                    </div>
                  ))}
                  {canManage &&
                    !["COMPLETED", "CANCELLED", "REFUNDED"].includes(
                      detail.status,
                    ) && (
                      <div className="mt-5 rounded-xl border border-red-200 p-4">
                        <label className="text-sm font-bold">
                          Cancellation reason
                          <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="mt-1 w-full rounded-xl border p-3"
                          />
                        </label>
                        <button
                          disabled={busy}
                          onClick={requestCancellation}
                          className="mt-2 rounded-xl bg-red-600 px-4 py-2 font-bold text-white"
                        >
                          Void Order
                        </button>
                      </div>
                    )}
                </>
              )
            )}
          </div>
        </div>
      )}
      {approvalOpen && selected && detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="void-approval-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className="rounded-full bg-amber-100 p-2 text-amber-700"><ShieldCheck size={22} /></span>
                <div><h2 id="void-approval-title" className="text-xl font-black">Manager Approval Required</h2><p className="mt-1 text-sm text-gray-500">A manager must authorize this action.</p></div>
              </div>
              <button disabled={busy} onClick={() => setApprovalOpen(false)} aria-label="Close approval"><X /></button>
            </div>
            <dl className="my-6 grid grid-cols-2 gap-4 rounded-xl bg-gray-50 p-4">
              <div><dt className="text-xs font-bold uppercase text-gray-400">Action</dt><dd className="mt-1 font-black">Void Order {selected.order_number}</dd></div>
              <div><dt className="text-xs font-bold uppercase text-gray-400">Amount</dt><dd className="mt-1 font-black">RM {detail.total.toFixed(2)}</dd></div>
            </dl>
            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <label className="flex-1 text-sm font-bold" htmlFor="manager-search">
                  Manager
                  <span className="relative mt-1 block">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      id="manager-search"
                      value={managerSearch}
                      onChange={(event) => {
                        setManagerSearch(event.target.value);
                        setDetailError("");
                      }}
                      placeholder={selectedManager ? selectedManager.name : "Search manager"}
                      className="w-full rounded-xl border bg-white py-3 pl-10 pr-3 font-normal outline-none ring-[#D4AF37]/30 transition focus:border-[#D4AF37] focus:ring-4"
                    />
                  </span>
                </label>
                {selectedManager && (
                  <button
                    type="button"
                    onClick={() => selectManager(selectedManager)}
                    className="hidden rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-left text-xs font-black text-emerald-700 sm:block"
                  >
                    Selected<br />{selectedManager.name}
                  </button>
                )}
              </div>
              {recentManagers.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Recently used</p>
                  <div className="flex flex-wrap gap-2">
                    {recentManagers.map((manager) => (
                      <button
                        key={manager.id}
                        type="button"
                        onClick={() => selectManager(manager)}
                        className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${manager.id === managerId ? "border-[#D4AF37] bg-[#D4AF37] text-black" : "border-gray-200 bg-white text-gray-700 hover:border-[#D4AF37]/70"}`}
                      >
                        {manager.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                {filteredManagers.length ? (
                  filteredManagers.map((manager) => (
                    <button
                      key={manager.id}
                      type="button"
                      onClick={() => selectManager(manager)}
                      className={`flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 transition hover:bg-amber-50 ${manager.id === managerId ? "bg-amber-50" : ""}`}
                    >
                      <span>
                        <strong className="block text-sm text-gray-950">{manager.name}</strong>
                        <small className="mt-0.5 block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{manager.role}</small>
                      </span>
                      {manager.id === managerId && <Check className="h-5 w-5 text-[#D4AF37]" />}
                    </button>
                  ))
                ) : (
                  <p className="px-4 py-6 text-center text-sm font-bold text-gray-400">No manager found.</p>
                )}
              </div>
            </div>
            <label className="mt-5 block text-sm font-bold">Manager PIN
              <input ref={pinRef} autoFocus inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => { setPin(event.target.value.replace(/\D/g, "").slice(0, 6)); setDetailError(""); }} className="sr-only" aria-label="Six-digit manager PIN" />
              <button type="button" onClick={() => pinRef.current?.focus()} className="mt-3 flex w-full justify-center gap-4 rounded-xl border bg-gray-50 p-4 ring-[#D4AF37]/30 transition focus-visible:outline-none focus-visible:ring-4" aria-label={`${pin.length} of 4 PIN digits entered`}>
                {[0, 1, 2, 3, 4, 5].map((index) => <i key={index} className={`h-3 w-3 rounded-full border ${index < pin.length ? "border-[#D4AF37] bg-[#D4AF37]" : "border-gray-400"}`} />)}
              </button>
            </label>
            {detailError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{detailError}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button disabled={busy} onClick={() => { setApprovalOpen(false); setPin(""); setDetailError(""); }} className="rounded-xl border px-4 py-3 font-bold disabled:opacity-50">Cancel</button>
              <button disabled={busy || !managerId || pin.length !== 6} onClick={() => void cancel()} className="rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-40">{busy ? "Approving…" : "Approve"}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
function Pager({ state }) {
  const page = Number(state.filters.page || 1);
  return (
    <div className="flex items-center justify-between border-t p-3 text-xs">
      <span>{state.total} records</span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => state.setFilter("page", page - 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="p-1">Page {page}</span>
        <button
          disabled={page * 25 >= state.total}
          onClick={() => state.setFilter("page", page + 1)}
          className="rounded border px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
