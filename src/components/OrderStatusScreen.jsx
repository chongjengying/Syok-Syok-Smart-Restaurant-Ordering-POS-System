import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Loader2, Plus, Printer, RotateCcw, X, Receipt } from 'lucide-react';
import { translate, translations, translateStatus } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { useOrder } from '../hooks/useOrder';
import { deriveOrderKitchenProgress, groupOrderRounds } from '../services/order-rounds.service';
import { formatMoney as formatConfiguredMoney } from '../services/money.service';
import { usePosDisplaySettings } from '../hooks/usePosDisplaySettings';

export default function OrderStatusScreen({
  orderData,
  notice,
  onResetOrder,
  onAddItems,
  onProceedToPayment,
  canAddItems,
  canPay,
  diningMode,
  selectedTable,
  lang
}) {
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);
  const { order, isLoading, error } = useOrder(orderData.id, Boolean(orderData.id));
  const displaySettings = usePosDisplaySettings();
  const restaurantInfo = displaySettings?.restaurantInfo || {};
  const receiptConfig = displaySettings?.receiptConfig || {};
  const formatMoney = (value) => formatConfiguredMoney(value, order?.currencyCode || displaySettings?.currencyCode || 'MYR', Number(displaySettings?.decimalPlaces ?? 2), String(displaySettings?.currencySymbol || ''));
  const receiptItems = useMemo(() => order?.items || [], [order?.items]);
  const receiptPayment = useMemo(() => [...(order?.payments || [])].reverse().find((payment) => ['PAID','REFUNDED'].includes(payment.status)) || order?.payments?.at(-1), [order?.payments]);
  const receiptStaffName = receiptPayment?.cashierName || order?.staffName || '';
  const receiptPaymentMethod = receiptPayment?.paymentMethod || '';
  const receiptCopies = Math.min(9, Math.max(1, Number(receiptConfig.copies) || 1));
  const receiptPaperWidth = String(receiptConfig.paperSize) === '58mm' ? '58mm' : '80mm';
  const autoPrintPending = useRef(false);
  const orderStatus = order?.status || orderData.status || 'CONFIRMED';
  const kitchenProgress = useMemo(() => deriveOrderKitchenProgress(receiptItems), [receiptItems]);
  const orderRounds = useMemo(() => groupOrderRounds(receiptItems), [receiptItems]);
  const statusStep = ['READY', 'SERVED'].includes(kitchenProgress.label)
    ? 2
    : kitchenProgress.preparing > 0
      ? 1
      : 0;
  const subtotal = order?.subtotal ?? 0;
  const tax = order?.tax ?? 0;
  const serviceCharge = order?.serviceCharge ?? 0;
  const discount = order?.discount ?? 0;
  const grandTotal = order?.total ?? 0;
  const effectiveDiningMode = order?.diningMode || diningMode;
  const resolvedTableLabel = order?.table?.tableNumber || selectedTable || '';
  const hasUnsentItems = receiptItems.some((item) => item.itemStatus === 'DRAFT');
  const paymentReady = Boolean(
    order
    && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status)
    && order.paymentStatus === 'UNPAID'
    && !hasUnsentItems,
  );

  const receiptTimestamp = order?.createdAt
    ? new Date(order.createdAt).toLocaleString()
    : new Date().toLocaleString();

  const handlePrint = useCallback(() => {
    soundFx.playTap();
    const source = document.getElementById('printable-receipt');
    if (!source) return;
    const printBatch = document.createElement('div');
    printBatch.id = 'printable-receipt-batch';
    printBatch.style.setProperty('--receipt-paper-width', receiptPaperWidth);
    for (let index = 0; index < receiptCopies; index += 1) {
      const copy = source.cloneNode(true);
      copy.removeAttribute('id');
      copy.classList.add('printable-receipt-copy');
      printBatch.append(copy);
    }
    document.body.append(printBatch);
    document.body.classList.add('printing-receipt-batch');
    const cleanup = () => { printBatch.remove(); document.body.classList.remove('printing-receipt-batch'); };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  }, [receiptCopies, receiptPaperWidth]);

  useEffect(() => {
    if (!showThermalReceipt || !autoPrintPending.current) return undefined;
    autoPrintPending.current = false;
    const timer = window.setTimeout(handlePrint, 150);
    return () => window.clearTimeout(timer);
  }, [handlePrint, showThermalReceipt]);

  return (
    <div className="w-full h-full flex flex-col bg-[#121212] text-white p-8 overflow-y-auto relative">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#D4AF37]/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Content Card Container */}
      <div className="relative z-10 max-w-3xl mx-auto w-full my-auto bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center space-y-6">
        {/* Animated Green Checkmark Icon */}
        <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 animate-bounce-subtle shadow-[0_0_40px_rgba(46,125,50,0.5)]">
          <CheckCircle2 className="w-14 h-14 stroke-[2.5]" />
        </div>

        {/* Order Headline */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
            {t.orderReceived}
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">
            {isLoading
              ? tr('loadingBackendOrder')
              : error
                ? tr('backendRefreshFailed')
                : `${tr('backendOrderSynced')}${resolvedTableLabel ? ` • ${tr('table')} ${resolvedTableLabel}` : ''}`}
          </p>
        </div>

        {/* Order Number Highlight Cluster */}
        <div className="w-full bg-white/10 p-4 rounded-2xl border border-white/15">
          <span className="text-xs text-[#D4AF37] font-extrabold uppercase tracking-widest block">
            {t.orderNumberLabel}
          </span>
          <span className="text-5xl font-black tracking-wider text-white mt-1 block">
            {order?.orderNumber || orderData.orderId}
          </span>
        </div>

        {/* Live Status Progress Stepper */}
        <div className="w-full py-4 px-6 bg-black/40 rounded-2xl border border-white/10">
          <div className="mb-4 text-center">
            <p className={`text-sm font-black tracking-widest ${kitchenProgress.label === 'READY' ? 'text-emerald-400' : 'text-[#D4AF37]'}`}>
              {kitchenProgress.label === 'ORDER IN PROGRESS' ? tr('orderInProgress') : translateStatus(lang, kitchenProgress.label)}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-[10px] font-bold text-gray-300">
              {kitchenProgress.waiting > 0 && <span>{kitchenProgress.waiting} {translateStatus(lang, 'PENDING')}</span>}
              {kitchenProgress.preparing > 0 && <span>{kitchenProgress.preparing} {translateStatus(lang, 'PREPARING')}</span>}
              {kitchenProgress.ready > 0 && <span>{kitchenProgress.ready} {translateStatus(lang, 'READY')}</span>}
              {kitchenProgress.served > 0 && <span>{kitchenProgress.served} {translateStatus(lang, 'SERVED')}</span>}
            </div>
          </div>
          <div className="flex items-center justify-between relative">
            {/* Connecting Line */}
            <div className="absolute top-1/2 left-8 right-8 h-1 bg-white/15 -translate-y-1/2 -z-0" />
            <div
              className="absolute top-1/2 left-8 h-1 bg-[#D4AF37] -translate-y-1/2 transition-all duration-700 -z-0"
              style={{
                width: statusStep === 0 ? '0%' : statusStep === 1 ? '50%' : '100%'
              }}
            />

            {/* Step 1: Placed */}
            <div className="relative z-10 flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all ${
                statusStep >= 0 ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow' : 'bg-gray-800 text-gray-400 border-gray-600'
              }`}>
                ✓
              </div>
              <span className="text-xs font-bold text-gray-200">{t.statusPlaced}</span>
            </div>

            {/* Step 2: Preparing */}
            <div className="relative z-10 flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all ${
                statusStep >= 1 ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow' : 'bg-gray-800 text-gray-400 border-gray-600'
              }`}>
                {statusStep === 1 ? '⏳' : statusStep > 1 ? '✓' : '2'}
              </div>
              <span className="text-xs font-bold text-gray-200">{t.statusPreparing}</span>
            </div>

            {/* Step 3: Ready */}
            <div className="relative z-10 flex flex-col items-center gap-1.5">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs border-2 transition-all ${
                statusStep >= 2 ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg animate-pulse' : 'bg-gray-800 text-gray-400 border-gray-600'
              }`}>
                {statusStep === 2 ? '★' : '3'}
              </div>
              <span className={`text-xs font-bold ${statusStep === 2 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {t.statusReady}
              </span>
            </div>
          </div>
        </div>

        {/* Order Details Metadata Bar */}
        <div className="flex items-center justify-center gap-6 text-sm text-gray-300 font-medium">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#D4AF37]" />
            <span>{tr('order')}: <strong className="text-white">{translateStatus(lang, orderStatus)}</strong></span>
          </div>
          <span>•</span>
          <div>
            <span>{effectiveDiningMode === 'dine-in' ? `${t.table}: ${resolvedTableLabel}` : t.takeaway}</span>
          </div>
          <span>•</span>
          <div>
            <span>{receiptItems.reduce((sum, item) => sum + item.quantity, 0)} {t.items}</span>
          </div>
        </div>

        {isLoading && (
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300 flex items-center justify-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{tr('loadingOrderDetails')}</span>
          </div>
        )}

        {error && (
          <div className="w-full rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="w-full rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {!isLoading && receiptItems.length > 0 && (
          <div className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-left">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-white">{tr('orderRounds')}</h2>
                <p className="mt-0.5 text-[11px] text-gray-400">{tr('roundsHelp')}</p>
              </div>
              <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-black text-amber-300">
                {translateStatus(lang, order?.paymentStatus || orderData.paymentStatus)}
              </span>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
              {orderRounds.map((round) => (
                <section key={round.roundNo} className="rounded-xl bg-white/5 px-3 py-2">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-black text-[#E8C85A]">
                      {round.isAddOn ? tr('addOnRound', { number: round.roundNo }) : tr('round', { number: round.roundNo })}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-gray-300">{translateStatus(lang, round.status)}</span>
                  </div>
                  <div className="space-y-2">
                    {round.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">{item.quantity}× {item.name}</span>
                            {item.serviceMode === 'TAKEAWAY' && <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-[9px] font-black text-sky-300">{tr('takeawayBadge')}</span>}
                          </div>
                          {item.options.map((option) => <p key={option.id} className="mt-0.5 text-[10px] text-gray-400">{option.groupName}: {option.name}</p>)}
                          {item.specialRequest && <p className="mt-0.5 text-[10px] font-semibold text-amber-300">{tr('notePrefix', { note: item.specialRequest })}</p>}
                          {item.sentAt && <p className="mt-0.5 text-[9px] text-gray-500">{tr('sentAt', { date: new Date(item.sentAt).toLocaleString() })}</p>}
                        </div>
                        <p className="shrink-0 font-bold text-white">{formatMoney(item.subtotal)}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-sm">
              <span className="font-bold text-gray-300">{tr('currentUnpaidTotal')}</span>
              <span className="font-black text-[#D4AF37]">{formatMoney(grandTotal)}</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-4 w-full pt-2">
          {/* Thermal Receipt Button */}
          <button
            onClick={() => {
              soundFx.playTap();
              autoPrintPending.current = receiptConfig.autoPrint === true;
              setShowThermalReceipt(true);
            }}
            className="flex-1 h-[56px] rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Receipt className="w-5 h-5 text-[#D4AF37]" />
            <span>{t.printReceipt}</span>
          </button>

          {canAddItems && (
            <button
              onClick={() => {
                soundFx.playTap();
                onAddItems();
              }}
              className="flex-1 h-[56px] rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm border border-white/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <Plus className="w-5 h-5 text-[#D4AF37]" />
              <span>+ {tr('addItems')}</span>
            </button>
          )}

          {canPay && paymentReady && (
            <button
              onClick={() => {
                soundFx.playTap();
                onProceedToPayment();
              }}
              className="flex-1 h-[64px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <CreditCard className="w-5 h-5" />
              <span>{tr('viewBillPay')}</span>
            </button>
          )}

          {/* Done / Reset Button (64pt height) */}
          <button
            onClick={() => {
              soundFx.playTap();
              onResetOrder();
            }}
            className="flex-1 h-[64px] rounded-2xl bg-[#D4AF37] hover:bg-[#B8952B] text-black font-bold text-base tracking-wider flex items-center justify-center gap-2 btn-gold-shadow active:scale-95 transition-all cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            <span>{t.done}</span>
          </button>
        </div>
      </div>

      {/* Printable Thermal Paper Receipt Preview Modal */}
      {showThermalReceipt && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div style={{width:receiptPaperWidth==='58mm'?'280px':'360px'}} className="bg-white text-black max-h-[92vh] overflow-y-auto rounded-2xl p-6 shadow-2xl relative border border-gray-300 font-mono text-xs">
            {/* Close Modal Button */}
            <button
              onClick={() => setShowThermalReceipt(false)}
              className="absolute top-3 right-3 p-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Receipt Printable Container */}
            <div id="printable-receipt" className="space-y-3">
              <div className="text-center pb-3 border-b border-dashed border-gray-400">
                {receiptConfig.showLogo && displaySettings?.logoUrl && <img src={displaySettings.logoUrl} alt="Restaurant logo" className="mx-auto mb-2 h-12 max-w-32 object-contain" onError={e=>{e.currentTarget.style.display='none';}}/>}
                {receiptConfig.showRestaurantName!==false&&<h2 className="font-extrabold text-base">{restaurantInfo.restaurantName || 'Restaurant'}</h2>}
                {receiptConfig.receiptHeader && <p className="text-[10px] text-gray-600">{receiptConfig.receiptHeader}</p>}
                {receiptConfig.showAddress!==false && <p className="text-[10px] text-gray-600">{[restaurantInfo.addressLine1,restaurantInfo.addressLine2,restaurantInfo.city,restaurantInfo.state,restaurantInfo.postcode,restaurantInfo.country].filter(Boolean).join(', ')}</p>}
                {receiptConfig.showPhone!==false && restaurantInfo.phoneNumber && <p className="text-[10px] text-gray-600">Tel: {restaurantInfo.phoneNumber}</p>}
                {receiptConfig.showTaxNumber!==false && restaurantInfo.taxRegistrationNumber && <p className="text-[10px] text-gray-600">Tax No: {restaurantInfo.taxRegistrationNumber}</p>}
                <p className="text-[10px] text-gray-600">{receiptTimestamp}</p>
              </div>
              {(receiptConfig.showStaffName!==false||receiptConfig.showPaymentMethod!==false)&&<div className="space-y-1 text-[10px] text-gray-600">{receiptConfig.showStaffName!==false&&receiptStaffName&&<div className="flex justify-between"><span>Staff</span><strong>{receiptStaffName}</strong></div>}{receiptConfig.showPaymentMethod!==false&&receiptPaymentMethod&&<div className="flex justify-between"><span>Payment</span><strong>{receiptPaymentMethod}</strong></div>}</div>}

              <div className="flex justify-between font-bold text-sm">
                <span>{receiptConfig.showOrderNumber!==false?`ORDER: ${order?.orderNumber || orderData.orderId}`:''}</span>
                <span>{receiptConfig.showTableNumber!==false?`TABLE: ${resolvedTableLabel || '-'}`:''}</span>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 py-2 border-y border-dashed border-gray-400">
                {receiptItems.map((item) => (
                  <div key={item.id}>
                    <div className="flex justify-between font-bold">
                      <span>{item.quantity}x {item.name}</span>
                      <span>{formatMoney(item.subtotal)}</span>
                    </div>
                    {item.options.map((option) => (
                      <div key={option.id} className="text-[10px] text-gray-600 ml-3">
                        • {option.groupName}: {option.name}{option.priceAdjustment > 0 ? ` (+${formatMoney(option.priceAdjustment)})` : ''}
                      </div>
                    ))}
                    {receiptConfig.showItemNotes!==false && item.specialRequest && (
                      <div className="text-[10px] text-gray-600 ml-3 font-italic">* {item.specialRequest}</div>
                    )}
                  </div>
                ))}
                {!receiptItems.length && !isLoading && (
                  <div className="text-[10px] text-gray-500">{tr('noPersistedItems')}</div>
                )}
              </div>

              {/* Total Calculations */}
              <div className="space-y-1 text-right font-medium text-[11px]">
                <div className="flex justify-between">
                  <span>{tr('subtotal')}:</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                {receiptConfig.showTax!==false && <div className="flex justify-between">
                  <span>{order?.taxName || 'Tax'} ({order?.taxRate || 0}%):</span>
                  <span>{formatMoney(tax)}</span>
                </div>}
                {receiptConfig.showServiceCharge!==false && <div className="flex justify-between">
                  <span>{order?.serviceChargeName || tr('serviceCharge')} ({order?.serviceChargeRate || 0}%):</span>
                  <span>{formatMoney(serviceCharge)}</span>
                </div>}
                {receiptConfig.showDiscount!==false && discount > 0 && (
                  <div className="flex justify-between">
                    <span>{tr('discount')}:</span>
                    <span>-{formatMoney(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-gray-400 text-black">
                  <span>{tr('grandTotal')}:</span>
                  <span>{formatMoney(grandTotal)}</span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 text-center border-t border-dashed border-gray-400 space-y-1">
                <p className="text-[10px] text-gray-600 pt-1">{receiptConfig.thankYouMessage || tr('thankYou')}</p>
                {receiptConfig.receiptFooter && <p className="text-[10px] text-gray-600">{receiptConfig.receiptFooter}</p>}
                <p className="text-[10px] text-gray-600">{tr('paymentStatus', { status: translateStatus(lang, order?.paymentStatus || orderData.paymentStatus || 'UNPAID') })}</p>
              </div>
            </div>

            {/* Print Action Button */}
            <button
              onClick={handlePrint}
              className="w-full mt-4 py-3 bg-[#121212] text-[#D4AF37] font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow"
            >
              <Printer className="w-4 h-4" />
              <span>{tr('printThermal')}{receiptCopies>1?` × ${receiptCopies}`:''}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
