import React, { useMemo, useState } from 'react';
import { ArrowLeft, Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { useDailySalesReport } from '../hooks/useDailySalesReport';

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReportsScreen({ onBack }) {
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const filters = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const { rows, isLoading, error, refetch } = useDailySalesReport(true, filters);
  const totals = useMemo(() => rows.reduce((sum, row) => ({
    sales: sum.sales + Number(row.amount_paid || 0),
    tax: sum.tax + Number(row.tax || 0),
    service: sum.service + Number(row.service_charge || 0),
  }), { sales: 0, tax: 0, service: 0 }), [rows]);

  return (
    <div className="w-full h-full bg-[#F5F6F8] text-[#121212] flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 bg-[#121212] text-white px-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="w-5 h-5" /> Dashboard
        </button>
        <div className="flex items-center gap-2 font-black tracking-wider uppercase"><TrendingUp className="w-5 h-5 text-[#D4AF37]" /> Daily Sales</div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </header>
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-end gap-4">
          <label className="text-xs font-bold text-gray-600">From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="text-xs font-bold text-gray-600">To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <div className="ml-auto text-right"><p className="text-xs text-gray-500">Paid orders</p><p className="text-2xl font-black">{rows.length}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[['Net paid', totals.sales], ['SST', totals.tax], ['Service charge', totals.service]].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white border border-gray-200 p-5"><p className="text-xs font-bold uppercase text-gray-400">{label}</p><p className="mt-2 text-2xl font-black">RM {value.toFixed(2)}</p></div>
          ))}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {isLoading ? (
          <div className="flex justify-center gap-2 py-12 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading report…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500">No paid sales for this date range.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">Paid at</th><th className="p-3">Order</th><th className="p-3">Method</th><th className="p-3">Mode</th><th className="p-3 text-right">Amount</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.payment_id} className="border-t border-gray-100"><td className="p-3">{new Date(row.paid_at).toLocaleString()}</td><td className="p-3 font-bold">{row.order_number}</td><td className="p-3">{row.payment_method}</td><td className="p-3">{row.dining_mode}</td><td className="p-3 text-right font-black">RM {Number(row.amount_paid).toFixed(2)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
