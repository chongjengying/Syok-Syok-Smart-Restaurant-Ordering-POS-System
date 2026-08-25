import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Printer, ReceiptText, X } from 'lucide-react';
import { useOrder } from '../hooks/useOrder';
import { usePaymentCapabilities } from '../hooks/usePaymentCapabilities';
import { usePaymentSummary } from '../hooks/usePaymentSummary';
import { createEqualOrderSplit, getOrderBills } from '../services/order.service';
import { processSplitPayment } from '../services/payment.service';
import { getUserErrorMessage } from '../shared/errorMessages';
import { formatMoney } from '../services/money.service';
import { formatCents, parseMoneyToCents, selectedItemTotalCents, splitCentsEqually } from '../services/split-payment.service';
import { translate } from '../utils/i18n';

export default function SplitBillScreen({ orderId, onBack, onDone, lang = 'en' }) {
  const tr = useCallback((key, variables) => translate(lang, key, variables), [lang]);
  const { order, isLoading: loadingOrder, error: orderError } = useOrder(orderId, Boolean(orderId));
  const { methods: capabilities, isLoading: loadingMethods } = usePaymentCapabilities();
  const paymentRefreshKey = `${order?.paymentStatus || ''}:${order?.payments?.length || 0}`;
  const { summary, isLoading: loadingSummary, error: summaryError, refetch: refetchSummary } = usePaymentSummary(orderId, Boolean(orderId), paymentRefreshKey);
  const [bills, setBills] = useState([]);
  const [mode, setMode] = useState('FULL');
  const [equalCount, setEqualCount] = useState(2);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [itemQuantities, setItemQuantities] = useState({});
  const [selectedMethod, setSelectedMethod] = useState('CASH');
  const [receivedInput, setReceivedInput] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [receiptPayment, setReceiptPayment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef(null);

  const loadPaymentState = useCallback(async () => {
    const [, billsResult] = await Promise.all([
      refetchSummary(),
      getOrderBills(orderId),
    ]);
    if (!billsResult.error) setBills(billsResult.data || []);
  }, [orderId, refetchSummary]);

  useEffect(() => { void getOrderBills(orderId).then((result) => { if (!result.error) setBills(result.data || []); }); }, [orderId, paymentRefreshKey]);

  useEffect(() => { if (summaryError) setError(summaryError); }, [summaryError]);

  useEffect(() => {
    const available = capabilities.find((entry) => entry.available);
    if (!capabilities.some((entry) => entry.method === selectedMethod && entry.available)) {
      setSelectedMethod(available?.method || '');
    }
  }, [capabilities, selectedMethod]);

  const remainingCents = parseMoneyToCents(summary?.remainingAmount ?? '') ?? 0;
  const paidCents = parseMoneyToCents(summary?.paidAmount ?? '') ?? 0;
  const selectedBill = bills.find((bill) => bill.id === selectedBillId) || null;
  const equalPreview = useMemo(() => {
    return splitCentsEqually(remainingCents, equalCount);
  }, [equalCount, remainingCents]);

  const selectedItemCents = useMemo(
    () => selectedItemTotalCents(summary?.items || [], itemQuantities),
    [itemQuantities, summary?.items],
  );

  const resetRequest = () => { requestKey.current = null; setConfirmation(null); setError(''); };

  const selectMode = (nextMode) => {
    setMode(nextMode);
    setSelectedBillId('');
    setAmountInput('');
    setItemQuantities({});
    setReceivedInput('');
    resetRequest();
  };

  const createEqualSplit = async () => {
    if (paidCents > 0 || bills.length > 0 || busy) return;
    setBusy(true); setError('');
    const result = await createEqualOrderSplit(orderId, equalCount);
    if (result.error) setError(getUserErrorMessage(result.error, tr('splitCreateFailed')));
    else await loadPaymentState();
    setBusy(false);
  };

  const prepareConfirmation = () => {
    setError('');
    if (!selectedMethod) { setError(tr('selectPaymentMethod')); return; }
    let amountCents = 0;
    let billId = null;
    let itemAllocations = [];
    if (mode === 'FULL') amountCents = remainingCents;
    if (mode === 'AMOUNT') amountCents = parseMoneyToCents(amountInput) ?? 0;
    if (mode === 'EQUAL') {
      if (!selectedBill) { setError(tr('selectEqualPart')); return; }
      amountCents = (parseMoneyToCents(selectedBill.total) || 0) - (parseMoneyToCents(selectedBill.paid_amount) || 0);
      billId = selectedBill.id;
    }
    if (mode === 'ITEM') {
      amountCents = selectedItemCents;
      itemAllocations = Object.entries(itemQuantities)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([orderItemId, quantity]) => ({ orderItemId, quantity: Number(quantity) }));
    }
    if (amountCents <= 0) { setError(tr('positivePaymentRequired')); return; }
    if (amountCents > remainingCents) { setError(tr('paymentExceedsBalance')); return; }
    const receivedCents = selectedMethod === 'CASH'
      ? (receivedInput ? parseMoneyToCents(receivedInput) : amountCents)
      : amountCents;
    if (receivedCents == null || receivedCents < amountCents) { setError(tr('receivedInsufficient')); return; }
    requestKey.current ||= crypto.randomUUID();
    setConfirmation({
      splitType: mode,
      paymentMethod: selectedMethod,
      amount: formatCents(amountCents),
      receivedAmount: formatCents(receivedCents),
      changeAmount: formatCents(receivedCents - amountCents),
      remainingBefore: formatCents(remainingCents),
      remainingAfter: formatCents(remainingCents - amountCents),
      itemAllocations,
      billId,
    });
  };

  const confirmPayment = async () => {
    if (!confirmation || busy || !requestKey.current) return;
    setBusy(true); setError('');
    const result = await processSplitPayment({
      orderId,
      splitType: confirmation.splitType,
      paymentMethod: confirmation.paymentMethod,
      amount: confirmation.amount,
      receivedAmount: confirmation.receivedAmount,
      itemAllocations: confirmation.itemAllocations,
      billId: confirmation.billId,
      idempotencyKey: requestKey.current,
    });
    if (result.error) {
      setError(getUserErrorMessage(result.error, tr('splitPaymentFailed')));
      setBusy(false);
      return;
    }
    await refetchSummary();
    const billsResult = await getOrderBills(orderId);
    if (!billsResult.error) setBills(billsResult.data || []);
    setConfirmation(null);
    requestKey.current = null;
    setAmountInput('');
    setReceivedInput('');
    setItemQuantities({});
    setSelectedBillId('');
    setBusy(false);
  };

  if (loadingOrder || loadingSummary || !summary) return <div className="flex h-full items-center justify-center gap-2"><Loader2 className="animate-spin" /> {tr('loadingOrder')}</div>;
  if (orderError || !order) return <div className="p-8 text-red-700">{orderError || tr('orderNotFound')}</div>;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} disabled={busy} className="flex items-center gap-2 font-bold"><ArrowLeft /> {tr('order')}</button>
        <h1 className="font-black">{tr('splitBill')}</h1>
        <strong>{order.orderNumber}</strong>
      </header>
      <main className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="grid gap-3 rounded-3xl bg-[#121212] p-5 text-white sm:grid-cols-3">
            <div><p className="text-xs text-gray-400">{tr('orderTotal')}</p><strong className="text-2xl">{formatMoney(summary.orderTotal)}</strong></div>
            <div><p className="text-xs text-gray-400">{tr('alreadyPaid')}</p><strong className="text-2xl text-emerald-400">{formatMoney(summary.paidAmount)}</strong></div>
            <div><p className="text-xs text-gray-400">{tr('remainingBalance')}</p><strong className="text-2xl text-[#D4AF37]">{formatMoney(summary.remainingAmount)}</strong></div>
          </section>

          {summary.paymentStatus !== 'PAID' && (
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {['FULL', 'EQUAL', 'AMOUNT', 'ITEM'].map((entry) => (
                    <button key={entry} disabled={bills.length > 0 && entry !== 'EQUAL'} onClick={() => selectMode(entry)} className={`rounded-xl border-2 p-3 text-sm font-black disabled:opacity-35 ${mode === entry ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200'}`}>
                      {tr(`splitMode${entry}`)}
                    </button>
                  ))}
                </div>

                {mode === 'FULL' && <p className="mt-6 rounded-xl bg-gray-50 p-4">{tr('payFullRemaining')} <strong className="float-right">{formatMoney(summary.remainingAmount)}</strong></p>}
                {mode === 'AMOUNT' && <label className="mt-6 block text-sm font-bold">{tr('paymentAmount')}<div className="mt-2 flex rounded-xl border px-3"><span className="py-3">RM</span><input value={amountInput} onChange={(event) => { setAmountInput(event.target.value); resetRequest(); }} inputMode="decimal" className="w-full p-3 outline-none" placeholder="0.00" /></div></label>}

                {mode === 'EQUAL' && bills.length === 0 && (
                  <div className="mt-6 space-y-4">
                    <label className="font-bold">{tr('numberOfPeople')}<select value={equalCount} onChange={(event) => setEqualCount(Number(event.target.value))} className="ml-3 rounded-lg border p-2">{Array.from({ length: 9 }, (_, index) => <option key={index + 2}>{index + 2}</option>)}</select></label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{equalPreview.map((cents, index) => <div key={index} className="rounded-xl bg-gray-50 p-3 text-sm"><span>{tr('personNumber', { number: index + 1 })}</span><strong className="float-right">{formatMoney(formatCents(cents))}</strong></div>)}</div>
                    <button disabled={busy || paidCents > 0} onClick={() => void createEqualSplit()} className="w-full rounded-xl bg-[#121212] p-3 font-black text-[#D4AF37] disabled:opacity-40">{busy ? tr('processing') : tr('createEqualSplit')}</button>
                  </div>
                )}

                {mode === 'EQUAL' && bills.length > 0 && (
                  <div className="mt-6 grid grid-cols-2 gap-3">{bills.map((bill) => {
                    const billRemaining = (parseMoneyToCents(bill.total) || 0) - (parseMoneyToCents(bill.paid_amount) || 0);
                    return <button key={bill.id} disabled={bill.status === 'PAID'} onClick={() => { setSelectedBillId(bill.id); resetRequest(); }} className={`rounded-xl border-2 p-4 text-left disabled:bg-emerald-50 ${selectedBillId === bill.id ? 'border-[#D4AF37]' : 'border-gray-200'}`}><strong>{tr('personNumber', { number: bill.bill_number })}</strong><span className="float-right">{bill.status === 'PAID' ? tr('paid') : formatMoney(formatCents(billRemaining))}</span></button>;
                  })}</div>
                )}

                {mode === 'ITEM' && (
                  <div className="mt-6 space-y-3">{summary.items.filter((item) => item.remainingQuantity > 0).map((item) => (
                    <div key={item.orderItemId} className="flex items-center gap-4 rounded-xl border p-4">
                      <div className="min-w-0 flex-1"><p className="font-bold">{item.name}</p><p className="text-xs text-gray-500">{tr('quantityRemaining', { count: item.remainingQuantity })} · {formatMoney(item.remainingAmount)}</p></div>
                      <select value={itemQuantities[item.orderItemId] || 0} onChange={(event) => { setItemQuantities((current) => ({ ...current, [item.orderItemId]: Number(event.target.value) })); resetRequest(); }} className="rounded-lg border p-2">{Array.from({ length: item.remainingQuantity + 1 }, (_, value) => <option key={value}>{value}</option>)}</select>
                    </div>
                  ))}<div className="text-right font-black">{tr('selectedTotal')}: {formatMoney(formatCents(selectedItemCents))}</div></div>
                )}
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="font-black">{tr('choosePayment')}</h2>
                {loadingMethods ? <Loader2 className="mt-5 animate-spin" /> : <div className="mt-4 grid grid-cols-2 gap-2">{capabilities.map((capability) => <button key={capability.method} disabled={!capability.available || busy} onClick={() => { setSelectedMethod(capability.method); resetRequest(); }} className={`rounded-xl border-2 p-3 text-sm font-black disabled:opacity-35 ${selectedMethod === capability.method ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200'}`}>{capability.method}{!capability.available && <span className="block text-[9px] text-red-500">{tr('paymentMethodUnavailable')}</span>}</button>)}</div>}
                {selectedMethod === 'CASH' && <label className="mt-5 block text-sm font-bold">{tr('cashReceived')}<div className="mt-2 flex rounded-xl border px-3"><span className="py-3">RM</span><input value={receivedInput} onChange={(event) => { setReceivedInput(event.target.value); resetRequest(); }} inputMode="decimal" className="w-full p-3 outline-none" placeholder={tr('exactAmountDefault')} /></div></label>}
                <button disabled={busy || !selectedMethod} onClick={prepareConfirmation} className="mt-6 w-full rounded-xl bg-emerald-500 p-4 font-black disabled:bg-gray-300">{tr('reviewPayment')}</button>
                {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              </section>
            </div>
          )}

          <section className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-black"><ReceiptText className="h-5 w-5" /> {tr('paymentHistory')}</h2>
            {summary.payments.length === 0 ? <p className="mt-4 text-sm text-gray-500">{tr('noPaymentsRecorded')}</p> : (
              <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-gray-500"><th className="p-2">{tr('paymentNumber')}</th><th>{tr('splitType')}</th><th>{tr('method')}</th><th className="text-right">{tr('amount')}</th><th className="text-right">{tr('remainingAmount')}</th><th /></tr></thead><tbody>{summary.payments.map((payment) => <tr key={payment.id} className="border-t"><td className="p-2 font-bold">{payment.paymentNumber}</td><td>{payment.splitType}</td><td>{payment.paymentMethod}</td><td className="text-right font-bold">{formatMoney(payment.amount)}</td><td className="text-right">{formatMoney(payment.remainingAfter)}</td><td className="text-right"><button onClick={() => setReceiptPayment(payment)} className="rounded-lg border px-3 py-2 text-xs font-bold">{tr('receipt')}</button></td></tr>)}</tbody></table></div>
            )}
            {summary.paymentStatus === 'PAID' && <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-center"><CheckCircle2 className="mx-auto text-emerald-600" /><p className="mt-2 font-black">{tr('billFullyPaid')}</p><button onClick={onDone} className="mt-3 rounded-xl bg-[#121212] px-8 py-3 font-black text-[#D4AF37]">{tr('done')}</button></div>}
          </section>
        </div>
      </main>

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-black">{tr('confirmPayment')}</h2>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between"><span>{tr('order')}</span><strong>{order.orderNumber}</strong></div>
              <div className="flex justify-between"><span>{tr('splitType')}</span><strong>{confirmation.splitType}</strong></div>
              <div className="flex justify-between"><span>{tr('paymentMethod')}</span><strong>{confirmation.paymentMethod}</strong></div>
              <div className="flex justify-between text-lg"><span>{tr('amount')}</span><strong>{formatMoney(confirmation.amount)}</strong></div>
              <div className="flex justify-between"><span>{tr('remainingBefore')}</span><strong>{formatMoney(confirmation.remainingBefore)}</strong></div>
              <div className="flex justify-between"><span>{tr('remainingAfter')}</span><strong>{formatMoney(confirmation.remainingAfter)}</strong></div>
              {confirmation.paymentMethod === 'CASH' && <><div className="flex justify-between"><span>{tr('received')}</span><strong>{formatMoney(confirmation.receivedAmount)}</strong></div><div className="flex justify-between text-emerald-700"><span>{tr('change')}</span><strong>{formatMoney(confirmation.changeAmount)}</strong></div></>}
            </div>
            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3"><button disabled={busy} onClick={() => setConfirmation(null)} className="rounded-xl border p-3 font-bold">{tr('back')}</button><button disabled={busy} onClick={() => void confirmPayment()} className="rounded-xl bg-emerald-500 p-3 font-black disabled:opacity-50">{busy ? tr('processing') : tr('confirmPayment')}</button></div>
          </section>
        </div>
      )}

      {receiptPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="no-print flex items-center justify-between"><h2 className="text-xl font-black">{tr('paymentReceipt')}</h2><button onClick={() => setReceiptPayment(null)} aria-label={tr('close')}><X /></button></div>
            <div id="printable-receipt" className="mt-5 space-y-3 border-y border-dashed py-5 text-sm">
              <div className="flex justify-between"><span>{tr('order')}</span><strong>{summary.orderNumber}</strong></div>
              <div className="flex justify-between"><span>{tr('paymentNumber')}</span><strong>{receiptPayment.paymentNumber}</strong></div>
              <div className="flex justify-between"><span>{tr('paymentMethod')}</span><strong>{receiptPayment.paymentMethod}</strong></div>
              <div className="flex justify-between"><span>{tr('splitType')}</span><strong>{receiptPayment.splitType}</strong></div>
              <div className="flex justify-between"><span>{tr('cashier')}</span><strong>{receiptPayment.cashier || '-'}</strong></div>
              <div className="flex justify-between"><span>{tr('dateTime')}</span><strong>{new Date(receiptPayment.paidAt).toLocaleString()}</strong></div>
              <div className="flex justify-between text-lg"><span>{tr('amount')}</span><strong>{formatMoney(receiptPayment.amount)}</strong></div>
              {receiptPayment.paymentMethod === 'CASH' && <><div className="flex justify-between"><span>{tr('received')}</span><strong>{formatMoney(receiptPayment.receivedAmount)}</strong></div><div className="flex justify-between"><span>{tr('change')}</span><strong>{formatMoney(receiptPayment.changeAmount)}</strong></div></>}
              <div className="flex justify-between"><span>{tr('orderTotal')}</span><strong>{formatMoney(summary.orderTotal)}</strong></div>
              <div className="flex justify-between"><span>{tr('totalPaid')}</span><strong>{formatMoney(receiptPayment.paidTotalAfter)}</strong></div>
              <div className="flex justify-between"><span>{tr('remainingBalance')}</span><strong>{formatMoney(receiptPayment.remainingAfter)}</strong></div>
            </div>
            <button onClick={() => window.print()} className="no-print mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#121212] p-3 font-black text-[#D4AF37]"><Printer className="h-4 w-4" /> {tr('printReceipt')}</button>
          </section>
        </div>
      )}
    </div>
  );
}
