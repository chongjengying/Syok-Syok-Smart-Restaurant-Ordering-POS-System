import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Send, UtensilsCrossed } from 'lucide-react';
import { calculateCartPreviewTotals } from '../services/cart.service';
import { soundFx } from '../utils/audio';

const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;

export default function ReviewOrderScreen({
  cart,
  diningMode,
  selectedTable,
  isAddOn,
  isSending,
  submitError,
  takeawayPackaging = [],
  onTakeawayPackagingChange,
  onEdit,
  onConfirm,
}) {
  const previewTotals = calculateCartPreviewTotals(cart);
  const packagingOptions = [
    ['CUP_LID', 'Cup Lid'], ['PAPER_BAG', 'Paper Bag'], ['TAKEAWAY_BOX', 'Takeaway Box'],
    ['CUTLERY', 'Cutlery'], ['STRAW', 'Straw'], ['SAUCE', 'Sauce'], ['NAPKIN', 'Napkin'],
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F5F6F8] text-[#121212]">
      <header className="flex h-16 shrink-0 items-center justify-between bg-[#121212] px-6 text-white">
        <button onClick={onEdit} disabled={isSending} className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37] disabled:opacity-50">
          <ArrowLeft className="h-5 w-5" /> Edit Cart
        </button>
        <h1 className="font-black uppercase tracking-widest">Review Order</h1>
        <div className="w-20" />
      </header>

      <main className="flex flex-1 items-center justify-center overflow-y-auto p-5">
        <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between bg-[#121212] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4AF37] text-black"><UtensilsCrossed className="h-5 w-5" /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Order destination</p>
                <p className="font-black">{diningMode === 'dine-in' ? `Table ${selectedTable || '-'}` : 'Takeaway'}</p>
              </div>
            </div>
            {isAddOn && <span className="rounded-full bg-amber-400/15 px-3 py-1 text-[10px] font-black text-amber-300">ADD-ON ROUND</span>}
          </div>

          <div className="p-6">
            <div className="max-h-80 space-y-4 overflow-y-auto">
              {cart.map((item, index) => (
                <div key={`${item.dish.id}-${index}`} className="border-b border-gray-100 pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black">{item.dish.name} <span className="text-gray-500">×{item.quantity}</span></p>
                      {item.portion && <p className="text-xs text-gray-500">- {item.portion.name || item.portion.id}</p>}
                      {(item.selectedOptions || []).map((option) => <p key={option.id} className="text-xs text-gray-500">- {option.name}</p>)}
                      {item.specialRequest && <p className="text-xs font-semibold text-amber-700">- {item.specialRequest}</p>}
                    </div>
                    <strong>{money(item.finalPrice * item.quantity)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-gray-50 p-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{money(previewTotals.subtotal)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>{money(previewTotals.tax)}</span></div>
              <div className="flex justify-between"><span>Service charge</span><span>{money(previewTotals.serviceCharge)}</span></div>
              <div className="flex justify-between border-t border-gray-300 pt-3 text-xl font-black"><span>Total preview</span><span>{money(previewTotals.total)}</span></div>
            </div>

            {diningMode === 'takeaway' && (
              <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <h2 className="text-xs font-black uppercase tracking-wider text-sky-900">Takeaway Packaging</h2>
                <p className="mt-1 text-[10px] text-sky-700">Select what the kitchen must pack with this order.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {packagingOptions.map(([value, label]) => {
                    const selected = takeawayPackaging.includes(value);
                    return (
                      <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${selected ? 'border-sky-500 bg-white text-sky-900' : 'border-sky-100 text-sky-700'}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => onTakeawayPackagingChange?.(
                            selected
                              ? takeawayPackaging.filter((entry) => entry !== value)
                              : [...takeawayPackaging, value],
                          )}
                          className="accent-sky-700"
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            <p className="mt-3 text-center text-[10px] text-gray-500">Product availability and final prices are validated again by Supabase during submission.</p>
            {submitError && <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" /> {submitError}</div>}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button disabled={isSending} onClick={onEdit} className="rounded-xl border border-gray-300 bg-white px-4 py-4 font-black disabled:opacity-50">Edit</button>
              <button
                disabled={isSending || cart.length === 0}
                onClick={() => { soundFx.playTap(); void onConfirm(previewTotals.total); }}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-4 font-black text-black disabled:bg-gray-300"
              >
                {isSending ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing…</> : <><Send className="h-5 w-5" /> {diningMode === 'takeaway' ? 'Continue to Pay' : 'Send Order'}</>}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {diningMode === 'takeaway' ? 'Payment submits the order to the kitchen.' : 'Confirming sends these items to the kitchen.'}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
