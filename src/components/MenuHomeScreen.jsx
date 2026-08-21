import React, { useEffect, useState } from 'react';
import { Search, ShoppingBag, ChefHat, ChevronRight, Plus, Edit3, LayoutDashboard } from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useProducts } from '../hooks/useProducts';
import { ProductEmptyState } from './products/ProductEmptyState';
import { ProductGridSkeleton } from './products/ProductGridSkeleton';
import { ProductLoadError } from './products/ProductLoadError';
import { translate, translations } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { calculateCartPreviewTotals, getCartItemCount, getCartItemPreviewTotal } from '../services/cart.service';
import { formatMoney } from '../services/money.service';

function ProductImage({ src, alt, fallbackLabel }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="flex h-full w-full items-center justify-center bg-[#121212] text-[#D4AF37]" aria-label={fallbackLabel}><ChefHat className="h-10 w-10" /></div>;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" loading="lazy" />;
}

export default function MenuHomeScreen({
  selectedCategory,
  setSelectedCategory,
  searchQuery,
  setSearchQuery,
  cart,
  orderHistory = [],
  operationError = '',
  onOpenCustomization,
  onCheckout,
  diningMode,
  selectedTable,
  lang,
  setLang,
  onChangeTable,
  onDashboard,
}) {
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);
  const {
    categories,
    isLoading: isLoadingCategories,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();
  const {
    products,
    isInitialLoading: isLoadingProducts,
    isFetching: isFetchingProducts,
    isBackgroundRefreshing,
    hasCachedData: hasCachedProducts,
    error: productsError,
    refetch: refetchProducts,
  } = useProducts({ categoryId: selectedCategory, search: searchQuery });

  useEffect(() => {
    if (selectedCategory && !isLoadingCategories && !categories.some(({ id }) => id === selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [categories, isLoadingCategories, selectedCategory, setSelectedCategory]);

  const selectedCategoryName = categories.find((category) => category.id === selectedCategory)?.name || tr('allProducts');

  const cartPreview = calculateCartPreviewTotals(cart);
  const totalItemCount = getCartItemCount(cart);
  const historyTotal = orderHistory.reduce((sum, item) => sum + item.subtotal, 0);

  const getDishName = (dish) => {
    if (lang === 'zh' && dish.nameZh) return dish.nameZh;
    if (lang === 'ms' && dish.nameMs) return dish.nameMs;
    return dish.name;
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#F8F9FA] text-[#121212] overflow-hidden">
      {/* 1. TOP BAR Header */}
      <div className="h-16 bg-[#121212] text-white px-6 flex items-center justify-between shadow-md shrink-0 z-30">
        {/* Left: Logo & Search Box */}
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => {
              soundFx.playTap();
              onDashboard();
            }}
            className="flex items-center gap-2.5 rounded-xl px-1 py-0.5 text-left hover:bg-white/10"
            title={tr('dashboard')}
          >
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37] text-black flex items-center justify-center font-bold shadow">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="font-extrabold text-sm tracking-wide text-white">AURA POS</div>
              <div className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-semibold">Fine Dining</div>
            </div>
          </button>

          {/* Search Food... Input */}
          <div className="relative w-64 md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full h-10 pl-10 pr-4 bg-white/10 text-white placeholder-gray-400 rounded-xl text-sm border border-white/15 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
            />
          </div>
        </div>

        {/* Right Header Badges: Table Info & Language Selector */}
        <div className="flex items-center gap-3">
          {/* Table / Dining Status Pill */}
          <button
            onClick={() => {
              soundFx.playTap();
              onChangeTable();
            }}
            className="h-10 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white border border-white/15 flex items-center gap-2 cursor-pointer transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{diningMode === 'dine-in' ? `${t.dineIn} - ${t.table} ${selectedTable}` : t.takeaway}</span>
            <span className="text-[10px] bg-[#D4AF37] text-black px-1.5 py-0.5 rounded font-bold ml-1">{tr('changeTable')}</span>
          </button>

          {/* Language Switcher Dropdown / Buttons */}
          <div className="flex items-center bg-white/10 p-1 rounded-xl border border-white/15">
            {['en', 'zh', 'ms'].map((code) => (
              <button
                key={code}
                onClick={() => {
                  soundFx.playTap();
                  setLang(code);
                }}
                className={`h-8 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  lang === code
                    ? 'bg-[#D4AF37] text-black shadow'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {operationError && (
        <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {operationError}
        </div>
      )}

      {/* Main Container Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* 2. LEFT NAVIGATION RAIL ($220pt width) */}
        <div className="w-[220px] bg-white border-r border-[#E9ECEF] flex flex-col py-4 shrink-0 shadow-sm overflow-y-auto">
          <div className="px-4 mb-2">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{tr('categories')}</span>
          </div>

          <div className="space-y-1.5 px-3">
            {categoriesError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p>Unable to load categories: {categoriesError}</p>
                <button
                  type="button"
                  onClick={() => refetchCategories()}
                  className="mt-2 font-bold underline"
                >
                  Retry
                </button>
              </div>
            )}
            {isLoadingCategories && (
              <div className="px-4 py-3 text-xs font-medium text-gray-400">{tr('loadingCategories')}</div>
            )}
            <button
              onClick={() => {
                soundFx.playTap();
                setSelectedCategory(null);
              }}
              className={`w-full h-[56px] px-4 rounded-xl font-semibold text-sm flex items-center justify-between transition-all cursor-pointer ${
                !selectedCategory
                  ? 'bg-[#121212] text-[#D4AF37] border-l-4 border-[#D4AF37] shadow-md'
                  : 'bg-transparent text-gray-700 hover:bg-[#F8F9FA] hover:text-black'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🍽️</span>
                <span className="truncate">{tr('allProducts')}</span>
              </div>
              {!selectedCategory && <ChevronRight className="w-4 h-4 text-[#D4AF37]" />}
            </button>
            {categories.map((cat) => {
              const isActive = selectedCategory === cat.id;
              const catName = cat.name;

              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    soundFx.playTap();
                    setSelectedCategory(cat.id);
                  }}
                  className={`w-full h-[56px] px-4 rounded-xl font-semibold text-sm flex items-center justify-between transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#121212] text-[#D4AF37] border-l-4 border-[#D4AF37] shadow-md'
                      : 'bg-transparent text-gray-700 hover:bg-[#F8F9FA] hover:text-black'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🏷️</span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate">{catName}</span>
                      {cat.code && <span className="block text-[9px] font-bold opacity-60">{cat.code}</span>}
                    </span>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-[#D4AF37]" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. MAIN CONTENT AREA (Scrollable Grid / Cards) */}
        <div className="flex-1 p-6 overflow-y-auto bg-[#F8F9FA]">
          {/* Section Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-[#121212] tracking-tight">
                {selectedCategoryName}
              </h2>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                {isLoadingProducts
                  ? tr('loadingProducts')
                : `${products.length} products${isBackgroundRefreshing ? ' · Refreshing…' : ''}`}
              </p>
            </div>
          </div>

          {/* Product Grid ($260 x 320pt cards) */}
          {productsError && hasCachedProducts && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Product refresh failed. Cached products remain available.{' '}
              <button type="button" onClick={() => refetchProducts()} className="font-bold underline">
                Retry
              </button>
            </div>
          )}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-8"
            aria-busy={isLoadingProducts}
          >
            {isLoadingProducts && <ProductGridSkeleton />}
            {!isLoadingProducts && productsError && !hasCachedProducts && (
              <ProductLoadError
                message="Unable to load products"
                onRetry={refetchProducts}
                isRetrying={isFetchingProducts}
              />
            )}
            {!isLoadingProducts && hasCachedProducts && products.length === 0 && (
              <ProductEmptyState
                message={selectedCategory
                  ? tr('noProductsCategory')
                  : tr('noProducts')}
                onRefresh={refetchProducts}
              />
            )}
            {!isLoadingProducts && products.map((dish) => (
              <div
                key={dish.id}
                className="w-full h-[330px] bg-white rounded-2xl p-4 border border-[#E9ECEF] card-elevation-low hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group"
              >
                {/* 1:1 Aspect Ratio Food Image with 16pt rounded corners */}
                <div className="relative w-full h-[160px] rounded-xl overflow-hidden bg-gray-100 mb-3">
                  <ProductImage src={dish.imageUrl} alt={dish.name} fallbackLabel={tr('productImageUnavailable')} />
                  {!dish.isAvailable && <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/80 px-3 py-2 text-center text-xs font-black uppercase tracking-wider text-white">{tr('soldOut')}</span>}
                </div>

                {/* Middle: Item Name, Price */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-[#121212] line-clamp-1 group-hover:text-[#B8952B] transition-colors">
                      {getDishName(dish)}
                    </h3>
                    {dish.code && <p className="text-[9px] font-bold tracking-wide text-gray-400">{dish.code}</p>}
                    <p className="text-xs text-gray-500 line-clamp-2 mt-1 leading-snug">
                      {dish.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                    <div>
                      <span className="text-xs text-gray-400 block font-medium">{dish.unit || tr('price')}</span>
                      <span className="text-lg font-extrabold text-[#121212]">
                        {formatMoney(dish.price)}
                      </span>
                      {!dish.isAvailable && <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-black uppercase text-red-700">{tr('soldOut')}</span>}
                    </div>
                  </div>
                </div>

                {/* Bottom: Full-width + Add to Order Button (48pt height) */}
                <button
                  disabled={!dish.isActive || !dish.isAvailable}
                  onClick={() => {
                    soundFx.playTap();
                    onOpenCustomization(dish);
                  }}
                  className="w-full h-[48px] rounded-xl bg-[#121212] hover:bg-[#252525] text-white font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow active:scale-95 mt-3 border border-black/10 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>{dish.isAvailable ? t.add : tr('soldOut')}</span>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 4. PERSISTENT CART DRAWER (Right Side Bar) */}
        <div className="w-[340px] md:w-[360px] bg-white border-l border-[#E9ECEF] flex flex-col shrink-0 shadow-lg z-20">
          {/* Cart Header */}
          <div className="p-5 bg-[#121212] text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="font-bold text-base tracking-wide">{orderHistory.length > 0 ? tr('newAddOnRound') : t.myOrder}</h2>
            </div>
            <span className="bg-[#D4AF37] text-black font-extrabold text-xs px-2.5 py-1 rounded-full">
              {totalItemCount} {t.items}
            </span>
          </div>

          {orderHistory.length > 0 && (
            <section className="max-h-[42%] shrink-0 overflow-y-auto border-b border-amber-200 bg-amber-50/70 p-4">
              <div className="sticky top-0 z-10 mb-3 flex items-center justify-between bg-amber-50/95 pb-2">
                <div>
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-amber-900">{tr('orderRounds')}</h3>
                  <p className="text-[9px] text-amber-700">{tr('readOnlyRounds')}</p>
                </div>
                <span className="rounded-full bg-amber-200 px-2 py-1 text-[9px] font-black text-amber-900">
                  {formatMoney(historyTotal)}
                </span>
              </div>
              <div className="space-y-2">
                {orderHistory.map((item) => (
                  <div key={item.id} className="rounded-xl border border-amber-100 bg-white p-2.5 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-extrabold text-[#121212]">{item.quantity}× {item.name}</span>
                          <span className="rounded bg-[#D4AF37]/20 px-1 py-0.5 text-[7px] font-black text-[#80600D]">{item.batchNo > 1 ? tr('addOnRound', { number: item.batchNo }) : tr('round', { number: 1 })}</span>
                          {item.serviceMode === 'TAKEAWAY' && <span className="rounded bg-sky-100 px-1 py-0.5 text-[7px] font-black text-sky-800">🥡 TAKEAWAY</span>}
                        </div>
                        <span className="mt-0.5 block text-[8px] font-bold text-gray-400">{item.itemStatus}</span>
                        {item.specialRequest && <p className="mt-0.5 text-[9px] font-semibold text-amber-700">Note: {item.specialRequest}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-black text-[#121212]">{formatMoney(item.subtotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Cart Items List */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 divide-y divide-gray-100">
            {orderHistory.length > 0 && (
              <div className="pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">{tr('newItemsRound')}</div>
            )}
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-3 text-gray-300 border border-gray-100">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <p className="font-bold text-sm text-gray-700">{t.emptyCart}</p>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                  {t.emptyCartSub}
                </p>
              </div>
            ) : (
              cart.map((item, index) => (
                <div key={index} className="pt-3 first:pt-0 flex flex-col gap-1.5 group">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-[#121212] leading-tight">
                        {getDishName(item.dish)}
                      </h4>
                      {/* Portion & Add-ons Tag Pills */}
                      <div className="text-[11px] text-gray-500 mt-0.5 space-y-0.5">
                        {item.portion && <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 mr-1 font-medium">{item.portion.id.toUpperCase()}</span>}
                        {item.selectedAddOns?.map(a => (
                          <span key={a.id} className="text-gray-500 block">• +{a.name} ({formatMoney(a.price)})</span>
                        ))}
                        {item.specialRequest && (
                          <span className="text-amber-700 block italic font-medium">"{item.specialRequest}"</span>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-sm text-[#121212]">
                      {formatMoney(getCartItemPreviewTotal(item))}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-gray-400 font-medium">Qty: {item.quantity}</span>
                    <button
                      onClick={() => {
                        soundFx.playTap();
                        onOpenCustomization(item.dish, item, index);
                      }}
                      className="text-xs text-[#B8952B] font-bold hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>{t.edit}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Subtotal & Checkout Trigger Sticky Bottom Bar */}
          <div className="p-5 bg-white border-t border-[#E9ECEF] shadow-inner space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-gray-600 font-medium">
                <span>Preview {t.subtotal.toLowerCase()}</span>
                <span className="font-bold text-[#121212]">{formatMoney(cartPreview.subtotal)}</span>
              </div>
              <p className="text-[11px] text-gray-400">
                Taxes (6% SST) & Service Charge (10%) calculated at checkout.
              </p>
            </div>

            {/* Primary Action Button Checkout (64pt height) */}
            <button
              disabled={cart.length === 0}
              onClick={() => {
                soundFx.playTap();
                onCheckout();
              }}
              className={`w-full h-[64px] rounded-[16px] font-bold text-base tracking-wide flex items-center justify-between px-6 transition-all duration-200 cursor-pointer ${
                cart.length > 0
                  ? 'bg-[#D4AF37] hover:bg-[#B8952B] text-white btn-gold-shadow active:scale-95'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <span>{t.checkout}</span>
              <div className="flex items-center gap-2">
                <span className="text-lg">{formatMoney(cartPreview.subtotal)}</span>
                <ChevronRight className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
