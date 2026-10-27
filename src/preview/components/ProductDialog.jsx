import { useState } from "react";
import { MessageSquare, ShoppingBag, Check } from "lucide-react";
import { Modal, Button, Quantity } from "./ui.jsx";
import DishArt from "./DishArt.jsx";
import { money } from "../services/previewMoney.js";

export default function ProductDialog({ pos, dish, item }) {
  const [quantity, setQuantity] = useState(item?.quantity || 1);
  const [specialRequest, setNote] = useState(item?.specialRequest || "");
  const [serviceMode, setServiceMode] = useState(
    item?.serviceMode ||
      (pos.order.diningMode === "takeaway" ? "TAKEAWAY" : "DINE_IN"),
  );
  const [optionIds, setOptions] = useState(() =>
    Object.fromEntries(
      dish.optionGroups.map((group) => [
        group.id,
        item
          ? item.selectedOptions
              .filter((option) => option.groupId === group.id)
              .map((option) => option.id)
          : group.options
              .slice(0, Math.max(group.minSelection, group.isRequired ? 1 : 0))
              .map((option) => option.id),
      ]),
    ),
  );
  const valid = dish.optionGroups.every(
    (group) =>
      (optionIds[group.id]?.length || 0) >=
        Math.max(group.minSelection, group.isRequired ? 1 : 0) &&
      (optionIds[group.id]?.length || 0) <= group.maxSelection,
  );
  const unitPrice =
    dish.price +
    dish.optionGroups
      .flatMap((group) =>
        group.options.filter((option) =>
          optionIds[group.id]?.includes(option.id),
        ),
      )
      .reduce((sum, option) => sum + option.priceAdjustment, 0);
  const toggle = (group, optionId) =>
    setOptions((current) => {
      const selected = current[group.id] || [];
      const next =
        group.selectionType === "SINGLE"
          ? [optionId]
          : selected.includes(optionId)
            ? selected.filter((id) => id !== optionId)
            : selected.length < group.maxSelection
              ? [...selected, optionId]
              : selected;
      return { ...current, [group.id]: next };
    });
  return (
    <Modal
      wide
      title={item ? `Edit ${dish.name}` : dish.name}
      onClose={() => pos.setCustomization(null)}
    >
      <div className="pv-customize">
        <div className={`pv-customize-art pv-art-${dish.art}`}>
          <DishArt kind={dish.art} />
          <p>{dish.description}</p>
          <strong>{money(dish.price)}</strong>
        </div>
        <div className="pv-customize-fields">
          {dish.optionGroups.map((group) => (
            <fieldset key={group.id}>
              <legend>
                {group.name}{" "}
                <span>
                  {group.isRequired ? "Required" : "Optional"} ·{" "}
                  {group.selectionType === "SINGLE"
                    ? "Choose 1"
                    : `Choose ${group.minSelection}–${group.maxSelection}`}
                </span>
              </legend>
              <div className="pv-option-list">
                {group.options.map((option) => (
                  <button
                    key={option.id}
                    aria-pressed={optionIds[group.id]?.includes(option.id)}
                    onClick={() => toggle(group, option.id)}
                  >
                    <span>
                      {option.name}
                      <small>
                        {option.priceAdjustment
                          ? `+ ${money(option.priceAdjustment)}`
                          : "Included"}
                      </small>
                    </span>
                    {optionIds[group.id]?.includes(option.id) && (
                      <Check size={18} />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <fieldset>
            <legend>Serve this item</legend>
            <div className="pv-segment">
              <button
                aria-pressed={serviceMode === "DINE_IN"}
                onClick={() => setServiceMode("DINE_IN")}
              >
                Dine-in
              </button>
              <button
                aria-pressed={serviceMode === "TAKEAWAY"}
                onClick={() => setServiceMode("TAKEAWAY")}
              >
                Takeaway
              </button>
            </div>
          </fieldset>
          <label className="pv-field">
            <span>
              <MessageSquare size={16} /> Special instructions{" "}
              <small>Optional</small>
            </span>
            <textarea
              rows={3}
              maxLength={1000}
              value={specialRequest}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. No onions, sauce on the side…"
            />
            <small>{specialRequest.length}/1,000 characters</small>
          </label>
          <div className="pv-customize-quantity">
            <span>Quantity</span>
            <Quantity
              name="product"
              min={1}
              value={quantity}
              onChange={setQuantity}
            />
          </div>
        </div>
      </div>
      {pos.error && (
        <p className="pv-inline-error" role="alert">
          {pos.error}
        </p>
      )}
      <footer className="pv-modal-footer">
        <span className="pv-modal-price">
          <small>Item total</small>
          <strong>{money(unitPrice * quantity)}</strong>
        </span>
        <Button
          disabled={!valid || pos.busy}
          icon={ShoppingBag}
          onClick={() =>
            pos.run(
              () =>
                pos.service.saveItem(
                  pos.orderId,
                  {
                    productId: dish.id,
                    quantity,
                    specialRequest,
                    serviceMode,
                    optionIds,
                  },
                  item?.id,
                ),
              () => {
                pos.setCustomization(null);
                pos.setNotice(
                  `${dish.name} ${item ? "updated" : "added to your order"}.`,
                );
              },
            )
          }
        >
          {item ? "Save changes" : "Add to order"}
        </Button>
      </footer>
    </Modal>
  );
}
