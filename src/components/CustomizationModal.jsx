import React, { useState } from 'react';
import { X, Plus, Minus, Check, MessageSquare } from 'lucide-react';
import { translations } from '../utils/i18n';
import { soundFx } from '../utils/audio';
import { CART_NOTE_MAX_LENGTH, CART_QUANTITY_MAX, normalizeCartNote } from '../services/cart.service';

export default function CustomizationModal({
  dish,
  existingCartItem,
  cartItemIndex,
  onSave,
  onClose,
  diningMode,
  lang
}) {
  const t = translations[lang] || translations.en;

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
      dish,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
      {/* Central Modal Container ($800 x 600pt reference) */}
      <div className="w-[800px] h-[600px] bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col modal-elevation-high border border-white/20">
        {/* Modal Header */}
        <div className="h-16 px-6 bg-[#121212] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs bg-[#D4AF37] text-black font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider">
              Customization
            </span>
            <h2 className="font-extrabold text-lg text-white truncate max-w-md">
              {getDishName(dish)}
            </h2>
          </div>
          <button
            onClick={() => {
              soundFx.playTap();
              onClose();
            }}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Dish Image & Description */}
          <div className="w-[320px] bg-[#F8F9FA] p-6 border-r border-[#E9ECEF] flex flex-col justify-between shrink-0">
            <div>
              <div className="w-full h-[200px] rounded-2xl overflow-hidden shadow-md mb-4 bg-gray-200 border border-gray-200">
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
              <p className="text-sm font-bold text-[#B8952B] mt-1">
                Base Price: ${dish.price.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                {dish.description}
              </p>
            </div>

            <div className="bg-white p-3 rounded-xl border border-gray-200 text-xs text-gray-600">
              <span className="font-bold text-gray-800 block mb-0.5">Chef's Note</span>
              All meals are prepared fresh to order using finest organic ingredients.
            </div>
          </div>

          {/* Right Column: Customization Options */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-white">
            {diningMode === 'dine-in' && (
              <div>
                <label className="text-xs font-extrabold text-gray-400 uppercase tracking-wider block mb-3">Item service</label>
                <div className="grid grid-cols-2 gap-3">
                  {['DINE_IN', 'TAKEAWAY'].map((mode) => (
                    <button key={mode} type="button" onClick={() => setServiceMode(mode)}
                      className={`h-12 rounded-xl border-2 text-sm font-bold ${serviceMode === mode ? 'bg-[#121212] text-white border-[#D4AF37]' : 'bg-gray-100 border-transparent'}`}>
                      {mode === 'TAKEAWAY' ? '🥡 Pack as Takeaway' : 'Serve Dine-In'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(dish.optionGroups || []).map((group) => (
              <div key={group.id}>
                <label className="text-xs font-extrabold text-gray-400 uppercase tracking-wider block mb-3">
                  {group.name} {group.isRequired ? '• Required' : ''}
                  {group.selectionType === 'MULTIPLE' ? ` • Choose ${group.minSelection}-${group.maxSelection}` : ''}
                </label>
                <div className={group.selectionType === 'SINGLE' ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
                  {group.options.map((option) => {
                    const isSelected = (selections[group.id] || []).some((item) => item.id === option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleOption(group, option)}
                        className={`w-full h-[48px] px-4 rounded-xl text-sm font-semibold flex items-center justify-between transition-all cursor-pointer border-2 ${
                          isSelected
                            ? 'bg-[#121212] text-white border-[#D4AF37] shadow-md'
                            : 'bg-[#F1F3F5] text-[#121212] border-transparent hover:bg-gray-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 ${group.selectionType === 'SINGLE' ? 'rounded-full' : 'rounded-md'} flex items-center justify-center border ${
                            isSelected ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'border-gray-400 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <span>{option.name}</span>
                        </div>
                        <span className={isSelected ? 'text-[#D4AF37] font-bold' : 'text-gray-600'}>
                          {option.priceAdjustment > 0 ? `+$${option.priceAdjustment.toFixed(2)}` : 'Included'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {(selections[group.id] || []).length < Math.max(group.minSelection || 0, group.isRequired ? 1 : 0) && (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    Select at least {Math.max(group.minSelection || 0, group.isRequired ? 1 : 0)} option before adding this item.
                  </p>
                )}
              </div>
            ))}

            {/* 3. Special Request Text Box & Preset Chips */}
            <div>
              <label className="text-xs font-extrabold text-gray-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
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
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-all border border-gray-200"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              <textarea
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
        <div className="h-[84px] bg-[#121212] text-white px-6 flex items-center justify-between shrink-0 border-t border-white/10">
          {/* Large Quantity Stepper */}
          <div className="flex items-center bg-white/10 rounded-2xl p-1.5 border border-white/15">
            <button
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
            <button
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
            className="h-[64px] px-8 rounded-[16px] bg-gradient-to-r from-[#D4AF37] to-[#B8952B] disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed text-white font-bold text-lg tracking-wider flex items-center gap-4 btn-gold-shadow hover:enabled:scale-[1.02] active:enabled:scale-95 transition-all cursor-pointer"
          >
            <span>{existingCartItem ? t.editItemBtn : t.addToCartBtn}</span>
            <span className="bg-black/20 px-3 py-1 rounded-lg text-white font-extrabold text-xl">
              ${totalPrice.toFixed(2)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
