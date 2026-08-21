import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, Loader2, Printer, RefreshCw, TrendingUp, X } from 'lucide-react';
import { useDailySalesReport } from '../hooks/useDailySalesReport';
import { getOrder } from '../services/order.service';
import { translate, translateStatus } from '../utils/i18n';

function today() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function ReportsScreen({ onBack, lang = 'en' }) {
  const tr = (key) => translate(lang, key);
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isLoadingTransaction, setIsLoadingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const filters = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const { rows, isLoading, error, refetch } = useDailySalesReport(true, filters);
  const totals = useMemo(() => rows.reduce((sum, row) => ({
    sales: sum.sales + Number(row.amount_paid || 0),
    tax: sum.tax + Number(row.tax || 0),
    service: sum.service + Number(row.service_charge || 0),
  }), { sales: 0, tax: 0, service: 0 }), [rows]);

  const openTransaction = async (row) => {
    setSelectedRow(row);
    setSelectedOrder(null);
    setTransactionError('');
    setIsLoadingTransaction(true);
    const result = await getOrder(row.order_id);
    setIsLoadingTransaction(false);
    if (result.error || !result.data) {
      setTransactionError(result.error?.message || tr('transactionLoadFailed'));
      return;
    }
    setSelectedOrder(result.data);
  };

  return (
    <div className="w-full h-full bg-[#F5F6F8] text-[#121212] flex flex-col overflow-hidden">
      <header className="h-16 shrink-0 bg-[#121212] text-white px-6 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="w-5 h-5" /> {tr('dashboard')}
        </button>
        <div className="flex items-center gap-2 font-black tracking-wider uppercase"><TrendingUp className="w-5 h-5 text-[#D4AF37]" /> {tr('dailySales')}</div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]"><RefreshCw className="w-4 h-4" /> {tr('refresh')}</button>
      </header>
      <main className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="rounded-2xl bg-white border border-gray-200 p-4 flex items-end gap-4">
          <label className="text-xs font-bold text-gray-600">{tr('from')}<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="text-xs font-bold text-gray-600">{tr('to')}<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <div className="ml-auto text-right"><p className="text-xs text-gray-500">{tr('paidOrders')}</p><p className="text-2xl font-black">{rows.length}</p></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[[tr('netPaid'), totals.sales], ['SST', totals.tax], [translate(lang, 'serviceCharge'), totals.service]].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white border border-gray-200 p-5"><p className="text-xs font-bold uppercase text-gray-400">{label}</p><p className="mt-2 text-2xl font-black">RM {value.toFixed(2)}</p></div>
          ))}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {isLoading ? (
          <div className="flex justify-center gap-2 py-12 text-gray-500"><Loader2 className="w-5 h-5 animate-spin" /> {tr('loadingReport')}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 p-10 text-center text-gray-500">{tr('noSales')}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">{tr('paidAt')}</th><th className="p-3">{tr('paymentNumber')}</th><th className="p-3">{tr('order')}</th><th className="p-3">{tr('method')}</th><th className="p-3">{tr('mode')}</th><th className="p-3 text-right">{tr('amount')}</th><th className="p-3 text-right">{tr('actions')}</th></tr></thead>
              <tbody>{rows.map((row) => <tr key={row.payment_id} className="border-t border-gray-100"><td className="p-3">{new Date(row.paid_at).toLocaleString()}</td><td className="p-3 font-bold">{row.payment_number || '-'}</td><td className="p-3 font-bold">{row.order_number}</td><td className="p-3">{row.payment_method}</td><td className="p-3">{row.dining_mode}</td><td className="p-3 text-right font-black">RM {Number(row.amount_paid).toFixed(2)}</td><td className="p-3 text-right"><button onClick={() => void openTransaction(row)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold hover:border-[#D4AF37]"><Eye className="h-4 w-4" /> {tr('view')}</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </main>
      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={tr('transactionDetails')}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
              <div><p className="text-xs font-black uppercase text-[#B08D20]">{tr('transactionDetails')}</p><h2 className="mt-1 text-2xl font-black">{selectedRow.order_number}</h2></div>
              <button onClick={() => setSelectedRow(null)} className="rounded-lg p-2 hover:bg-gray-100" aria-label={tr('close')}><X className="h-5 w-5" /></button>
            </div>
            {isLoadingTransaction ? <div className="flex justify-center gap-2 py-10 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> {tr('loadingOrderDetails')}</div> : transactionError ? <div className="my-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{transactionError}</div> : selectedOrder && (
              <div id="printable-report-receipt" className="space-y-4 pt-5">
                <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-gray-500">{tr('paymentNumber')}</p><strong>{selectedRow.payment_number || '-'}</strong></div><div><p className="text-xs text-gray-500">{tr('paidAt')}</p><strong>{new Date(selectedRow.paid_at).toLocaleString()}</strong></div><div><p className="text-xs text-gray-500">{tr('paymentMethod')}</p><strong>{selectedRow.payment_method}</strong></div><div><p className="text-xs text-gray-500">{tr('status')}</p><strong>{translateStatus(lang, selectedRow.order_status)}</strong></div></div>
                <div className="border-y border-dashed border-gray-300 py-4"><p className="mb-3 text-xs font-black uppercase text-gray-500">{tr('items')}</p>{selectedOrder.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-1 text-sm"><span>{item.name} ×{item.quantity}</span><strong>RM {Number(item.subtotal).toFixed(2)}</strong></div>)}</div>
                <div className="space-y-2 text-sm"><div className="flex justify-between"><span>{tr('subtotal')}</span><span>RM {selectedOrder.subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>{tr('tax')}</span><span>RM {selectedOrder.tax.toFixed(2)}</span></div><div className="flex justify-between"><span>{tr('serviceCharge')}</span><span>RM {selectedOrder.serviceCharge.toFixed(2)}</span></div><div className="flex justify-between border-t-2 border-[#121212] pt-2 text-lg font-black"><span>{tr('totalPaid')}</span><span>RM {Number(selectedRow.amount_paid).toFixed(2)}</span></div></div>
                <button onClick={() => window.print()} className="no-print flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] px-4 py-3 font-black text-[#D4AF37]"><Printer className="h-4 w-4" /> {tr('printReceipt')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
