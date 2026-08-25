import React, { useMemo, useState } from 'react';
import { ArrowLeft, Eye, Loader2, PackageSearch, Printer, RefreshCw, TrendingUp, X } from 'lucide-react';
import { useDailySalesReport } from '../hooks/useDailySalesReport';
import { useProductSalesReport } from '../hooks/useProductSalesReport';
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
  const [reportType, setReportType] = useState('daily');
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [selectedRow, setSelectedRow] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isLoadingTransaction, setIsLoadingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState('');
  const filters = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);
  const dailyReport = useDailySalesReport(reportType === 'daily', filters);
  const productReport = useProductSalesReport(reportType === 'products', filters);

  const dailySummary = useMemo(() => {
    const orderIds = new Set();
    const methods = {};
    const totals = dailyReport.rows.reduce((sum, row) => {
      orderIds.add(row.order_id);
      const method = String(row.payment_method || 'UNKNOWN');
      methods[method] = (methods[method] || 0) + Number(row.amount_paid || 0);
      return {
        sales: sum.sales + Number(row.amount_paid || 0),
        tax: sum.tax + Number(row.tax || 0),
        service: sum.service + Number(row.service_charge || 0),
      };
    }, { sales: 0, tax: 0, service: 0 });
    return { ...totals, orderCount: orderIds.size, methods };
  }, [dailyReport.rows]);

  const productSummary = useMemo(() => productReport.rows.reduce((summary, row) => ({
    quantity: summary.quantity + Number(row.quantity_sold || 0),
    sales: summary.sales + Number(row.gross_sales || 0),
  }), { quantity: 0, sales: 0 }), [productReport.rows]);

  const activeReport = reportType === 'daily' ? dailyReport : productReport;

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
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]"><ArrowLeft className="h-5 w-5" /> {tr('dashboard')}</button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider"><TrendingUp className="h-5 w-5 text-[#D4AF37]" /> {tr('salesReports')}</div>
        <button onClick={() => activeReport.refetch()} className="flex items-center gap-2 text-xs font-bold text-[#D4AF37]"><RefreshCw className="h-4 w-4" /> {tr('refresh')}</button>
      </header>

      <main className="flex-1 space-y-5 overflow-y-auto p-6">
        <div className="grid max-w-xl grid-cols-2 gap-2 rounded-2xl bg-white p-2 shadow-sm">
          <button onClick={() => setReportType('daily')} className={`rounded-xl px-4 py-3 text-sm font-black ${reportType === 'daily' ? 'bg-[#121212] text-[#D4AF37]' : 'text-gray-500'}`}>{tr('dailySalesSummary')}</button>
          <button onClick={() => setReportType('products')} className={`rounded-xl px-4 py-3 text-sm font-black ${reportType === 'products' ? 'bg-[#121212] text-[#D4AF37]' : 'text-gray-500'}`}>{tr('productSalesReport')}</button>
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-gray-200 bg-white p-4">
          <label className="text-xs font-bold text-gray-600">{tr('from')}<input required type="date" value={dateFrom} max={dateTo} onChange={(event) => setDateFrom(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="text-xs font-bold text-gray-600">{tr('to')}<input required type="date" value={dateTo} min={dateFrom} onChange={(event) => setDateTo(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-3 py-2" /></label>
          <p className="ml-auto max-w-md text-right text-xs text-gray-500">{reportType === 'products' ? tr('productReportDateHelp') : tr('dailyReportDateHelp')}</p>
        </div>

        {reportType === 'daily' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[[tr('netPaid'), dailySummary.sales], ['SST', dailySummary.tax], [tr('serviceCharge'), dailySummary.service]].map(([label, value]) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-xs font-bold uppercase text-gray-400">{label}</p><p className="mt-2 text-2xl font-black">RM {value.toFixed(2)}</p></div>)}
            </div>
            <div className="flex flex-wrap gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm"><span>{tr('paidOrders')}</span><strong className="ml-3">{dailySummary.orderCount}</strong></div>
              {Object.entries(dailySummary.methods).map(([method, value]) => <div key={method} className="rounded-xl bg-gray-50 px-4 py-3 text-sm"><span className="font-bold">{method}</span><strong className="ml-3">RM {value.toFixed(2)}</strong></div>)}
            </div>
            {dailyReport.error && <ReportError message={dailyReport.error} />}
            {dailyReport.isLoading ? <ReportLoading label={tr('loadingReport')} /> : dailyReport.rows.length === 0 ? <ReportEmpty label={tr('noSales')} /> : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white"><table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">{tr('paidAt')}</th><th className="p-3">{tr('paymentNumber')}</th><th className="p-3">{tr('order')}</th><th className="p-3">{tr('method')}</th><th className="p-3">{tr('mode')}</th><th className="p-3 text-right">{tr('amount')}</th><th className="p-3 text-right">{tr('actions')}</th></tr></thead><tbody>{dailyReport.rows.map((row) => <tr key={row.payment_id} className="border-t border-gray-100"><td className="p-3">{new Date(row.paid_at).toLocaleString()}</td><td className="p-3 font-bold">{row.payment_number || '-'}</td><td className="p-3 font-bold">{row.order_number}</td><td className="p-3">{row.payment_method}</td><td className="p-3">{row.dining_mode}</td><td className="p-3 text-right font-black">RM {Number(row.amount_paid).toFixed(2)}</td><td className="p-3 text-right"><button onClick={() => void openTransaction(row)} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold hover:border-[#D4AF37]"><Eye className="h-4 w-4" /> {tr('view')}</button></td></tr>)}</tbody></table></div>
            )}
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryCard label={tr('productsSold')} value={productReport.rows.length} />
              <SummaryCard label={tr('unitsSold')} value={productSummary.quantity} />
              <SummaryCard label={tr('productGrossSales')} value={`RM ${productSummary.sales.toFixed(2)}`} />
            </div>
            {productReport.error && <ReportError message={productReport.error} />}
            {productReport.isLoading ? <ReportLoading label={tr('loadingProductReport')} /> : productReport.rows.length === 0 ? <ReportEmpty label={tr('noProductSales')} /> : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase text-gray-500"><tr><th className="p-3">{tr('productCode')}</th><th className="p-3">{tr('product')}</th><th className="p-3">{tr('category')}</th><th className="p-3 text-right">{tr('quantitySold')}</th><th className="p-3 text-right">{tr('orderCount')}</th><th className="p-3 text-right">{tr('averagePrice')}</th><th className="p-3 text-right">{tr('grossSales')}</th></tr></thead>
                  <tbody>{productReport.rows.map((row) => <tr key={row.product_id} className="border-t border-gray-100"><td className="p-3 font-mono text-xs">{row.product_code || '-'}</td><td className="p-3 font-bold">{row.product_name}</td><td className="p-3">{row.category_name || '-'}</td><td className="p-3 text-right font-black">{Number(row.quantity_sold)}</td><td className="p-3 text-right">{Number(row.order_count)}</td><td className="p-3 text-right">RM {Number(row.average_unit_price).toFixed(2)}</td><td className="p-3 text-right font-black">RM {Number(row.gross_sales).toFixed(2)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {selectedRow && <TransactionModal row={selectedRow} order={selectedOrder} loading={isLoadingTransaction} error={transactionError} onClose={() => setSelectedRow(null)} lang={lang} />}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-5"><p className="text-xs font-bold uppercase text-gray-400">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}

function ReportLoading({ label }) {
  return <div className="flex justify-center gap-2 py-12 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> {label}</div>;
}

function ReportEmpty({ label }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-500"><PackageSearch className="mx-auto mb-3 h-9 w-9" />{label}</div>;
}

function ReportError({ message }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
}

function TransactionModal({ row, order, loading, error, onClose, lang }) {
  const tr = (key) => translate(lang, key);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={tr('transactionDetails')}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4"><div><p className="text-xs font-black uppercase text-[#B08D20]">{tr('transactionDetails')}</p><h2 className="mt-1 text-2xl font-black">{row.order_number}</h2></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100" aria-label={tr('close')}><X className="h-5 w-5" /></button></div>{loading ? <ReportLoading label={tr('loadingOrderDetails')} /> : error ? <ReportError message={error} /> : order && <div id="printable-report-receipt" className="space-y-4 pt-5"><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-gray-500">{tr('paymentNumber')}</p><strong>{row.payment_number || '-'}</strong></div><div><p className="text-xs text-gray-500">{tr('paidAt')}</p><strong>{new Date(row.paid_at).toLocaleString()}</strong></div><div><p className="text-xs text-gray-500">{tr('paymentMethod')}</p><strong>{row.payment_method}</strong></div><div><p className="text-xs text-gray-500">{tr('status')}</p><strong>{translateStatus(lang, row.order_status)}</strong></div></div><div className="border-y border-dashed border-gray-300 py-4"><p className="mb-3 text-xs font-black uppercase text-gray-500">{tr('items')}</p>{order.items.map((item) => <div key={item.id} className="flex justify-between gap-4 py-1 text-sm"><span>{item.name} ×{item.quantity}</span><strong>RM {Number(item.subtotal).toFixed(2)}</strong></div>)}</div><div className="space-y-2 text-sm"><div className="flex justify-between"><span>{tr('subtotal')}</span><span>RM {order.subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>{tr('tax')}</span><span>RM {order.tax.toFixed(2)}</span></div><div className="flex justify-between"><span>{tr('serviceCharge')}</span><span>RM {order.serviceCharge.toFixed(2)}</span></div><div className="flex justify-between border-t-2 border-[#121212] pt-2 text-lg font-black"><span>{tr('totalPaid')}</span><span>RM {Number(row.amount_paid).toFixed(2)}</span></div></div><button onClick={() => window.print()} className="no-print flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] px-4 py-3 font-black text-[#D4AF37]"><Printer className="h-4 w-4" /> {tr('printReceipt')}</button></div>}</div></div>;
}
