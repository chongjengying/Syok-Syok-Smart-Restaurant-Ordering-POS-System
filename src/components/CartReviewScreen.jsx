import React from 'react';
import { ArrowLeft, Trash2, Edit3, Plus, Minus, ChevronRight } from 'lucide-react';
import { translate, translations } from '../utils/i18n';

import { soundFx } from '../utils/audio';
import { calculateCartPreviewTotals, getCartItemCount, getCartItemPreviewTotal } from '../services/cart.service';
import { formatMoney } from '../services/money.service';

export default function CartReviewScreen({
  cart,
  orderHistory = [],
  onChangeQuantity,
  onRemoveItem,
  onClearCart,
  onBackToMenu,
  onOpenCustomization,
  onReviewOrder,
  submitError,
  diningMode,
  selectedTable,
  isAddOn,
  authoritativeBillTotal,
  lang
}) {
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);

  const previewTotals = calculateCartPreviewTotals(cart);

  const updateQuantity = (index, delta) => {
    soundFx.playTap();
    if (cart[index].quantity + delta <= 0) soundFx.playRemove();
    onChangeQuantity(index, delta);
  };

  const removeItem = (index) => {
    soundFx.playRemove();
    onRemoveItem(index);
  };

  const getDishName = (dish) => {
    if (lang === 'zh' && dish.nameZh) return dish.nameZh;
    if (lang === 'ms' && dish.nameMs) return dish.nameMs;
    return dish.name;
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8F9FA] text-[#121212] overflow-hidden">
      {/* Header Bar */}
      <div className="h-16 bg-[#121212] text-white px-6 flex items-center justify-between shadow-md shrink-0">
        <button
          onClick={() => {
            soundFx.playTap();
            onBackToMenu();
          }}
          className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37] transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t.backToMenu}</span>
        </button>

        <h1 className="font-extrabold text-lg tracking-wider text-white uppercase">
          {t.myOrder} ({getCartItemCount(cart)} {t.items})
        </h1>

        <div className="w-24" /> {/* Spacer */}
      </div>

      {/* Main Content Area: Split 2 Columns */}
      <div className="pos-cart-review-layout flex-1 flex overflow-hidden p-6 gap-6">
        {/* Left Column: ITEMS REVIEW */}
        <div className="pos-cart-review-items flex-1 bg-white rounded-xl p-6 border border-[#E9ECEF] card-elevation-low flex flex-col overflow-hidden">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
            <h2 className="font-extrabold text-base tracking-wide text-[#121212] uppercase">
              {t.itemsReview}
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  soundFx.playRemove();
                  onClearCart();
                }}
                className="text-xs text-red-600 hover:underline font-bold cursor-pointer"
              >
                {t.clearCart}
              </button>
            )}
          </div>

          {/* Items Scrollable List */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {orderHistory.length > 0 && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <div className="mb-3 flex items-center justify-between border-b border-amber-200 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-900">{tr('orderRounds')}</h3>
                    <p className="mt-0.5 text-[10px] text-amber-700">{tr('submittedReadOnly')}</p>
                  </div>
                  <span className="rounded-full bg-amber-200 px-2.5 py-1 text-[9px] font-black text-amber-900">
                    {tr('itemsUpper', { count: orderHistory.reduce((sum, item) => sum + item.quantity, 0) })}
                  </span>
                </div>
                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                  {orderHistory.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs shadow-sm">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-[#121212]">{item.quantity}× {item.name}</span>
                          <span className="rounded bg-[#D4AF37]/20 px-1.5 py-0.5 text-[8px] font-black text-[#80600D]">{item.batchNo > 1 ? `ADD-ON • ROUND ${item.batchNo}` : 'ROUND 1'}</span>
                          {item.serviceMode === 'TAKEAWAY' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[8px] font-black text-sky-800">{tr('takeawayBadge')}</span>}
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[8px] font-bold text-gray-600">{item.itemStatus}</span>
                        </div>
                        {item.options.map((option) => (
                          <p key={option.id} className="mt-0.5 text-[10px] text-gray-500">{option.groupName}: {option.name}</p>
                        ))}
                        {item.specialRequest && <p className="mt-0.5 text-[10px] font-semibold text-amber-700">{tr('notePrefix', { note: item.specialRequest })}</p>}
                        {item.sentAt && <p className="mt-0.5 text-[9px] text-gray-400">{tr('sentAt', { date: new Date(item.sentAt).toLocaleString() })}</p>}
                      </div>
                      <span className="shrink-0 font-extrabold text-[#121212]">{formatMoney(item.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {orderHistory.length > 0 && (
              <h3 className="pt-1 text-xs font-black uppercase tracking-wider text-gray-500">{tr('newItemsRound')}</h3>
            )}
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
                <p className="font-bold text-base text-gray-700">{t.emptyCart}</p>
                <p className="text-xs text-gray-400 mt-1 max-w-[240px]">
                  {t.emptyCartSub}
                </p>
                <button
                  onClick={onBackToMenu}
                  className="mt-4 px-5 py-2.5 bg-[#121212] text-[#D4AF37] font-bold text-xs rounded-xl shadow cursor-pointer"
                >
                  {t.backToMenu}
                </button>
              </div>
            ) : (
              cart.map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-[#F8F9FA] rounded-2xl border border-gray-200 flex items-center justify-between gap-4 hover:border-gray-300 transition-all"
                >
                  {/* Dish Thumbnail Image */}
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 shrink-0">
                    {item.dish.image ? (
                      <img
                        src={item.dish.image}
                        alt={item.dish.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#121212] text-[#D4AF37] flex items-center justify-center px-2 text-center text-[10px] font-bold">
                        {item.dish.name}
                      </div>
                    )}
                  </div>

                  {/* Dish Info & Modifiers */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-base text-[#121212]">
                      {getDishName(item.dish)}
                    </h3>
                    {item.serviceMode === 'TAKEAWAY' && <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-800">🥡 TAKEAWAY</span>}
                    <p className="text-sm font-bold text-[#B8952B] mt-0.5">
                      {formatMoney(item.finalPrice)} / unit
                    </p>

                    {/* Modifiers Detail Breakdown */}
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      {item.portion && (
                        <span className="inline-block bg-gray-200 text-gray-800 px-2 py-0.5 rounded font-medium text-[11px] mr-1">
                          {tr('portion')}: {item.portion.id.toUpperCase()}
                        </span>
                      )}
                      {item.selectedAddOns?.map((a) => (
                        <span key={a.id} className="text-gray-600 block">
                          - {a.name} (+{formatMoney(a.price)})
                        </span>
                      ))}
                      {item.specialRequest && (
                        <span className="text-amber-800 font-medium block italic">
                          - {tr('specialRequest')}: "{item.specialRequest}"
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action Stepper, Edit & Delete */}
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <span className="font-extrabold text-lg text-[#121212]">
                      {formatMoney(getCartItemPreviewTotal(item))}
                    </span>

                    <div className="flex items-center gap-3">
                      {/* Stepper */}
                      <div className="flex items-center bg-white rounded-xl border border-gray-300 p-1 shadow-sm">
                        <button
                          onClick={() => updateQuantity(index, -1)}
                          className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-black font-bold cursor-pointer transition-all"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center font-extrabold text-sm text-[#121212]">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(index, 1)}
                          className="w-8 h-8 rounded-lg bg-[#D4AF37] hover:bg-[#B8952B] flex items-center justify-center text-black font-bold cursor-pointer transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => {
                          soundFx.playTap();
                          onOpenCustomization(item.dish, item, index);
                        }}
                        className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all cursor-pointer"
                        title={t.edit}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => removeItem(index)}
                        className="p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-all cursor-pointer"
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar: ORDER SUMMARY */}
        <div className="pos-cart-review-summary w-[360px] md:w-[380px] bg-white rounded-xl p-6 border border-[#E9ECEF] card-elevation-low flex flex-col justify-between shrink-0">
          <div>
            <h2 className="font-extrabold text-base tracking-wide text-[#121212] uppercase pb-4 border-b border-gray-100 mb-6">
              {tr('previewOnly')} {t.orderSummary}
            </h2>

            {/* Calculations Breakdown */}
            <div className="space-y-4 text-sm font-medium text-gray-600">
              <div className="flex justify-between items-center">
                <span>{t.subtotal}</span>
                <span className="font-bold text-[#121212]">{formatMoney(previewTotals.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>{t.sst}</span>
                <span className="font-bold text-[#121212]">{formatMoney(previewTotals.tax)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>{t.serviceCharge}</span>
                <span className="font-bold text-[#121212]">{formatMoney(previewTotals.serviceCharge)}</span>
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                <span className="text-base font-extrabold text-[#121212] uppercase">
                  {t.total}
                </span>
                <span className="text-2xl font-black text-[#B8952B]">
                  {formatMoney(previewTotals.total)}
                </span>
              </div>
            </div>

            {/* Fine Dining Note Box */}
            <div className="mt-6 p-4 rounded-xl bg-[#F8F9FA] border border-gray-200 text-xs text-gray-500 leading-relaxed">
              <span className="font-bold text-gray-700 block mb-1">{tr('previewOnly')}</span>
              {diningMode === 'dine-in'
                ? `This ${isAddOn ? 'add-on' : 'order'} will be sent to Table ${selectedTable}. Final pricing is validated by the backend.`
                : 'This takeaway order will be sent to the kitchen. Final pricing is validated by the backend.'}
            </div>
            {authoritativeBillTotal !== null && authoritativeBillTotal !== undefined && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                <span className="font-bold text-amber-900">{tr('currentDatabaseBill')}</span>
                <span className="text-base font-black text-amber-900">{formatMoney(authoritativeBillTotal)}</span>
              </div>
            )}
          </div>

          {/* Primary Action Button (64pt height) */}
          {submitError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              {submitError}
            </div>
          )}
          <button
            disabled={cart.length === 0}
            onClick={() => {
              soundFx.playTap();
              onReviewOrder();
            }}
            className={`w-full h-[64px] rounded-[16px] font-bold text-lg tracking-wider flex items-center justify-center gap-3 transition-all duration-200 cursor-pointer ${
              cart.length > 0
                ? 'bg-[#D4AF37] hover:bg-[#B8952B] text-white btn-gold-shadow active:scale-95'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <span>{isAddOn ? tr('reviewAddOn') : tr('reviewOrder')}</span>
            <ChevronRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
}
