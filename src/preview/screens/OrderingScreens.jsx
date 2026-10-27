import { useState } from "react";
import {
  ArrowRight,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  Coffee,
  Grid2X2,
  Sandwich,
  Drumstick,
  CookingPot,
  ChefHat,
  ReceiptText,
  Check,
  Send,
  ArrowLeft,
  Clock3,
} from "lucide-react";
import {
  Button,
  PageTitle,
  Badge,
  SearchField,
  EmptyState,
  CheckField,
} from "../components/ui.jsx";
import DishArt from "../components/DishArt.jsx";
import OrderSummary, {
  OrderLines,
  Totals,
} from "../components/OrderSummary.jsx";
import {
  money,
  draftItems,
  sentItems,
  totalCents,
  remainingCents,
} from "../services/previewMoney.js";
import { packagingOptions } from "../data/mockMenu.js";

export function WelcomeScreen({ pos }) {
  const active = pos.data.orders.filter(
    (order) => !["COMPLETED", "CANCELLED"].includes(order.status),
  );
  const available = pos.data.tables.filter(
    (table) => table.status === "AVAILABLE",
  ).length;
  const ready = pos.data.orders.filter((order) =>
    order.batches.some((batch) => batch.status === "READY"),
  ).length;
  return (
    <div className="pv-page pv-dashboard">
      <PageTitle
        eyebrow="YOUR RESTAURANT, IN SYNC"
        title="Let’s make it a great service."
        description="A little less waiting. A lot more happy tables."
      />
      <section className="pv-welcome-hero">
        <div>
          <span className="pv-hero-label">
            <span /> FRONT OF HOUSE
          </span>
          <h2>
            Good food.
            <br />
            Great flow.
          </h2>
          <p>
            From the first order to the final bill.
            <br />
            Everything you need for a smooth service.
          </p>
          <Button icon={Plus} onClick={pos.startOrder} disabled={pos.busy}>
            Start new order
          </Button>
        </div>
        <div className="pv-hero-illustration">
          <div className="pv-orbit pv-orbit-one" />
          <div className="pv-orbit pv-orbit-two" />
          <DishArt kind="rice" />
          <div className="pv-hero-float">
            <span>
              <Check size={18} />
            </span>
            <div>
              <strong>Made for a smooth service</strong>
              <small>Order · Prepare · Serve</small>
            </div>
          </div>
        </div>
      </section>
      <div className="pv-stats">
        <button onClick={() => pos.go("tables")}>
          <span className="pv-stat-icon pv-teal">
            <UtensilsCrossed size={23} />
          </span>
          <div>
            <span>Available tables</span>
            <strong>
              {available}
              <small> / {pos.data.tables.length}</small>
            </strong>
          </div>
          <ArrowRight size={19} />
        </button>
        <button onClick={() => pos.go("orders")}>
          <span className="pv-stat-icon pv-orange">
            <ReceiptText size={23} />
          </span>
          <div>
            <span>Orders in progress</span>
            <strong>{active.length.toString().padStart(2, "0")}</strong>
          </div>
          <ArrowRight size={19} />
        </button>
        <button onClick={() => pos.go("serve")}>
          <span className="pv-stat-icon pv-blue">
            <CookingPot size={23} />
          </span>
          <div>
            <span>Ready to serve</span>
            <strong>{ready.toString().padStart(2, "0")}</strong>
          </div>
          <ArrowRight size={19} />
        </button>
      </div>
      <section className="pv-panel">
        <div className="pv-panel-heading">
          <div>
            <p className="pv-eyebrow">KEEP THINGS MOVING</p>
            <h2>On the floor</h2>
          </div>
          <button className="pv-text-button" onClick={() => pos.go("orders")}>
            View all orders <ArrowRight size={16} />
          </button>
        </div>
        <div className="pv-floor-list">
          {active.length === 0 ? (
            <EmptyState
              icon={ReceiptText}
              title="A fresh start"
              description="Your next order starts here."
            />
          ) : (
            active.slice(0, 4).map((order) => (
              <div key={order.id}>
                <span className="pv-floor-table">
                  <UtensilsCrossed size={19} />
                </span>
                <div>
                  <strong>{pos.tableLabel(order)}</strong>
                  <small>
                    {order.orderNumber} ·{" "}
                    {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                    items
                  </small>
                </div>
                <Badge status={order.status} />
                <strong>{money(totalCents(order.items) / 100)}</strong>
              </div>
            ))
          )}
        </div>
      </section>
      <p className="pv-demo-note">
        <span /> Design preview · All orders and payments use local mock data.
      </p>
    </div>
  );
}

const categoryIcons = {
  all: Grid2X2,
  mains: Drumstick,
  burgers: Sandwich,
  sides: CookingPot,
  drinks: Coffee,
};
export function MenuScreen({ pos }) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const products = pos.data.products.filter(
    (product) =>
      product.isActive &&
      (category === "all" || category === product.categoryId) &&
      `${product.name} ${product.description}`
        .toLowerCase()
        .includes(search.toLowerCase().trim()),
  );
  const count = draftItems(pos.order).reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  return (
    <div className="pv-menu-layout">
      <section className="pv-menu-main">
        <PageTitle
          eyebrow="SOMETHING FOR EVERY APPETITE"
          title="What’s on the menu?"
          description="Fresh picks. Familiar favourites. Made to order."
          action={<SearchField value={search} onChange={setSearch} />}
        />
        <div className="pv-order-context">
          <div>
            <span className="pv-context-icon">
              {pos.order.diningMode === "takeaway" ? (
                <ShoppingBag size={18} />
              ) : (
                <UtensilsCrossed size={18} />
              )}
            </span>
            <strong>{pos.tableLabel(pos.order)}</strong>
            <span className="pv-context-divider" />
            <span>{pos.order.orderNumber}</span>
            <Badge
              status={pos.order.status === "DRAFT" ? "draft" : "confirmed"}
            >
              {pos.order.status === "DRAFT" ? "New order" : "Adding items"}
            </Badge>
          </div>
          {pos.order.status === "DRAFT" &&
            pos.order.paymentStatus === "UNPAID" && (
              <button className="pv-text-button" onClick={pos.startOrder}>
                Change {pos.order.diningMode === "takeaway" ? "mode" : "table"}
              </button>
            )}
        </div>
        <div className="pv-categories" aria-label="Menu categories">
          {pos.data.categories.map((entry) => {
            const Icon = categoryIcons[entry.icon];
            return (
              <button
                aria-pressed={category === entry.id}
                key={entry.id}
                onClick={() => setCategory(entry.id)}
              >
                <Icon size={19} />
                <span>{entry.name}</span>
                <small>
                  {entry.id === "all"
                    ? pos.data.products.length
                    : pos.data.products.filter(
                        (product) => product.categoryId === entry.id,
                      ).length}
                </small>
              </button>
            );
          })}
        </div>
        <div className="pv-menu-section">
          <h2>
            {pos.data.categories.find((entry) => entry.id === category)?.name}
            <span>{products.length} items</span>
          </h2>
          <span className="pv-menu-local">Made for the moment</span>
        </div>
        {products.length ? (
          <div className="pv-product-grid">
            {products.map((dish) => {
              const inCart = draftItems(pos.order)
                .filter((item) => item.productId === dish.id)
                .reduce((sum, item) => sum + item.quantity, 0);
              return (
                <button
                  key={dish.id}
                  className="pv-product-card"
                  disabled={!dish.isAvailable || pos.busy}
                  onClick={() => {
                    pos.setError("");
                    pos.setCustomization({ dish });
                  }}
                  aria-label={`Customize ${dish.name}`}
                >
                  <div className={`pv-product-art pv-art-${dish.art}`}>
                    <DishArt kind={dish.art} />
                    {inCart > 0 && (
                      <span className="pv-product-count">
                        {inCart} in order
                      </span>
                    )}
                  </div>
                  <div className="pv-product-info">
                    <small>
                      {
                        pos.data.categories.find(
                          (entry) => entry.id === dish.categoryId,
                        )?.name
                      }
                    </small>
                    <h3>{dish.name}</h3>
                    <p>{dish.description}</p>
                    <div>
                      <strong>{money(dish.price)}</strong>
                      <span className="pv-add-product">
                        <Plus size={20} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No dishes found"
            description="Try another search or category."
          >
            <Button
              variant="secondary"
              onClick={() => {
                setSearch("");
                setCategory("all");
              }}
            >
              Show all items
            </Button>
          </EmptyState>
        )}
        <div className="pv-menu-footnote">
          <span /> Local sample menu <i /> All prices in Malaysian Ringgit
        </div>
      </section>
      <OrderSummary pos={pos} />
      <button
        className="pv-cart-toggle"
        onClick={() => pos.setCartOpen(!pos.cartOpen)}
      >
        <ShoppingBag size={20} />
        <strong>View order</strong>
        <span>{count} items</span>
        <strong>{money(totalCents(pos.order.items) / 100)}</strong>
        <ArrowRight size={18} />
      </button>
      {pos.cartOpen && (
        <button
          className="pv-cart-backdrop"
          aria-label="Dismiss cart"
          onClick={() => pos.setCartOpen(false)}
        />
      )}
    </div>
  );
}

export function CartScreen({ pos, finalReview = false }) {
  const drafts = draftItems(pos.order),
    sent = sentItems(pos.order);
  const count = drafts.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow={finalReview ? "ONE LAST LOOK" : "YOUR ORDER"}
        title={
          finalReview ? "Ready when you are." : "A good order starts here."
        }
        description={
          finalReview
            ? "Check the destination, items and instructions before confirming."
            : "Everything just the way your guests like it."
        }
        onBack={() => pos.go(finalReview ? "cart" : "menu")}
      />
      <div className="pv-review-layout">
        <section className="pv-panel">
          <div className="pv-panel-heading">
            <div>
              <h2>
                {finalReview ? "Confirm your items" : "New items"}{" "}
                <span className="pv-count">{count}</span>
              </h2>
              <p className="pv-muted">
                {pos.tableLabel(pos.order)} · {pos.order.orderNumber}
              </p>
            </div>
            {!finalReview && drafts.length > 0 && (
              <button
                className="pv-text-button pv-danger"
                onClick={() =>
                  pos.run(() => pos.service.clearDraft(pos.orderId))
                }
              >
                Clear new items
              </button>
            )}
          </div>
          {drafts.length ? (
            <OrderLines items={drafts} pos={pos} editable={!finalReview} />
          ) : (
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Add something from the menu to continue."
            >
              <Button onClick={() => pos.go("menu")}>Browse menu</Button>
            </EmptyState>
          )}
          {sent.length > 0 && (
            <div className="pv-sent-section">
              <h3>
                <ChefHat size={17} /> Already sent to kitchen
              </h3>
              <p>These items stay on the bill. Only new items will be sent.</p>
              <OrderLines items={sent} pos={pos} />
            </div>
          )}
          {pos.order.diningMode === "takeaway" && finalReview && (
            <div className="pv-packaging">
              <h3>Takeaway packaging</h3>
              <p>Let the team know what to include.</p>
              <div>
                {packagingOptions.map(([code, text]) => (
                  <CheckField
                    key={code}
                    checked={pos.order.takeawayPackaging.includes(code)}
                    onChange={(checked) =>
                      pos.run(() =>
                        pos.service.setPackaging(
                          pos.orderId,
                          checked
                            ? [...pos.order.takeawayPackaging, code]
                            : pos.order.takeawayPackaging.filter(
                                (value) => value !== code,
                              ),
                        ),
                      )
                    }
                  >
                    {text}
                  </CheckField>
                ))}
              </div>
            </div>
          )}
        </section>
        <aside className="pv-panel pv-review-summary">
          <span className="pv-summary-icon">
            <ReceiptText size={24} />
          </span>
          <h2>Order summary</h2>
          <p className="pv-muted">{pos.tableLabel(pos.order)}</p>
          <Totals items={pos.order.items} order={pos.order} />
          {!finalReview && <VoucherForm pos={pos} />}
          <div className="pv-info-box">
            {pos.order.diningMode === "takeaway"
              ? "Takeaway orders go to payment first. The kitchen receives the order after full payment."
              : sent.length
                ? "Only your new items will be sent as the next kitchen batch."
                : "Your order will be sent to the kitchen after confirmation."}
          </div>
          <Button
            icon={
              finalReview
                ? pos.order.diningMode === "takeaway"
                  ? ArrowRight
                  : Send
                : ArrowRight
            }
            disabled={!drafts.length || pos.busy}
            onClick={() =>
              finalReview
                ? pos.order.diningMode === "takeaway"
                  ? pos.beginPayment()
                  : pos.run(
                      () => pos.service.submitOrder(pos.orderId),
                      () => pos.go("status"),
                    )
                : pos.go("review")
            }
          >
            {finalReview
              ? pos.order.diningMode === "takeaway"
                ? "Continue to payment"
                : "Confirm & send to kitchen"
              : "Review order"}
          </Button>
          {!finalReview && (
            <Button
              variant="secondary"
              icon={Plus}
              onClick={() => pos.go("menu")}
            >
              Add more items
            </Button>
          )}
          <p className="pv-fine-print">
            Mock totals · Tax and service charge use the existing frontend
            estimate.
          </p>
        </aside>
      </div>
    </div>
  );
}

export function VoucherForm({ pos }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      className="pv-voucher"
      onSubmit={(event) => {
        event.preventDefault();
        try {
          pos.service.applyVoucher(pos.orderId, code);
        } catch (failure) {
          setMessage(failure.message);
        }
      }}
    >
      <label htmlFor="pv-voucher">Promotion / voucher</label>
      <div>
        <input
          id="pv-voucher"
          placeholder="Enter code"
          maxLength={60}
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
        <button disabled={!code.trim()}>Apply</button>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function DetailScreen({ pos, statusView = false }) {
  const order = pos.order;
  const draft = draftItems(order).length > 0;
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow={statusView ? "ORDER SENT" : "ORDER DETAILS"}
        title={
          statusView ? "The kitchen has your order." : pos.tableLabel(order)
        }
        description={`${order.orderNumber} · ${order.diningMode === "takeaway" ? "Takeaway" : "Dine-in"}`}
        onBack={() => pos.go("orders")}
        action={<Badge status={order.paymentStatus} />}
      />
      {statusView && (
        <div className="pv-success-banner">
          <span>
            <Check size={22} />
          </span>
          <div>
            <strong>All set. Let’s get cooking.</strong>
            <p>Your new items are in a separate kitchen batch.</p>
          </div>
          <Badge status={order.status} />
        </div>
      )}
      <div className="pv-review-layout">
        <section className="pv-panel">
          <div className="pv-panel-heading">
            <h2>Order rounds</h2>
            <Badge status={order.status} />
          </div>
          {order.batches.map((batch) => (
            <div className="pv-order-round" key={batch.id}>
              <div className="pv-section-heading">
                <strong>
                  <ChefHat size={17} /> Round {batch.batchNo}
                  {batch.batchNo > 1 ? " · Add-on" : ""}
                </strong>
                <Badge status={batch.status} />
              </div>
              <OrderLines
                items={order.items.filter((item) => item.batchId === batch.id)}
                pos={pos}
              />
            </div>
          ))}
          {draft && (
            <div className="pv-order-round">
              <div className="pv-section-heading">
                <strong>Unsent draft items</strong>
                <Badge status="draft" />
              </div>
              <OrderLines items={draftItems(order)} pos={pos} />
            </div>
          )}
          {order.takeawayPackaging.length > 0 &&
            order.diningMode === "takeaway" && (
              <p className="pv-muted">
                Packaging:{" "}
                {packagingOptions
                  .filter(([code]) => order.takeawayPackaging.includes(code))
                  .map(([, text]) => text)
                  .join(", ")}
              </p>
            )}
        </section>
        <aside className="pv-panel pv-review-summary">
          <h2>Bill summary</h2>
          <Totals items={order.items} order={order} />
          <div className="pv-balance">
            <span>Outstanding</span>
            <strong>{money(remainingCents(order) / 100)}</strong>
          </div>
          {draft && order.diningMode === "dine-in" && (
            <div className="pv-info-box">
              Review and send draft items before taking payment.
            </div>
          )}
          {order.paymentStatus === "UNPAID" &&
            !["CANCELLED", "COMPLETED"].includes(order.status) && (
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => pos.go("menu")}
              >
                {draft ? "Resume draft" : "Add items"}
              </Button>
            )}
          {order.paymentStatus !== "PAID" && order.items.length > 0 && (
            <>
              <Button
                disabled={draft && order.diningMode === "dine-in"}
                onClick={() => pos.beginPayment()}
                icon={ReceiptText}
              >
                View bill & pay
              </Button>
              {order.status !== "DRAFT" && (
                <Button
                  variant="secondary"
                  disabled={draft}
                  onClick={() => pos.beginPayment(true)}
                >
                  Split bill / pay remaining
                </Button>
              )}
            </>
          )}
          {order.paymentStatus === "PAID" && (
            <Button
              variant="success"
              onClick={() => pos.go("receipt")}
              icon={ReceiptText}
            >
              View receipt
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => pos.go("orders")}
            icon={ArrowLeft}
          >
            Back to orders
          </Button>
          {order.batches.some((batch) =>
            ["PENDING", "PREPARING", "READY"].includes(batch.status),
          ) && (
            <p className="pv-fine-print">
              <Clock3 size={14} /> Kitchen work is still active.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
