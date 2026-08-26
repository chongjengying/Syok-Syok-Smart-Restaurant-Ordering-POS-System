import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Banknote, CheckCircle, CreditCard, Loader2, Smartphone, X } from 'lucide-react';
import { useOrder } from '../hooks/useOrder';
import { usePaymentCapabilities } from '../hooks/usePaymentCapabilities';
import { soundFx } from '../utils/audio';
import { getUserErrorMessage } from '../shared/errorMessages';
import { calculateCashTender } from '../services/cash-payment.service';
import { groupOrderRounds } from '../services/order-rounds.service';
import { translate, translatePackaging, translateStatus } from '../utils/i18n';
import { useManualQrPayment } from '../hooks/useManualQrPayment';

const METHOD_DETAILS = {
  CASH: { icon: Banknote, label: 'Cash' },
  CARD: { icon: CreditCard, label: 'Card' },
  QR: { icon: Smartphone, label: 'QR' },
  EWALLET: { icon: Smartphone, label: 'E-Wallet' },
};
const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;

export default function PaymentScreen({ orderId, onBack, onPaymentSubmit, lang = 'en' }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const { order, isLoading: isLoadingOrder, error: orderError } = useOrder(orderId, Boolean(orderId));
  const { methods: capabilities, isLoading: isLoadingMethods, error: capabilitiesError, refresh } = usePaymentCapabilities();
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [receivedInput, setReceivedInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [earlyPaymentAcknowledged, setEarlyPaymentAcknowledged] = useState(false);
  const [qrReference, setQrReference] = useState('');
  const [showQrConfirmation, setShowQrConfirmation] = useState(false);
  const { settings: qrSettings, error: qrSettingsError } = useManualQrPayment(Boolean(selectedMethod === 'QR'));

  useEffect(() => {
    setSelectedMethod((current) => (
      capabilities.some((method) => method.method === current && method.available)
        ? current
        : capabilities.find((method) => method.available)?.method || null
    ));
  }, [capabilities]);

  useEffect(() => {
    if (capabilitiesError) setPaymentError(capabilitiesError);
  }, [capabilitiesError]);

  useEffect(() => {
    setEarlyPaymentAcknowledged(false);
  }, [orderId]);

  const selectedCapability = capabilities.find((entry) => entry.method === selectedMethod) || null;
  const authoritativeTotal = Number(order?.total || 0);
  const receivedAmount = Number(receivedInput);
  const cashTender = selectedMethod === 'CASH' ? calculateCashTender(authoritativeTotal, receivedAmount) : null;
  const validCashReceived = selectedMethod !== 'CASH' || Boolean(cashTender);
  const changeAmount = cashTender?.changeAmount || 0;
  const hasUnsentItems = order?.items.some((item) => item.itemStatus === 'DRAFT') || false;
  const takeawayAwaitingPayment = Boolean(
    order?.diningMode === 'takeaway' && order.status === 'DRAFT' && order.paymentStatus === 'UNPAID' && hasUnsentItems,
  );
  const hasActiveKitchenItems = order?.items.some((item) =>
    ['SUBMITTED', 'PREPARING', 'READY'].includes(item.itemStatus),
  ) || false;
  const orderPayable = Boolean(
    order
    && (takeawayAwaitingPayment || ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status))
    && order.paymentStatus === 'UNPAID'
    && (takeawayAwaitingPayment || !hasUnsentItems),
  );
  const canConfirm = Boolean(
    order
    && selectedCapability?.available
    && orderPayable
    && validCashReceived
    && (selectedMethod !== 'QR' || (qrSettings.enabled && qrSettings.imageUrl && (!qrSettings.referenceRequired || qrReference.trim()) && qrSettings.scheme === 'DUITNOW' && qrSettings.mode === 'STATIC' && qrSettings.confirmationMode === 'MANUAL'))
    && (!hasActiveKitchenItems || earlyPaymentAcknowledged)
    && !isProcessing,
  );
  const orderItems = useMemo(() => order?.items || [], [order?.items]);

  const handlePayment = async () => {
    if (!canConfirm) return;
    soundFx.playTap();
    setPaymentError('');
    setIsProcessing(true);
    const result = await onPaymentSubmit({
      paymentMethod: selectedMethod,
      finalAmount: authoritativeTotal,
      receivedAmount: selectedMethod === 'CASH' ? cashTender.receivedAmount : authoritativeTotal,
      changeAmount,
      submitTakeaway: takeawayAwaitingPayment,
      paymentReference: selectedMethod === 'QR' ? qrReference.trim() : '',
    });
    setIsProcessing(false);
    if (result?.error) {
      setPaymentError(getUserErrorMessage(result.error, 'Payment could not be completed.'));
      soundFx.playRemove();
      return;
    }
    soundFx.playSuccess();
  };

  const requestPayment = () => {
    if (selectedMethod === 'QR') setShowQrConfirmation(true);
    else void handlePayment();
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} disabled={isProcessing} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37] disabled:opacity-50">
          <ArrowLeft className="h-5 w-5" /> {tr('order')}
        </button>
        <h1 className="font-black uppercase tracking-wider">{tr('payment')}</h1>
        <span className="font-black text-[#D4AF37]">{money(authoritativeTotal)}</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            {isLoadingOrder ? (
              <div className="flex min-h-96 items-center justify-center gap-3 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /> {tr('loadingOrder')}</div>
            ) : orderError || !order ? (
              <div className="m-6 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertTriangle className="h-5 w-5" /> {orderError || tr('orderNotFound')}</div>
            ) : (
              <>
                <div className="flex justify-between bg-[#121212] p-5 text-white">
                  <div>
                    <p className="text-xs font-bold text-[#D4AF37]">{order.diningMode === 'dine-in' ? tr('tableNumber', { number: order.table?.tableNumber || '-' }) : tr('takeaway')}</p>
                    <h2 className="mt-1 text-xl font-black">{order.orderNumber}</h2>
                  </div>
                  <div className="text-right text-xs"><p>{translateStatus(lang, order.status)}</p><p className="mt-1 text-amber-300">{translateStatus(lang, order.paymentStatus)}</p></div>
                </div>
                <div className="p-5">
                  {order.diningMode === 'takeaway' && order.takeawayPackaging.length > 0 && (
                    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                      <p className="text-[10px] font-black uppercase text-sky-800">{tr('packaging')}</p>
                      <p className="mt-1 text-xs font-semibold text-sky-900">{order.takeawayPackaging.map((entry) => translatePackaging(lang, entry)).join(' · ')}</p>
                    </div>
                  )}
                  <div className="max-h-72 space-y-4 overflow-y-auto">
                    {groupOrderRounds(orderItems).map((round) => (
                      <section key={round.roundNo}>
                        <p className="mb-2 text-[10px] font-black text-amber-800">{round.isAddOn ? tr('addOnRound', { number: round.roundNo }) : tr('round', { number: round.roundNo })}</p>
                        <div className="space-y-3">
                          {round.items.map((item) => (
                            <div key={item.id} className="flex justify-between gap-4 border-b border-gray-100 pb-3 text-sm">
                              <div><p className="font-bold">{item.name} <span className="text-gray-500">×{item.quantity}</span></p>{item.specialRequest && <p className="text-xs text-amber-700">Note: {item.specialRequest}</p>}</div>
                              <strong>{money(item.subtotal)}</strong>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
                    <div className="flex justify-between"><span>{tr('subtotal')}</span><span>{money(order.subtotal)}</span></div>
                    <div className="flex justify-between"><span>{tr('discount')}</span><span>- {money(order.discount)}</span></div>
                    <div className="flex justify-between"><span>{tr('tax')}</span><span>{money(order.tax)}</span></div>
                    {order.serviceCharge > 0 && <div className="flex justify-between"><span>{tr('serviceCharge')}</span><span>{money(order.serviceCharge)}</span></div>}
                    <div className="flex justify-between border-t-2 border-[#121212] pt-3 text-xl font-black"><span>{tr('total')}</span><span>{money(order.total)}</span></div>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-black">{tr('choosePayment')}</h2>
            {isLoadingMethods ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> {tr('loadingMethods')}</div>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {capabilities.map((capability) => {
                  const details = METHOD_DETAILS[capability.method];
                  if (!details) return null;
                  const Icon = details.icon;
                  const selected = capability.method === selectedMethod;
                  return (
                    <button key={capability.method} disabled={!capability.available || isProcessing} onClick={() => { setSelectedMethod(capability.method); setPaymentError(''); }} className={`rounded-xl border-2 p-4 text-left ${selected ? 'border-[#D4AF37] bg-[#121212] text-white' : 'border-gray-200 bg-white'} disabled:opacity-40`}>
                      <div className="flex items-center justify-between"><Icon className="h-5 w-5" />{selected && <CheckCircle className="h-4 w-4 text-[#D4AF37]" />}</div>
                      <p className="mt-3 text-sm font-black">{capability.method === 'CASH' ? tr('cash') : capability.method === 'CARD' ? tr('card') : capability.method === 'QR' ? tr('qrPayment') : tr('ewalletPayment')}</p>
                      {!capability.available && <p className="mt-1 text-[10px] font-bold text-red-600">{tr('paymentMethodUnavailable')}</p>}
                    </button>
                  );
                })}
              </div>
            )}

            {selectedMethod === 'CASH' && (
              <div className="mt-5 rounded-2xl bg-gray-50 p-4">
                <label htmlFor="received-amount" className="text-xs font-black uppercase text-gray-500">{tr('cashReceived')}</label>
                <div className="mt-2 flex items-center rounded-xl border border-gray-300 bg-white px-3 focus-within:border-[#D4AF37]">
                  <span className="text-sm font-bold">RM</span>
                  <input id="received-amount" inputMode="decimal" value={receivedInput} onChange={(event) => setReceivedInput(event.target.value.replace(/[^0-9.]/g, ''))} placeholder={authoritativeTotal.toFixed(2)} className="w-full bg-transparent px-2 py-3 text-right text-lg font-black outline-none" />
                </div>
                <div className="mt-3 flex justify-between text-sm"><span>{tr('change')}</span><strong className="text-emerald-700">{money(changeAmount)}</strong></div>
                {receivedInput && !validCashReceived && <p className="mt-2 text-xs font-semibold text-red-600">{tr('receivedInsufficient')}</p>}
              </div>
            )}

            {selectedMethod === 'QR' && (
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center">
                <p className="text-xs font-black uppercase text-sky-800">{qrSettings.displayName}</p>
                {qrSettings.enabled && qrSettings.imageUrl ? <img src={qrSettings.imageUrl} alt="Restaurant DuitNow QR" className="mx-auto mt-3 h-56 w-56 rounded-xl bg-white object-contain p-2" /> : <div className="mx-auto mt-3 flex h-56 w-56 items-center justify-center rounded-xl bg-white text-xs text-slate-500">DuitNow QR is not configured</div>}
                <p className="mt-3 text-3xl font-black">{money(authoritativeTotal)}</p>
                <p className="mt-1 text-xs text-sky-900">Ask the customer to scan and pay the exact amount. Verify receipt in the merchant banking app before confirming.</p>
                <label className="mt-4 block text-left text-xs font-bold text-sky-900">Payment reference <span className="font-normal">(optional)</span><input value={qrReference} onChange={event => setQrReference(event.target.value)} maxLength={150} placeholder="Bank reference or transaction ID" className="mt-1 w-full rounded-xl border border-sky-200 bg-white p-3 text-sm font-normal" /></label>
                {qrSettingsError && <p className="mt-2 text-left text-xs text-red-600">{qrSettingsError}</p>}
              </div>
            )}

            {!isLoadingOrder && order && !orderPayable && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{hasUnsentItems ? tr('dineInDraftPaymentWarning') : tr('orderNotPayableState', { status: order.status, paymentStatus: order.paymentStatus })}</div>}
            {!isLoadingOrder && orderPayable && hasActiveKitchenItems && (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                <input
                  type="checkbox"
                  checked={earlyPaymentAcknowledged}
                  onChange={(event) => setEarlyPaymentAcknowledged(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#121212]"
                />
                <span>
                  {tr('activeKitchenPaymentWarning')}
                </span>
              </label>
            )}
            {paymentError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{paymentError}{capabilitiesError && <button onClick={() => refresh()} className="ml-2 underline">{tr('retry')}</button>}</div>}

            <button disabled={!canConfirm} onClick={requestPayment} className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-4 font-black text-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">
              {isProcessing ? tr('recordingPayment') : selectedMethod === 'QR' ? 'Confirm QR Payment' : takeawayAwaitingPayment ? tr('paySubmitTakeaway') : tr('confirmPayment')}
            </button>
            {showQrConfirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 text-[#121212] shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase text-amber-700">Manual verification</p><h2 className="mt-1 text-xl font-black">Confirm QR Payment</h2></div><button onClick={()=>setShowQrConfirmation(false)} disabled={isProcessing} aria-label="Close"><X/></button></div><div className="my-5 rounded-xl bg-slate-50 p-4 text-sm"><p>Have you verified that <strong>{money(authoritativeTotal)}</strong> was successfully received?</p><p className="mt-2">Order: <strong>{order?.orderNumber}</strong></p><p className="mt-1">Payment: <strong>DuitNow QR</strong></p></div><p className="mb-5 text-xs text-slate-500">Only confirm after checking the merchant banking app or receipt.</p><div className="grid grid-cols-2 gap-3"><button onClick={()=>setShowQrConfirmation(false)} disabled={isProcessing} className="rounded-xl border px-4 py-3 font-bold">Go Back</button><button onClick={()=>{setShowQrConfirmation(false);void handlePayment();}} disabled={isProcessing} className="rounded-xl bg-emerald-500 px-4 py-3 font-black">{isProcessing?'Confirming…':'Yes, Payment Received'}</button></div></div></div>}
            <p className="mt-3 text-center text-[10px] text-gray-500">{tr('paymentDbNotice')}</p>
          </section>
        </div>
      </main>
    </div>
  );
}
