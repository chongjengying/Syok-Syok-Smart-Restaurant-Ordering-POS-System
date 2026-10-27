import React, { useId, useState } from 'react';
import AccessibleDialog from './admin/AccessibleDialog';
import { X, Plus, Minus, Check, MessageSquare } from 'lucide-react';
import { translate, translations } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { CART_NOTE_MAX_LENGTH, CART_QUANTITY_MAX, normalizeCartNote } from '../services/cart.service';
import { formatMoney } from '../services/money.service';

export default function CustomizationModal({
  dish,
  existingCartItem,
  cartItemIndex,
  onSave,
  onClose,
  diningMode,
  lang
}) {
  const noteId = useId();
  const t = translations[lang] || translations.en;
  const tr = (key, variables) => translate(lang, key, variables);

  const [selections, setSelections] = useState(() => {
    const initial = {};
    for (const group of dish.optionGroups || []) {
      const existing = (existingCartItem?.selectedOptions || []).filter((option) => option.groupId === group.id);
      const minimum = Math.max(group.minSelection || 0, group.isRequired ? 1 : 0);
      initial[group.id] = existing.length ? existing : group.options.slice(0, minimum);
    }
    return initial;
  });
  const [specialRequest, setSpecialRequest] = useState(
    existingCartItem?.specialRequest || ''
  );
  const [quantity, setQuantity] = useState(existingCartItem?.quantity || 1);
  const [serviceMode, setServiceMode] = useState(
    existingCartItem?.serviceMode || (diningMode === 'takeaway' ? 'TAKEAWAY' : 'DINE_IN')
  );

  const basePrice = dish.price;
  const selectedOptions = (dish.optionGroups || []).flatMap((group) =>
    (selections[group.id] || []).map((option) => ({
      ...option,
      groupId: group.id,
      groupName: group.name,
      selectionType: group.selectionType,
    }))
  );
  const optionsTotal = selectedOptions.reduce((sum, option) => sum + option.priceAdjustment, 0);
  const unitPrice = basePrice + optionsTotal;
  const totalPrice = unitPrice * quantity;
  const hasValidSelections = (dish.optionGroups || []).every((group) => {
    const count = (selections[group.id] || []).length;
    const minimum = Math.max(group.minSelection || 0, group.isRequired ? 1 : 0);
    return count >= minimum && count <= group.maxSelection;
  });

  const toggleOption = (group, option) => {
    soundFx.playTap();
    setSelections((current) => {
      const selected = current[group.id] || [];
      if (group.selectionType === 'SINGLE') return { ...current, [group.id]: [option] };
      const exists = selected.some((item) => item.id === option.id);
      if (exists && selected.length > (group.minSelection || 0)) {
        return { ...current, [group.id]: selected.filter((item) => item.id !== option.id) };
      }
      if (!exists && selected.length < group.maxSelection) {
        return { ...current, [group.id]: [...selected, option] };
      }
      return current;
    });
  };

  const addPresetChip = (chipText) => {
    soundFx.playTap();
    if (!specialRequest.includes(chipText)) {
      setSpecialRequest((prev) => (prev ? `${prev}, ${chipText}` : chipText));
    }
  };

  const handleSaveItem = () => {
    soundFx.playAddToCart();
    const singleOption = selectedOptions.find((option) => option.selectionType === 'SINGLE');
    const multipleOptions = selectedOptions.filter((option) => option.selectionType === 'MULTIPLE');
    onSave({
      // Keep the resolved catalog image on the cart item. Cart and review
      // screens intentionally render from item.dish.image.
      dish: { ...dish, image: dish.image || dish.imageUrl || null },
      selectedOptions,
      portion: singleOption ? { ...singleOption, priceDelta: singleOption.priceAdjustment } : null,
      selectedAddOns: multipleOptions.map((option) => ({ ...option, price: option.priceAdjustment })),
      specialRequest: normalizeCartNote(specialRequest),
      quantity,
      serviceMode,
      finalPrice: unitPrice
    }, cartItemIndex);
  };

  const getDishName = (d) => {
    if (lang === 'zh' && d.nameZh) return d.nameZh;
    if (lang === 'ms' && d.nameMs) return d.nameMs;
    return d.name;
  };

  return (
    <AccessibleDialog title={`${tr('customization')}: ${getDishName(dish)}`} onClose={onClose} dismissOnBackdrop={false} className="max-w-4xl" panelClassName="rounded-2xl bg-white p-0 shadow-2xl overflow-hidden">
      {/* Central Modal Container ($800 x 600pt reference) */}
      <div className="w-full h-[min(720px,calc(100dvh-2rem))] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col modal-elevation-high border border-white/20">
        {/* Modal Header */}
        <div className="min-h-16 px-4 sm:px-6 bg-[#121212] text-white flex items-center justify-between shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <span className="hidden sm:inline text-xs bg-[#D4AF37] text-black font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
              {tr('customization')}
            </span>
            <h2 className="font-extrabold text-lg text-white truncate max-w-md">
              {getDishName(dish)}
            </h2>
          </div>
          <button
            aria-label="Close customization"
            onClick={() => {
              soundFx.playTap();
              onClose();
            }}
            className="w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Content Area */}
        <div className="min-h-0 flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {/* Left Column: Dish Image & Description */}
          <div className="w-full md:w-64 bg-[#F8F9FA] p-4 md:p-6 border-b md:border-r border-[#E9ECEF] flex flex-col justify-between shrink-0">
            <div>
              <div className="hidden md:block w-full h-[180px] rounded-2xl overflow-hidden shadow-md mb-4 bg-gray-200 border border-gray-200">
                {dish.image ? (
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#121212] text-[#D4AF37] flex items-center justify-center font-bold text-sm">
                    {dish.name}
                  </div>
                )}
              </div>
              <h3 className="font-extrabold text-xl text-[#121212] leading-tight">
                {getDishName(dish)}
              </h3>
              <p className="text-sm font-bold text-[#80600d] mt-1">
                {tr('basePrice')}: {formatMoney(dish.price)}
              </p>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                {dish.description}
              </p>
            </div>

            <div className="hidden md:block bg-white p-3 rounded-xl border border-gray-200 text-xs text-gray-600">
              <span className="font-bold text-gray-800 block mb-0.5">{tr('chefNote')}</span>
              {tr('chefNoteText')}
            </div>
          </div>

          {/* Right Column: Customization Options */}
          <div className="min-w-0 flex-1 p-4 md:p-6 md:overflow-y-auto space-y-6 bg-white">
            {diningMode === 'dine-in' && (
              <div>
                <label className="text-xs font-extrabold text-gray-600 uppercase tracking-wider block mb-3">{tr('itemService')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {['DINE_IN', 'TAKEAWAY'].map((mode) => (
                    <button key={mode} type="button" aria-pressed={serviceMode === mode} onClick={() => setServiceMode(mode)}
                      className={`h-12 rounded-xl border-2 text-sm font-bold ${serviceMode === mode ? 'bg-[#121212] text-white border-[#D4AF37]' : 'bg-gray-100 border-transparent'}`}>
                      {mode === 'TAKEAWAY' ? tr('packTakeaway') : tr('serveDineIn')}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(dish.optionGroups || []).map((group) => (
              <div key={group.id}>
                <label className="text-xs font-extrabold text-gray-600 uppercase tracking-wider block mb-3">
                  {group.name} {group.isRequired ? `• ${tr('required')}` : ''}
                  {group.selectionType === 'MULTIPLE' ? ` • ${tr('chooseRange', { min: group.minSelection, max: group.maxSelection })}` : ''}
                </label>
                <div className={group.selectionType === 'SINGLE' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2'}>
                  {group.options.map((option) => {
                    const isSelected = (selections[group.id] || []).some((item) => item.id === option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => toggleOption(group, option)}
                        className={`w-full min-h-[48px] gap-2 px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between transition-all cursor-pointer border-2 ${
                          isSelected
                            ? 'bg-[#121212] text-white border-[#D4AF37] shadow-md'
                            : 'bg-[#F1F3F5] text-[#121212] border-transparent hover:bg-gray-200'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div className={`w-5 h-5 shrink-0 ${group.selectionType === 'SINGLE' ? 'rounded-full' : 'rounded-md'} flex items-center justify-center border ${
                            isSelected ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'border-gray-400 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <span className="break-words text-left">{option.name}</span>
                        </div>
                        <span className={`shrink-0 text-xs ${isSelected ? 'text-[#D4AF37] font-bold' : 'text-gray-600'}`}>
                          {option.priceAdjustment > 0 ? `+${formatMoney(option.priceAdjustment)}` : tr('included')}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(selections[group.id] || []).length < Math.max(group.minSelection || 0, group.isRequired ? 1 : 0) && (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    {tr('selectMinimum', { count: Math.max(group.minSelection || 0, group.isRequired ? 1 : 0) })}
                  </p>
                )}
              </div>
            ))}

            {/* 3. Special Request Text Box & Preset Chips */}
            <div>
              <label htmlFor={noteId} className="text-xs font-extrabold text-gray-600 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{t.specialRequest}</span>
              </label>

              {/* Preset Chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {[t.lessOil, t.noOnions, t.sauceOnSide, t.extraSpicy].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => addPresetChip(chip)}
                    className="min-h-11 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-all border border-gray-200"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              <textarea
                id={noteId}
                value={specialRequest}
                onChange={(e) => setSpecialRequest(e.target.value)}
                placeholder={t.specialPlaceholder}
                rows={2}
                maxLength={CART_NOTE_MAX_LENGTH}
                className="w-full p-3 rounded-xl bg-[#F8F9FA] border border-gray-300 text-sm text-[#121212] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]"
              />
              <p className="mt-1 text-right text-[10px] text-gray-400">
                {specialRequest.length}/{CART_NOTE_MAX_LENGTH}
              </p>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar with Stepper & Dynamic CTA (64pt height) */}
        <div className="bg-[#121212] text-white p-3 sm:px-6 flex flex-wrap gap-3 items-center justify-between shrink-0 border-t border-white/10">
          {/* Large Quantity Stepper */}
          <div className="flex items-center bg-white/10 rounded-2xl p-1.5 border border-white/15">
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => {
                if (quantity > 1) {
                  soundFx.playTap();
                  setQuantity(quantity - 1);
                }
              }}
              className="w-12 h-12 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-all cursor-pointer"
            >
              <Minus className="w-5 h-5" />
            </button>
            <span className="w-12 text-center font-extrabold text-xl text-white">
              {quantity}
            </span>
            <button aria-label="Increase quantity"
              onClick={() => {
                soundFx.playTap();
                setQuantity(Math.min(CART_QUANTITY_MAX, quantity + 1));
              }}
              disabled={quantity >= CART_QUANTITY_MAX}
              className="w-12 h-12 rounded-xl bg-[#D4AF37] hover:bg-[#B8952B] text-black flex items-center justify-center font-bold text-lg transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Dynamic CTA Button (64pt height) */}
          <button
            onClick={handleSaveItem}
            disabled={!hasValidSelections}
            className="min-h-14 flex-1 sm:flex-none px-4 rounded-xl bg-[#D4AF37] disabled:bg-gray-300 disabled:cursor-not-allowed text-[#121212] font-bold text-base flex items-center justify-between gap-3 cursor-pointer"
          >
            <span>{existingCartItem ? t.editItemBtn : t.addToCartBtn}</span>
            <span className="px-2 py-1 rounded-lg text-[#121212] font-extrabold text-lg whitespace-nowrap">
              {formatMoney(totalPrice)}
            </span>
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
}
