import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, CheckCircle, Loader2, Smartphone, X } from 'lucide-react';
import { useOrder } from '../hooks/useOrder';
import { usePaymentCapabilities } from '../hooks/usePaymentCapabilities';
import { usePaymentSummary } from '../hooks/usePaymentSummary';
import { calculateCashTender } from '../services/cash-payment.service';
import { processSplitPayment } from '../services/payment.service';
import { groupOrderRounds } from '../services/order-rounds.service';
import { soundFx } from '../utils/audio';
import { getUserErrorMessage } from '../shared/errorMessages';
import { translate, translatePackaging, translateStatus } from '../utils/i18n';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;
const METHOD_DETAILS = {
  CASH: { icon: Banknote, label: 'Cash' },
  QR: { icon: Smartphone, label: 'QR / E-wallet' },
};

export default function PaymentScreen({ orderId, onBack, onPaymentSubmit, lang = 'en' }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const { order, isLoading: isLoadingOrder, error: orderError } = useOrder(orderId, Boolean(orderId));
  const { methods: capabilities, isLoading: isLoadingMethods, error: capabilitiesError, refresh } = usePaymentCapabilities();
  const [summaryKey, setSummaryKey] = useState('');
  const { summary, isLoading: isLoadingSummary, error: summaryError, refetch } = usePaymentSummary(orderId, Boolean(orderId), summaryKey);
  const [selectedMethod, setSelectedMethod] = useState('CASH');
  const [providerId, setProviderId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [receivedInput, setReceivedInput] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [earlyPaymentAcknowledged, setEarlyPaymentAcknowledged] = useState(false);
  const [showQrConfirmation, setShowQrConfirmation] = useState(false);

  const paymentMethods = useMemo(() => capabilities
    .filter((capability) => ['CASH', 'QR', 'EWALLET'].includes(capability.method))
    .map((capability) => capability.method === 'EWALLET' ? { ...capability, method: 'QR' } : capability)
    .filter((capability, index, list) => list.findIndex((entry) => entry.method === capability.method) === index), [capabilities]);
  const selectedCapability = paymentMethods.find((entry) => entry.method === selectedMethod && entry.available);
  const providers = useMemo(() => selectedCapability?.providers || [], [selectedCapability]);
  const outstanding = Number(summary?.remainingAmount ?? order?.total ?? 0);
  const orderTotal = Number(summary?.orderTotal ?? order?.total ?? 0);
  const paid = Number(summary?.paidAmount ?? 0);
  const amount = Number(amountInput || outstanding);
  const receivedAmount = Number(receivedInput || amount);
  const cashTender = selectedMethod === 'CASH' ? calculateCashTender(amount, receivedAmount) : null;
  const providerRequired = selectedMethod === 'QR';
  const selectedProvider = providers.find((provider) => provider.providerId === providerId);
  const hasUnsentItems = order?.items.some((item) => item.itemStatus === 'DRAFT') || false;
  const takeawayAwaitingPayment = Boolean(order?.diningMode === 'takeaway' && order.status === 'DRAFT' && order.paymentStatus === 'UNPAID' && hasUnsentItems);
  const hasActiveKitchenItems = order?.items.some((item) => ['SUBMITTED', 'PREPARING', 'READY'].includes(item.itemStatus)) || false;
  const orderPayable = Boolean(order
    && (takeawayAwaitingPayment || ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status))
    && ['UNPAID', 'PARTIALLY_PAID'].includes(summary?.paymentStatus || order.paymentStatus)
    && (takeawayAwaitingPayment || !hasUnsentItems));
  const canAddPayment = Boolean(orderPayable && selectedCapability && amount > 0 && amount <= outstanding
    && (selectedMethod !== 'CASH' || cashTender)
    && (!providerRequired || selectedProvider)
    && (!hasActiveKitchenItems || earlyPaymentAcknowledged)
    && !isProcessing);
  const canComplete = Boolean(summary?.paymentStatus === 'PAID' && Number(summary.remainingAmount) === 0 && !isProcessing);

  useEffect(() => {
    const first = paymentMethods.find((method) => method.available)?.method;
    if (first && !paymentMethods.some((method) => method.method === selectedMethod && method.available)) setSelectedMethod(first);
  }, [paymentMethods, selectedMethod]);

  useEffect(() => {
    if (!amountInput && outstanding > 0) setAmountInput(outstanding.toFixed(2));
  }, [amountInput, outstanding]);

  useEffect(() => {
    if (!providers.some((provider) => provider.providerId === providerId)) setProviderId(providers[0]?.providerId || '');
  }, [providerId, providers]);

  const addPayment = async () => {
    if (!canAddPayment) return;
    soundFx.playTap();
    setPaymentError('');
    setIsProcessing(true);
    const result = await processSplitPayment({
      orderId,
      splitType: amount === outstanding ? 'FULL' : 'AMOUNT',
      paymentMethod: selectedMethod,
      amount: amount.toFixed(2),
      receivedAmount: selectedMethod === 'CASH' ? cashTender.receivedAmount.toFixed(2) : amount.toFixed(2),
      providerId: providerRequired ? providerId : null,
      paymentReference: referenceInput.trim() || null,
      idempotencyKey: crypto.randomUUID(),
    });
    setIsProcessing(false);
    if (result.error) {
      setPaymentError(getUserErrorMessage(result.error, 'Payment could not be recorded.'));
      soundFx.playRemove();
      return;
    }
    soundFx.playSuccess();
    setSummaryKey(crypto.randomUUID());
    await refetch();
    setAmountInput('');
    setReceivedInput('');
    setReferenceInput('');
  };

  const completeOrder = async () => {
    if (!canComplete) return;
    const result = await onPaymentSubmit({
      paymentMethod: 'MULTIPLE',
      receivedAmount: paid,
      changeAmount: 0,
      paymentReference: summary.payments.map((payment) => payment.paymentNumber).join(', '),
      alreadyPaid: true,
    });
    if (result?.error) setPaymentError(getUserErrorMessage(result.error, 'Order could not be completed.'));
  };

  const orderItems = useMemo(() => order?.items || [], [order?.items]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} disabled={isProcessing} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37] disabled:opacity-50">
          <ArrowLeft className="h-5 w-5" /> {tr('order')}
        </button>
        <h1 className="font-black uppercase tracking-wider">{tr('payment')}</h1>
        <span className="font-black text-[#D4AF37]">{money(outstanding)}</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            {isLoadingOrder ? <div className="flex min-h-96 items-center justify-center gap-3 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /> {tr('loadingOrder')}</div> : orderError || !order ? (
              <div className="m-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-5 w-5" /> {orderError || tr('orderNotFound')}</div>
            ) : <>
              <div className="flex justify-between bg-[#121212] p-5 text-white">
                <div><p className="text-xs font-bold text-[#D4AF37]">{order.diningMode === 'dine-in' ? tr('tableNumber', { number: order.table?.tableNumber || '-' }) : tr('takeaway')}</p><h2 className="mt-1 text-xl font-black">{order.orderNumber}</h2></div>
                <div className="text-right text-xs"><p>{translateStatus(lang, order.status)}</p><p className="mt-1 text-amber-300">{translateStatus(lang, summary?.paymentStatus || order.paymentStatus)}</p></div>
              </div>
              <div className="p-5">
                {order.diningMode === 'takeaway' && order.takeawayPackaging.length > 0 && <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3"><p className="text-[10px] font-black uppercase text-sky-800">{tr('packaging')}</p><p className="mt-1 text-xs font-semibold text-sky-900">{order.takeawayPackaging.map((entry) => translatePackaging(lang, entry)).join(' · ')}</p></div>}
                <div className="max-h-72 space-y-4 overflow-y-auto">
                  {groupOrderRounds(orderItems).map((round) => <section key={round.roundNo}><p className="mb-2 text-[10px] font-black text-amber-800">{round.isAddOn ? tr('addOnRound', { number: round.roundNo }) : tr('round', { number: round.roundNo })}</p><div className="space-y-3">{round.items.map((item) => <div key={item.id} className="flex justify-between gap-4 border-b border-gray-100 pb-3 text-sm"><div><p className="font-bold">{item.name} <span className="text-gray-500">x{item.quantity}</span></p>{item.specialRequest && <p className="text-xs text-amber-700">Note: {item.specialRequest}</p>}</div><strong>{money(item.subtotal)}</strong></div>)}</div></section>)}
                </div>
                <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
                  <div className="flex justify-between"><span>{tr('subtotal')}</span><span>{money(order.subtotal)}</span></div>
                  <div className="flex justify-between"><span>{tr('tax')}</span><span>{money(order.tax)}</span></div>
                  {order.serviceCharge > 0 && <div className="flex justify-between"><span>{tr('serviceCharge')}</span><span>{money(order.serviceCharge)}</span></div>}
                  <div className="flex justify-between border-t-2 border-[#121212] pt-3 text-xl font-black"><span>{tr('total')}</span><span>{money(order.total)}</span></div>
                </div>
              </div>
            </>}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-100 p-3"><p className="text-[10px] font-black uppercase text-slate-500">Order Total</p><strong>{money(orderTotal)}</strong></div>
              <div className="rounded-xl bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase text-emerald-700">Paid</p><strong>{money(paid)}</strong></div>
              <div className="rounded-xl bg-amber-50 p-3"><p className="text-[10px] font-black uppercase text-amber-700">Outstanding</p><strong>{money(outstanding)}</strong></div>
            </div>

            <h2 className="mt-5 font-black">Select payment method</h2>
            {isLoadingMethods || isLoadingSummary ? <div className="flex h-24 items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading payment details...</div> : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {paymentMethods.map((capability) => {
                  const details = METHOD_DETAILS[capability.method];
                  const Icon = details.icon;
                  const selected = capability.method === selectedMethod;
                  return <button key={capability.method} disabled={!capability.available || isProcessing || outstanding <= 0} onClick={() => { setSelectedMethod(capability.method); setPaymentError(''); }} className={`rounded-xl border-2 p-4 text-left ${selected ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200 bg-white'} disabled:opacity-40`}><div className="flex items-center justify-between"><Icon className="h-5 w-5" />{selected && <CheckCircle className="h-4 w-4 text-[#D4AF37]" />}</div><p className="mt-3 text-sm font-black">{details.label}</p></button>;
                })}
              </div>
            )}

            {outstanding > 0 && <div className="mt-5 rounded-2xl bg-gray-50 p-4">
              <label className="text-xs font-black uppercase text-gray-500">Amount applied to order</label>
              <div className="mt-2 flex items-center rounded-xl border border-gray-300 bg-white px-3"><span className="text-sm font-bold">RM</span><input inputMode="decimal" value={amountInput} onChange={(event) => setAmountInput(event.target.value.replace(/[^0-9.]/g, ''))} placeholder={outstanding.toFixed(2)} className="w-full bg-transparent px-2 py-3 text-right text-lg font-black outline-none" /></div>
              {selectedMethod === 'CASH' && <><label className="mt-4 block text-xs font-black uppercase text-gray-500">{tr('cashReceived')}</label><div className="mt-2 flex items-center rounded-xl border border-gray-300 bg-white px-3"><span className="text-sm font-bold">RM</span><input inputMode="decimal" value={receivedInput} onChange={(event) => setReceivedInput(event.target.value.replace(/[^0-9.]/g, ''))} placeholder={amount.toFixed(2)} className="w-full bg-transparent px-2 py-3 text-right text-lg font-black outline-none" /></div><div className="mt-3 flex justify-between text-sm"><span>{tr('change')}</span><strong className="text-emerald-700">{money(cashTender?.changeAmount || 0)}</strong></div></>}
              {providerRequired && <><label className="mt-4 block text-xs font-black uppercase text-gray-500">Provider</label><select value={providerId} onChange={(event) => setProviderId(event.target.value)} className="mt-2 w-full rounded-xl border bg-white p-3"><option value="">Select provider</option>{providers.map((provider) => <option key={provider.providerId} value={provider.providerId}>{provider.displayName}</option>)}</select><label className="mt-4 block text-xs font-black uppercase text-gray-500">Payment reference <span className="font-normal normal-case">(optional)</span></label><input value={referenceInput} onChange={(event) => setReferenceInput(event.target.value)} maxLength={150} placeholder="Reference number" className="mt-2 w-full rounded-xl border bg-white p-3" /></>}
            </div>}

            {orderPayable && hasActiveKitchenItems && <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900"><input type="checkbox" checked={earlyPaymentAcknowledged} onChange={(event) => setEarlyPaymentAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#121212]" /><span>{tr('activeKitchenPaymentWarning')}</span></label>}
            {!orderPayable && order && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{hasUnsentItems ? tr('dineInDraftPaymentWarning') : tr('orderNotPayableState', { status: order.status, paymentStatus: summary?.paymentStatus || order.paymentStatus })}</div>}
            {(paymentError || capabilitiesError || summaryError) && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{paymentError || capabilitiesError || summaryError}{capabilitiesError && <button onClick={() => refresh()} className="ml-2 underline">{tr('retry')}</button>}</div>}

            <button disabled={!canAddPayment} onClick={() => providerRequired ? setShowQrConfirmation(true) : void addPayment()} className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-4 font-black text-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">{isProcessing ? tr('recordingPayment') : 'Confirm Payment'}</button>
            <button disabled={!canComplete} onClick={completeOrder} className="mt-3 w-full rounded-xl bg-[#121212] px-5 py-4 font-black text-[#D4AF37] disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">Complete Order</button>

            <div className="mt-5 border-t pt-4">
              <h3 className="font-black">Payment History</h3>
              <div className="mt-3 space-y-2">
                {(summary?.payments || []).length === 0 ? <p className="text-sm text-gray-500">No confirmed payments yet.</p> : summary.payments.map((payment) => <div key={payment.id} className="rounded-xl border p-3 text-sm"><div className="flex justify-between"><strong>{payment.paymentMethod}{payment.providerName ? ` / ${payment.providerName}` : ''}</strong><strong>{money(payment.amount)}</strong></div><p className="mt-1 text-xs text-gray-500">{payment.paymentNumber} · {payment.cashier || '-'} · {new Date(payment.paidAt).toLocaleString()}</p></div>)}
              </div>
            </div>
          </section>
        </div>
      </main>
      {showQrConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 text-[#121212] shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase text-amber-700">Manual verification</p><h2 className="mt-1 text-xl font-black">Confirm QR / E-wallet Payment</h2></div><button onClick={() => setShowQrConfirmation(false)} disabled={isProcessing} aria-label="Close"><X /></button></div><div className="my-5 rounded-xl bg-slate-50 p-4 text-sm"><p>Have you verified that <strong>{money(amount)}</strong> was received?</p><p className="mt-2">Provider: <strong>{selectedProvider?.displayName}</strong></p><p className="mt-1">Order: <strong>{order?.orderNumber}</strong></p></div><p className="mb-5 text-xs text-slate-500">Physical QR remains manual. Confirm only after checking the merchant app or receipt.</p><div className="grid grid-cols-2 gap-3"><button onClick={() => setShowQrConfirmation(false)} disabled={isProcessing} className="rounded-xl border px-4 py-3 font-bold">Go Back</button><button onClick={() => { setShowQrConfirmation(false); void addPayment(); }} disabled={isProcessing} className="rounded-xl bg-emerald-500 px-4 py-3 font-black">{isProcessing ? 'Confirming...' : 'Yes, Payment Received'}</button></div></div></div>}
    </div>
  );
}
