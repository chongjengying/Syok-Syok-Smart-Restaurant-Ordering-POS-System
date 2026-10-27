import {
  Pencil,
  Trash2,
  ShoppingBag,
  ChefHat,
  X,
  ArrowRight,
} from "lucide-react";
import {
  money,
  totalCents,
  draftItems,
  sentItems,
} from "../services/previewMoney.js";
import { Badge, Button, IconButton, Quantity, EmptyState } from "./ui.jsx";
import DishArt from "./DishArt.jsx";

export function OrderLines({ items, pos, editable = false }) {
  return (
    <div className="pv-order-lines">
      {items.map((item) => {
        const dish = pos.data.products.find(
          (entry) => entry.id === item.productId,
        );
        return (
          <article className="pv-order-line" key={item.id}>
            <div className={`pv-line-art pv-art-${dish?.art}`}>
              <DishArt kind={dish?.art} />
            </div>
            <div className="pv-line-info">
              <div className="pv-line-name">
                <strong>{item.name}</strong>
                {editable && (
                  <IconButton
                    label={`Edit ${item.name}`}
                    onClick={() => pos.setCustomization({ dish, item })}
                  >
                    <Pencil size={14} />
                  </IconButton>
                )}
              </div>
              <p>
                {item.selectedOptions.map((option) => option.name).join(", ") ||
                  (item.serviceMode === "TAKEAWAY" ? "Takeaway" : "Dine-in")}
                {item.serviceMode === "TAKEAWAY" &&
                item.selectedOptions.length > 0
                  ? " · Takeaway"
                  : ""}
              </p>
              {item.specialRequest && (
                <p className="pv-item-note">“{item.specialRequest}”</p>
              )}
              <div className="pv-line-controls">
                {editable ? (
                  <Quantity
                    name={item.name}
                    value={item.quantity}
                    onChange={(next) =>
                      pos.run(() =>
                        pos.service.changeQuantity(
                          pos.orderId,
                          item.id,
                          next - item.quantity,
                        ),
                      )
                    }
                  />
                ) : (
                  <span className="pv-muted">Qty {item.quantity}</span>
                )}
                <strong>{money(item.unitPrice * item.quantity)}</strong>
              </div>
            </div>
            {editable && (
              <IconButton
                label={`Remove ${item.name}`}
                onClick={() =>
                  pos.run(() =>
                    pos.service.changeQuantity(
                      pos.orderId,
                      item.id,
                      -item.quantity,
                    ),
                  )
                }
              >
                <Trash2 size={15} />
              </IconButton>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function Totals({ items, order, compact = false }) {
  const total = totalCents(items) / 100;
  return (
    <div className={`pv-totals ${compact ? "pv-totals-compact" : ""}`}>
      <div>
        <span>Subtotal</span>
        <span>{money(total)}</span>
      </div>
      {!compact && (
        <>
          <div>
            <span>Tax</span>
            <span>{money(order?.tax || 0)}</span>
          </div>
          <div>
            <span>Service charge</span>
            <span>{money(order?.serviceCharge || 0)}</span>
          </div>
        </>
      )}
      <div className="pv-total">
        <strong>Total</strong>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
}

export default function OrderSummary({ pos }) {
  const drafts = draftItems(pos.order);
  const sent = sentItems(pos.order);
  const count = drafts.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <aside
      className={`pv-cart ${pos.cartOpen ? "pv-cart-open" : ""}`}
      aria-label="Order summary"
    >
      <header>
        <div>
          <p className="pv-eyebrow">CURRENT ORDER</p>
          <h2>
            {pos.tableLabel(pos.order)}{" "}
            <span className="pv-count">{count}</span>
          </h2>
        </div>
        <div className="pv-cart-header-actions">
          <Badge status="draft">{sent.length ? "Add-on" : "New order"}</Badge>
          <span className="pv-cart-close">
            <IconButton
              label="Close cart"
              onClick={() => pos.setCartOpen(false)}
            >
              <X size={20} />
            </IconButton>
          </span>
        </div>
      </header>
      <div className="pv-cart-body">
        {drafts.length > 0 ? (
          <>
            <div className="pv-section-heading">
              <span>New items</span>
              <button
                onClick={() =>
                  pos.run(() => pos.service.clearDraft(pos.orderId))
                }
                className="pv-text-button pv-danger"
              >
                Clear
              </button>
            </div>
            <OrderLines items={drafts} pos={pos} editable />
          </>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="Something delicious?"
            description="Select an item from the menu to start your order."
          />
        )}
        {sent.length > 0 && (
          <div className="pv-previous">
            <div className="pv-section-heading">
              <span>
                <ChefHat size={15} /> Previously sent
              </span>
              <span>
                {sent.reduce((sum, item) => sum + item.quantity, 0)} items
              </span>
            </div>
            {sent.map((item) => (
              <div className="pv-previous-item" key={item.id}>
                <span>
                  {item.quantity} × {item.name}
                </span>
                <span>{money(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <footer>
        <Totals items={pos.order?.items || []} order={pos.order} compact />
        <Button
          icon={ArrowRight}
          disabled={!drafts.length || pos.busy}
          onClick={() => pos.go("cart")}
        >
          Review cart{count > 0 ? ` · ${count} items` : ""}
        </Button>
        <p className="pv-cart-hint">Review your items before confirmation</p>
      </footer>
    </aside>
  );
}
