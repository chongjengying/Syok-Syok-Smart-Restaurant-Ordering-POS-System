import React from 'react';
import { ArrowLeft, UtensilsCrossed, ShoppingBag, CheckCircle2, User, ChevronRight, Clock3, ReceiptText } from 'lucide-react';
import { translate, translations, translateStatus } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { formatMoney } from '../services/money.service';

export default function TableSelectionScreen({
  diningMode,
  setDiningMode,
  selectedTable,
  setSelectedTable,
  tables,
  tablesLoading,
  tablesError,
  onBack,
  onContinue,
  onRefreshTables,
  contextError,
  grandTotal,
  takeawayOrders = [],
  takeawayOrdersLoading,
  takeawayOrdersError,
  onOpenTakeawayOrder,
  onCheckOrderStatus,
  lang
}) {
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);
  const selectedTableRecord = tables.find((table) => table.id === selectedTable) || null;
  const selectedProgressOrders = selectedTableRecord?.orders || (selectedTableRecord?.activeOrder
    ? [selectedTableRecord.activeOrder]
    : []);

  const handleSelectTable = (table) => {
    const canOpen = table.status === 'AVAILABLE' || table.status === 'OCCUPIED';
    if (!canOpen) {
      soundFx.playRemove();
      return;
    }
    soundFx.playTap();
    setSelectedTable(table.id);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8F9FA] text-[#121212] overflow-hidden">
      {/* Header Bar */}
      <div className="h-16 bg-[#121212] text-white px-6 flex items-center justify-between shadow-md shrink-0">
        <button
          onClick={() => {
            soundFx.playTap();
            onBack();
          }}
          className="flex items-center gap-2 text-sm font-bold text-gray-300 hover:text-[#D4AF37] transition-all cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{tr('dashboard')}</span>
        </button>

        <h1 className="font-extrabold text-lg tracking-wider text-white uppercase">
          {tr('selectOrderTable')}
        </h1>

        <div className="text-right text-xs">
          <span className="text-gray-400 block">{t.total}</span>
          <span className="font-bold text-[#D4AF37] text-base">{formatMoney(grandTotal)}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full flex flex-col justify-between">
        <div className="space-y-6">
          {/* 1. Dining Option Cards Toggle (Dine In vs Takeaway) */}
          <div className="grid grid-cols-2 gap-6">
            {/* Dine In Card */}
            <button
              onClick={() => {
                soundFx.playTap();
                setDiningMode('dine-in');
              }}
              className={`h-[104px] rounded-2xl p-5 flex items-center justify-between transition-all cursor-pointer border-2 shadow-sm ${
                diningMode === 'dine-in'
                  ? 'bg-[#121212] text-white border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-[1.01]'
                  : 'bg-white text-[#121212] border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                  diningMode === 'dine-in' ? 'bg-[#D4AF37] text-black' : 'bg-gray-100 text-gray-700'
                }`}>
                  <UtensilsCrossed className="w-8 h-8" />
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-xl">{t.dineIn}</h3>
                  <p className={`text-xs mt-1 ${diningMode === 'dine-in' ? 'text-gray-300' : 'text-gray-500'}`}>
                    {tr('diningInHelp')}
                  </p>
                </div>
              </div>
              {diningMode === 'dine-in' && <CheckCircle2 className="w-7 h-7 text-[#D4AF37]" />}
            </button>

            {/* Takeaway Card */}
            <button
              onClick={() => {
                soundFx.playTap();
                setDiningMode('takeaway');
              }}
              className={`h-[104px] rounded-2xl p-5 flex items-center justify-between transition-all cursor-pointer border-2 shadow-sm ${
                diningMode === 'takeaway'
                  ? 'bg-[#121212] text-white border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-[1.01]'
                  : 'bg-white text-[#121212] border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-5">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                  diningMode === 'takeaway' ? 'bg-[#D4AF37] text-black' : 'bg-gray-100 text-gray-700'
                }`}>
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div className="text-left">
                  <h3 className="font-extrabold text-xl">{t.takeaway}</h3>
                  <p className={`text-xs mt-1 ${diningMode === 'takeaway' ? 'text-gray-300' : 'text-gray-500'}`}>
                    {tr('takeawayHelp')}
                  </p>
                </div>
              </div>
              {diningMode === 'takeaway' && <CheckCircle2 className="w-7 h-7 text-[#D4AF37]" />}
            </button>
          </div>

          {/* 2. Choose Your Table Grid (Enabled if Dine In) */}
          {diningMode === 'dine-in' ? (
            <div className="bg-white rounded-2xl p-6 border border-[#E9ECEF] card-elevation-low space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h2 className="font-extrabold text-base text-[#121212] tracking-wide uppercase">
                  {t.chooseTable}
                </h2>

                {/* Status Legend Badges */}
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    {t.vacant}
                  </span>
                  <span className="flex items-center gap-1.5 text-[#B8952B]">
                    <span className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                    {t.selected}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <span className="w-3 h-3 rounded-full bg-gray-300" />
                    {t.occupied}
                  </span>
                </div>
              </div>

              {/* Table Buttons Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 pt-2">
                {tablesLoading && (
                  <div className="col-span-full py-8 text-center text-sm text-gray-500">
                    {tr('loadingTablesExtended')}
                  </div>
                )}
                {!tablesLoading && tablesError && (
                  <div className="col-span-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {tr('unableToLoadTables', { error: tablesError })}
                  </div>
                )}
                {!tablesLoading && !tablesError && tables.length === 0 && (
                  <div className="col-span-full py-8 text-center text-sm text-gray-500">
                    {tr('noRestaurantTables')}
                  </div>
                )}
                {tables.map((table) => {
                  const isSelected = selectedTable === table.id;
                  const isAvailable = table.status === 'AVAILABLE';
                  const isOccupied = table.status === 'OCCUPIED';
                  const canOpen = isAvailable || isOccupied;
                  const isPaidActiveOrder = table.activeOrder?.paymentStatus === 'PAID';

                  let statusClasses = 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100';
                  if (isSelected) {
                    statusClasses = 'bg-[#121212] text-white border-[#D4AF37] shadow-lg ring-2 ring-[#D4AF37]/50';
                  } else if (isOccupied && table.activeOrder) {
                    statusClasses = isPaidActiveOrder
                      ? 'bg-sky-50 text-sky-900 border-sky-300 hover:bg-sky-100'
                      : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100';
                  } else if (!canOpen) {
                    statusClasses = 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60';
                  }

                  return (
                    <button
                      key={table.id}
                      disabled={!canOpen}
                      onClick={() => handleSelectTable(table)}
                      className={`min-h-[118px] rounded-2xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer relative group px-2 py-3 ${statusClasses}`}
                    >
                      {isSelected && (
                        <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-[#D4AF37]" />
                      )}
                      <span className="font-extrabold text-lg">{table.tableNumber}</span>

                      <div className="flex items-center gap-1 text-[10px] font-bold mt-1">
                        <User className="w-3 h-3" />
                        <span>{table.capacity}p</span>
                      </div>

                      {isOccupied && table.activeOrder ? (
                        <div className={`mt-1.5 w-full rounded-lg px-2 py-1 text-center ${
                          isSelected ? 'bg-white/10' : isPaidActiveOrder ? 'bg-sky-100' : 'bg-amber-100'
                        }`}>
                          <p className={`truncate text-[9px] font-black uppercase ${
                            isSelected ? 'text-[#D4AF37]' : isPaidActiveOrder ? 'text-sky-800' : 'text-amber-800'
                          }`}>
                            {table.activeOrder.orderNumber}
                          </p>
                          <p className={`text-[10px] font-extrabold ${
                            isSelected ? 'text-white' : isPaidActiveOrder ? 'text-sky-900' : 'text-amber-900'
                          }`}>
                            {formatMoney(table.activeOrder.total)} {isPaidActiveOrder ? tr('paidStatusLine', { status: translateStatus(lang, table.activeOrder.status).toLowerCase() }) : tr('unpaid').toLowerCase()}
                          </p>
                        </div>
                      ) : (
                        <span className={`mt-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                          isSelected
                            ? 'bg-[#D4AF37] text-black'
                            : isAvailable
                              ? 'bg-emerald-200 text-emerald-800'
                              : isOccupied
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-gray-200 text-gray-600'
                        }`}>
                          {isSelected ? t.selected : isAvailable ? t.vacant : table.status === 'OCCUPIED' ? tr('paidNewBill') : translateStatus(lang, table.status)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-[#E9ECEF] bg-white p-5 shadow-sm">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#B8952B]">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-extrabold text-[#121212]">{tr('startTakeaway')}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {tr('takeawayStartHelp')}
                  </p>
                </div>
              </div>

              <section className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between border-b border-sky-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                      <ReceiptText className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-wider text-sky-950">{tr('temporaryTakeaway')}</h2>
                      <p className="text-[10px] text-sky-700">{tr('temporaryTakeawayHelp')}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black text-sky-800">
                    {tr('openCount', { count: takeawayOrders.length })}
                  </span>
                </div>

                {takeawayOrdersLoading ? (
                  <p className="py-6 text-center text-xs text-sky-700">{tr('loadingTakeaway')}</p>
                ) : takeawayOrdersError ? (
                  <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{takeawayOrdersError}</p>
                ) : takeawayOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-sky-200 bg-white/70 px-4 py-6 text-center">
                    <ShoppingBag className="mx-auto mb-2 h-6 w-6 text-sky-300" />
                    <p className="text-xs font-bold text-sky-900">{tr('noTakeaway')}</p>
                    <p className="mt-1 text-[10px] text-sky-600">{tr('noTakeawayHelp')}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                    {takeawayOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => onOpenTakeawayOrder?.(order)}
                        className="rounded-2xl border-2 border-sky-200 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-500 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black uppercase tracking-wider text-sky-600">{tr('takeawayTable')}</span>
                            <p className="mt-0.5 truncate text-sm font-black text-[#121212]">{order.orderNumber}</p>
                          </div>
                          <ReceiptText className="h-5 w-5 shrink-0 text-sky-600" />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
                          <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> {translateStatus(lang, order.status)}</span>
                          <span>{tr('itemCount', { count: order.items.reduce((sum, item) => sum + item.quantity, 0) })}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-sky-100 pt-2">
                          <span className="text-[9px] font-black text-amber-700">{tr('unpaid')}</span>
                          <span className="text-sm font-black text-sky-900">{formatMoney(order.total)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Primary Action Button (64pt height) */}
        <div className="pt-6">
          {contextError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <p>{contextError}</p>
              <button type="button" onClick={() => void onRefreshTables?.()} className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-black text-red-700 hover:bg-red-50">
                Refresh tables and try again
              </button>
            </div>
          )}
          {diningMode === 'dine-in' && selectedProgressOrders.map((progressOrder) => (
            <button
              key={progressOrder.id}
              type="button"
              onClick={() => {
                soundFx.playTap();
                onCheckOrderStatus(selectedTableRecord, progressOrder);
              }}
              className="mb-3 flex h-[58px] w-full items-center justify-between rounded-2xl border-2 border-[#D4AF37] bg-[#121212] px-5 text-left text-white shadow-lg transition-all hover:bg-[#252525] active:scale-[0.99]"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D4AF37] text-black">
                  <Clock3 className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[10px] font-black uppercase tracking-wider text-[#D4AF37]">{tr('orderInProgress')} · {translateStatus(lang, progressOrder.paymentStatus)}</span>
                  <span className="block text-sm font-bold">{tr('checkFoodStatus', { number: progressOrder.orderNumber })}</span>
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-[#D4AF37]" />
            </button>
          ))}
          <button
            disabled={diningMode === 'dine-in' && !selectedTable}
            onClick={() => {
              soundFx.playTap();
              onContinue();
            }}
            className="w-full h-[64px] rounded-[16px] bg-[#D4AF37] hover:bg-[#B8952B] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg tracking-wider flex items-center justify-center gap-3 btn-gold-shadow active:scale-95 transition-all cursor-pointer"
          >
            <span>
              {diningMode === 'takeaway'
                ? tr('startTakeawayOrder')
                : selectedTableRecord?.activeOrder
                  ? selectedTableRecord.activeOrder.paymentStatus === 'PAID'
                    ? tr('startNewBill')
                    : tr('openTableOrder')
                  : selectedTableRecord?.status === 'OCCUPIED'
                    ? tr('startNewBill')
                    : tr('startTableOrder')}
            </span>
            <ChevronRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>
    </div>
  );
}
