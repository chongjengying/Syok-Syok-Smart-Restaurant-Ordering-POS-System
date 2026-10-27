import { useState } from "react";
import {
  Plus,
  ArrowRight,
  ChefHat,
  Clock3,
  Check,
  BellRing,
  ReceiptText,
  ShoppingBag,
  Banknote,
} from "lucide-react";
import {
  PageTitle,
  Button,
  Badge,
  SearchField,
  EmptyState,
} from "../components/ui.jsx";
import { label } from "../services/previewFormat.js";
import { expectedCash } from "../services/mockShiftService.js";
import { money, totalCents, remainingCents } from "../services/previewMoney.js";
import { packagingOptions } from "../data/mockMenu.js";

export function OrdersScreen({ pos }) {
  const [tab, setTab] = useState("unpaid");
  const [search, setSearch] = useState("");
  const orders = pos.data.orders.filter(
    (order) =>
      order.status !== "CANCELLED" &&
      (tab === "unpaid"
        ? order.paymentStatus !== "PAID"
        : order.paymentStatus === "PAID") &&
      `${order.orderNumber} ${pos.tableLabel(order)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow="EVERY ORDER, TAKEN CARE OF"
        title="Keep the good things coming."
        description="Open a bill, add to an order, or see what’s been settled."
        action={
          <Button icon={Plus} onClick={pos.startOrder}>
            New order
          </Button>
        }
      />
      <div className="pv-list-toolbar">
        <div className="pv-tabs">
          <button
            aria-pressed={tab === "unpaid"}
            onClick={() => setTab("unpaid")}
          >
            Unpaid orders{" "}
            <span>
              {
                pos.data.orders.filter(
                  (order) =>
                    order.status !== "CANCELLED" &&
                    order.paymentStatus !== "PAID",
                ).length
              }
            </span>
          </button>
          <button
            aria-pressed={tab === "history"}
            onClick={() => setTab("history")}
          >
            Order history
          </button>
        </div>
        <SearchField
          label="Search orders"
          placeholder="Search order or table…"
          value={search}
          onChange={setSearch}
        />
      </div>
      <div className="pv-orders-grid">
        {orders.map((order) => (
          <button
            className="pv-order-card"
            key={order.id}
            onClick={() => pos.openOrder(order.id)}
          >
            <div>
              <span className="pv-order-type-icon">
                {order.diningMode === "takeaway" ? (
                  <ShoppingBag size={22} />
                ) : (
                  <ReceiptText size={22} />
                )}
              </span>
              <Badge status={order.paymentStatus} />
            </div>
            <h2>{pos.tableLabel(order)}</h2>
            <p>
              {order.orderNumber} <span>·</span>{" "}
              {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
            </p>
            <div className="pv-order-card-status">
              <Badge status={order.status} />
              <span>
                <Clock3 size={13} />
                {new Intl.DateTimeFormat("en-MY", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kuala_Lumpur",
                }).format(new Date(order.createdAt))}
              </span>
            </div>
            <footer>
              <div>
                <small>
                  {tab === "history" ? "Order total" : "Outstanding"}
                </small>
                <strong>
                  {money(
                    (tab === "history"
                      ? totalCents(order.items)
                      : remainingCents(order)) / 100,
                  )}
                </strong>
              </div>
              <span className="pv-order-open">
                <ArrowRight size={19} />
              </span>
            </footer>
          </button>
        ))}
      </div>
      {!orders.length && (
        <EmptyState
          icon={ReceiptText}
          title={
            search
              ? "No matching orders"
              : tab === "history"
                ? "No settled orders yet"
                : "All caught up"
          }
          description={
            search
              ? "Try another order number or table."
              : "New orders will appear here as your service gets going."
          }
        />
      )}
    </div>
  );
}

function Ticket({ pos, order, batch }) {
  const items = order.items.filter((item) => item.batchId === batch.id);
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(batch.createdAt).getTime()) / 60000),
  );
  return (
    <article className={`pv-ticket pv-ticket-${batch.status.toLowerCase()}`}>
      <header>
        <div>
          <h3>{pos.tableLabel(order)}</h3>
          <small>
            {order.orderNumber} · Round {batch.batchNo}
            {batch.batchNo > 1 ? " · Add-on" : ""}
          </small>
        </div>
        <span>
          <Clock3 size={14} />
          {minutes}m
        </span>
      </header>
      <div className="pv-ticket-items">
        {items.map((item) => (
          <div key={item.id}>
            <strong>{item.quantity}</strong>
            <div>
              <span>{item.name}</span>
              {item.selectedOptions.length > 0 && (
                <small>
                  {item.selectedOptions.map((option) => option.name).join(", ")}
                </small>
              )}
              {item.serviceMode === "TAKEAWAY" && <small>Takeaway</small>}
              {item.specialRequest && <p>“{item.specialRequest}”</p>}
            </div>
          </div>
        ))}
      </div>
      {order.diningMode === "takeaway" && (
        <p className="pv-ticket-packaging">
          Include:{" "}
          {packagingOptions
            .filter(([code]) => order.takeawayPackaging.includes(code))
            .map(([, text]) => text)
            .join(", ") || "No packaging selected"}
        </p>
      )}
      {batch.status !== "READY" ? (
        <Button
          variant={batch.status === "PREPARING" ? "success" : "secondary"}
          disabled={pos.busy}
          icon={batch.status === "PREPARING" ? Check : ChefHat}
          onClick={() =>
            pos.run(() => pos.service.advanceBatch(order.id, batch.id))
          }
        >
          {batch.status === "PREPARING" ? "Mark ready" : "Start preparing"}
        </Button>
      ) : (
        <div className="pv-ticket-ready">
          <BellRing size={16} /> Waiting to be served
        </div>
      )}
    </article>
  );
}

export function KitchenScreen({ pos, serving = false }) {
  const tickets = pos.data.orders
    .flatMap((order) =>
      order.batches
        .filter((batch) =>
          ["PENDING", "PREPARING", "READY"].includes(batch.status),
        )
        .map((batch) => ({ order, batch })),
    )
    .sort((a, b) => new Date(a.batch.createdAt) - new Date(b.batch.createdAt));
  const readyOrders = pos.data.orders.filter((order) =>
    order.batches.some((batch) => batch.status === "READY"),
  );
  return (
    <div className="pv-page pv-kitchen-page">
      <PageTitle
        eyebrow={
          serving
            ? "FROM KITCHEN TO HAPPY GUESTS"
            : "A LITTLE HEAT, A LOT OF HEART"
        }
        title={
          serving ? "Ready for the final touch." : "Good things are cooking."
        }
        description={
          serving
            ? "Serve ready items or hand over a takeaway order."
            : "Every round is a fresh ticket. Keep the kitchen moving."
        }
        action={
          <Badge status={serving ? "ready" : "preparing"}>
            {serving ? readyOrders.length : tickets.length}{" "}
            {serving ? "orders ready" : "active tickets"}
          </Badge>
        }
      />
      {serving ? (
        <div className="pv-serving-grid">
          {readyOrders.map((order) => (
            <section className="pv-panel" key={order.id}>
              <div className="pv-panel-heading">
                <div>
                  <h2>{pos.tableLabel(order)}</h2>
                  <p className="pv-muted">{order.orderNumber}</p>
                </div>
                <Badge status="ready" />
              </div>
              {order.batches
                .filter((batch) => batch.status === "READY")
                .map((batch) => (
                  <Ticket
                    key={batch.id}
                    order={order}
                    batch={batch}
                    pos={pos}
                  />
                ))}
              <Button
                variant="success"
                icon={Check}
                disabled={pos.busy}
                onClick={() =>
                  pos.run(
                    () => pos.service.serveOrder(order.id),
                    () =>
                      pos.setNotice("Ready items have been marked as served."),
                  )
                }
              >
                {order.diningMode === "takeaway"
                  ? "Mark collected"
                  : "Mark served"}
              </Button>
            </section>
          ))}
          {!readyOrders.length && (
            <EmptyState
              icon={BellRing}
              title="Nothing waiting on the pass"
              description="Ready orders will appear here as the kitchen finishes them."
            />
          )}
        </div>
      ) : (
        <div className="pv-kitchen-board">
          {[
            ["PENDING", "New tickets"],
            ["PREPARING", "Preparing"],
            ["READY", "Ready to serve"],
          ].map(([status, title]) => (
            <section className="pv-kitchen-column" key={status}>
              <h2>
                <span
                  className={`pv-column-dot pv-dot-${status.toLowerCase()}`}
                />
                {title}
                <span>
                  {
                    tickets.filter((ticket) => ticket.batch.status === status)
                      .length
                  }
                </span>
              </h2>
              {tickets
                .filter((ticket) => ticket.batch.status === status)
                .map(({ order, batch }) => (
                  <Ticket
                    key={batch.id}
                    order={order}
                    batch={batch}
                    pos={pos}
                  />
                ))}
              {!tickets.some((ticket) => ticket.batch.status === status) && (
                <div className="pv-column-empty">
                  <ChefHat size={25} strokeWidth={1.4} />
                  <p>No tickets here</p>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShiftScreen({ pos }) {
  const shift = pos.data.shift;
  const [opening, setOpening] = useState("");
  const [actual, setActual] = useState("");
  const [movement, setMovement] = useState({
    type: "CASH_IN",
    amount: "",
    reason: "",
  });
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow="EVERY RINGGIT, ACCOUNTED FOR"
        title="A clear view of your cash."
        description="Manage your mock cashier shift, float and cash movements."
        action={
          <Badge status={shift.status === "OPEN" ? "available" : "completed"}>
            {label(shift.status)}
          </Badge>
        }
      />
      <div className="pv-shift-layout">
        <section className="pv-panel">
          <span className="pv-summary-icon">
            <Banknote size={28} />
          </span>
          <h2>{shift.shiftNumber}</h2>
          <div className="pv-shift-stats">
            <div>
              <span>Opening float</span>
              <strong>{money(shift.openingFloat)}</strong>
            </div>
            <div>
              <span>Expected cash</span>
              <strong>{money(expectedCash(pos.data))}</strong>
            </div>
            {shift.status === "CLOSED" && (
              <>
                <div>
                  <span>Actual cash</span>
                  <strong>{money(shift.actualCash)}</strong>
                </div>
                <div>
                  <span>Difference</span>
                  <strong>
                    {money(shift.actualCash - expectedCash(pos.data))}
                  </strong>
                </div>
              </>
            )}
          </div>
          <h3>Cash movements</h3>
          {shift.movements.length ? (
            <div className="pv-movement-list">
              {shift.movements.map((entry) => (
                <div key={entry.id}>
                  <div>
                    <strong>{label(entry.type)}</strong>
                    <small>{entry.reason}</small>
                  </div>
                  <strong>{money(entry.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="pv-muted">No cash movements recorded.</p>
          )}
        </section>
        <div className="pv-shift-forms">
          {shift.status !== "OPEN" ? (
            <form
              className="pv-panel"
              onSubmit={(event) => {
                event.preventDefault();
                pos.run(
                  () => pos.service.openShift(opening),
                  () => {
                    setOpening("");
                    pos.setNotice("Mock cashier shift opened.");
                  },
                );
              }}
            >
              <h2>Open cashier shift</h2>
              <label className="pv-field">
                <span>Opening float (RM)</span>
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  aria-label="Opening float"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                />
              </label>
              <Button>Open shift</Button>
            </form>
          ) : (
            <>
              <form
                className="pv-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  pos.run(
                    () =>
                      pos.service.cashMovement(
                        movement.type,
                        movement.amount || "0",
                        movement.reason,
                      ),
                    () => setMovement({ ...movement, amount: "", reason: "" }),
                  );
                }}
              >
                <h2>Record cash movement</h2>
                <label className="pv-field">
                  <span>Movement type</span>
                  <select
                    value={movement.type}
                    onChange={(event) =>
                      setMovement({ ...movement, type: event.target.value })
                    }
                  >
                    <option value="CASH_IN">Cash in</option>
                    <option value="CASH_OUT">Cash out</option>
                    <option value="NO_SALE_DRAWER_OPEN">
                      No-sale drawer open
                    </option>
                  </select>
                </label>
                {movement.type !== "NO_SALE_DRAWER_OPEN" && (
                  <label className="pv-field">
                    <span>Amount (RM)</span>
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={movement.amount}
                      onChange={(event) =>
                        setMovement({ ...movement, amount: event.target.value })
                      }
                    />
                  </label>
                )}
                <label className="pv-field">
                  <span>Reason</span>
                  <input
                    required
                    maxLength={500}
                    value={movement.reason}
                    onChange={(event) =>
                      setMovement({ ...movement, reason: event.target.value })
                    }
                  />
                </label>
                <Button variant="secondary" disabled={pos.busy}>
                  Record movement
                </Button>
              </form>
              <form
                className="pv-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  pos.run(
                    () => pos.service.closeShift(actual),
                    () => pos.setNotice("Mock cashier shift closed."),
                  );
                }}
              >
                <h2>Close shift</h2>
                <p className="pv-muted">
                  Count your physical cash and enter the actual amount.
                </p>
                <label className="pv-field">
                  <span>Actual cash (RM)</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label="Actual cash"
                    value={actual}
                    onChange={(event) => setActual(event.target.value)}
                  />
                </label>
                <Button variant="secondary" disabled={pos.busy}>
                  Close shift
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
