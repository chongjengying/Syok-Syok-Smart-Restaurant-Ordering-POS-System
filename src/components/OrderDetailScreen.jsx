import React from 'react';
import { AlertTriangle, ArrowLeft, Clock, CreditCard, Loader2, Plus, ReceiptText, UtensilsCrossed } from 'lucide-react';
import { useOrder } from '../hooks/useOrder';
import { groupOrderRounds } from '../services/order-rounds.service';
import { translate, translateStatus } from '../utils/i18n';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;

export default function OrderDetailScreen({ orderId, canPay, onBack, onAddItems, onPayment, onSplitBill, lang = 'en' }) {
  const tr = (key, variables) => translate(lang, key, variables);
  const { order, isLoading, error } = useOrder(orderId, Boolean(orderId));
  const hasUnsentItems = order?.items.some((item) => item.itemStatus === 'DRAFT') || false;
  const paymentReady = Boolean(
    order
    && ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'].includes(order.status)
    && ['UNPAID', 'PARTIALLY_PAID'].includes(order.paymentStatus)
    && !hasUnsentItems,
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37]">
          <ArrowLeft className="h-5 w-5" /> {tr('order')}
        </button>
        <div className="flex items-center gap-2 font-black uppercase tracking-wider">
          <ReceiptText className="h-5 w-5 text-[#D4AF37]" /> {tr('order')} #{orderId?.slice(0, 6)}
        </div>
        <div className="w-20" />
      </header>

      <main className="flex-1 overflow-y-auto p-4 sm:p-7">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="flex min-h-96 items-center justify-center gap-3 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" /> {tr('loadingOrderDetails')}
            </div>
          ) : error || !order ? (
            <div className="m-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle className="h-5 w-5 shrink-0" /> {error || tr('orderNotFound')}
            </div>
          ) : (
            <>
              <section className="flex flex-wrap items-start justify-between gap-4 bg-[#121212] p-6 text-white">
                <div>
                  <p className="flex items-center gap-2 text-sm font-bold text-[#D4AF37]">
                    <UtensilsCrossed className="h-4 w-4" />
                    {order.diningMode === 'dine-in' ? tr('tableNumber', { number: order.table?.tableNumber || '-' }) : tr('takeaway')}
                  </p>
                  <h1 className="mt-1 text-3xl font-black tracking-tight">{order.orderNumber}</h1>
                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="h-3.5 w-3.5" /> {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black text-[#D4AF37]">{translateStatus(lang, order.status)}</span>
                  <p className="mt-3 text-xs font-bold text-amber-300">{translateStatus(lang, order.paymentStatus)}</p>
                </div>
              </section>

              <section className="p-6">
                <h2 className="mb-3 text-xs font-black uppercase tracking-wider text-gray-500">{tr('orderRounds')}</h2>
                <div className="space-y-4">
                  {groupOrderRounds(order.items).map((round) => (
                    <section key={round.roundNo} className="rounded-2xl border border-gray-200 p-4">
                      <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-[10px] font-black text-amber-800">{round.isAddOn ? tr('addOnRound', { number: round.roundNo }) : tr('round', { number: round.roundNo })}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] font-black text-gray-600">{translateStatus(lang, round.status)}</span>
                      </div>
                      <div className="space-y-3">
                        {round.items.map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-bold">{item.name} <span className="text-gray-500">×{item.quantity}</span></p>
                              {item.options.map((option) => <p key={option.id} className="text-xs text-gray-500">{option.groupName}: {option.name}</p>)}
                              {item.specialRequest && <p className="text-xs font-semibold text-amber-700">Note: {item.specialRequest}</p>}
                            </div>
                            <span className="shrink-0 font-black">{money(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">{tr('subtotal')}</span><span>{money(order.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{tr('discount')}</span><span>- {money(order.discount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{tr('tax')}</span><span>{money(order.tax)}</span></div>
                  {order.serviceCharge > 0 && (
                    <div className="flex justify-between"><span className="text-gray-500">{tr('serviceCharge')}</span><span>{money(order.serviceCharge)}</span></div>
                  )}
                  <div className="flex justify-between border-t-2 border-[#121212] pt-3 text-xl font-black">
                    <span>{tr('total')}</span><span>{money(order.total)}</span>
                  </div>
                </div>
              </section>

              <footer className="border-t border-gray-200 bg-gray-50 p-5">
                {!paymentReady && ['UNPAID', 'PARTIALLY_PAID'].includes(order.paymentStatus) && (
                  <p className="mb-3 text-center text-xs font-semibold text-amber-700">
                    {hasUnsentItems
                      ? tr('unsentPayment')
                      : `Payment is unavailable for the current state: ${order.status} / ${order.paymentStatus}.`}
                  </p>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  {order.paymentStatus === 'UNPAID' && (
                    <button onClick={onAddItems} className="flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-bold">
                      <Plus className="h-4 w-4" /> + {tr('addItems')}
                    </button>
                  )}
                  {canPay && (
                    <>{order.paymentStatus === 'UNPAID' && <button disabled={!paymentReady} onClick={onPayment} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"><CreditCard className="h-5 w-5" /> {tr('viewBillPay')}</button>}<button disabled={!paymentReady} onClick={onSplitBill} className="rounded-xl border-2 border-[#D4AF37] px-6 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40">{order.paymentStatus === 'PARTIALLY_PAID' ? tr('payRemaining') : tr('splitBill')}</button></>
                  )}
                </div>
              </footer>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
