import React, { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { usePaymentProviders } from "../../hooks/usePaymentProviders";
import { updatePaymentProviders } from "../../services/payment.service";

export default function PaymentProviders() {
  const { providers, isLoading, error, refresh } = usePaymentProviders(true);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setRows(providers), [providers]);

  const updateRow = (id, patch) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    const result = await updatePaymentProviders(rows);
    setSaving(false);
    if (result.error) {
      setMessage(result.error.message || "Unable to save providers.");
      return;
    }
    setMessage("Payment providers saved.");
    await refresh();
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Payment Providers</h1>
          <p className="text-sm text-gray-500">Configure selectable QR / E-wallet providers for POS payments.</p>
        </div>
        <button onClick={() => refresh()} className="rounded-xl border bg-white p-3" aria-label="Refresh providers">
          <RefreshCw size={17} />
        </button>
      </div>
      {(error || message) && <p className={`rounded-xl p-3 text-sm ${error || message.includes("Unable") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
            <tr><th className="p-3">Enabled</th><th className="p-3">Provider</th><th className="p-3">Display Name</th><th className="p-3">Order</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="p-4" colSpan={4}>Loading providers...</td></tr>
            ) : rows.map((provider) => (
              <tr key={provider.id} className="border-t">
                <td className="p-3"><input type="checkbox" checked={provider.enabled} onChange={(event) => updateRow(provider.id, { enabled: event.target.checked })} /></td>
                <td className="p-3 font-bold">{provider.providerId}</td>
                <td className="p-3"><input value={provider.displayName} onChange={(event) => updateRow(provider.id, { displayName: event.target.value })} className="w-full rounded-lg border px-3 py-2" /></td>
                <td className="p-3"><input type="number" value={provider.sortOrder} onChange={(event) => updateRow(provider.id, { sortOrder: Number(event.target.value) })} className="w-24 rounded-lg border px-3 py-2" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={saving || isLoading} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-[#121212] px-5 py-3 font-black text-[#D4AF37] disabled:opacity-40">
        <Save size={17} /> {saving ? "Saving..." : "Save Providers"}
      </button>
    </section>
  );
}
