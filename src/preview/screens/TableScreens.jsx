import { useState } from "react";
import {
  UtensilsCrossed,
  ShoppingBag,
  Users,
  ArrowRight,
  Check,
  MoveRight,
} from "lucide-react";
import {
  Badge,
  Button,
  PageTitle,
  Modal,
  EmptyState,
} from "../components/ui.jsx";
import { money, totalCents } from "../services/previewMoney.js";

function TableCard({ table, order, selected, onSelect, selectable }) {
  return (
    <button
      className={`pv-table-card pv-table-${table.status.toLowerCase()} ${selected ? "pv-table-selected" : ""}`}
      onClick={onSelect}
      disabled={!selectable}
      aria-label={`Table ${table.tableNumber}, ${table.status.toLowerCase()}`}
      aria-pressed={selected}
    >
      <div>
        <Badge status={table.status} />
        {selected && (
          <span className="pv-table-check">
            <Check size={15} />
          </span>
        )}
      </div>
      <div className="pv-table-drawing">
        <i />
        <span>{table.tableNumber}</span>
        <i />
      </div>
      <h3>Table {table.tableNumber}</h3>
      <p>
        <Users size={14} /> {table.capacity} seats <span>·</span> {table.area}
      </p>
      {order ? (
        <strong className="pv-table-amount">
          {money(totalCents(order.items) / 100)}{" "}
          <small>{order.orderNumber}</small>
        </strong>
      ) : (
        <span className="pv-table-bottom">
          {table.status === "AVAILABLE"
            ? "Ready for guests"
            : table.status === "CLEANING"
              ? "Getting ready"
              : table.status === "DIRTY"
                ? "Awaiting cleaning"
                : table.status === "RESERVED"
                  ? "Reserved for guests"
                  : "Currently unavailable"}
        </span>
      )}
    </button>
  );
}

export default function TableScreen({ pos, management = false }) {
  const [mode, setMode] = useState("dine-in");
  const [selected, setSelected] = useState(null);
  const [area, setArea] = useState("All areas");
  const [status, setStatus] = useState("ALL");
  const [moving, setMoving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const table = pos.data.tables.find((entry) => entry.id === selected);
  const active = (entry) =>
    pos.data.orders.find(
      (order) =>
        order.tableId === entry.id &&
        !["COMPLETED", "CANCELLED"].includes(order.status),
    );
  const currentOrder = table ? active(table) : null;
  const visible = pos.data.tables.filter(
    (entry) =>
      (area === "All areas" || area === entry.area) &&
      (status === "ALL" || entry.status === status),
  );
  const action = (name, text) => setConfirmation({ name, text });
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow={management ? "THE FLOOR AT A GLANCE" : "LET’S GET STARTED"}
        title={management ? "A place for everyone." : "Where are we serving?"}
        description={
          management
            ? "Keep every table ready for its next great meal."
            : "Choose a dining option, then select a table to continue."
        }
        onBack={management ? undefined : () => pos.go("welcome")}
      />
      {!management && (
        <div className="pv-dining-modes">
          <button
            aria-pressed={mode === "dine-in"}
            onClick={() => setMode("dine-in")}
          >
            <span>
              <UtensilsCrossed size={24} />
            </span>
            <div>
              <strong>Dine-in</strong>
              <small>Good times around the table</small>
            </div>
            {mode === "dine-in" && <Check size={20} />}
          </button>
          <button
            aria-pressed={mode === "takeaway"}
            onClick={() => setMode("takeaway")}
          >
            <span>
              <ShoppingBag size={24} />
            </span>
            <div>
              <strong>Takeaway</strong>
              <small>A little joy, on the go</small>
            </div>
            {mode === "takeaway" && <Check size={20} />}
          </button>
        </div>
      )}
      {(management || mode === "dine-in") && (
        <>
          <div className="pv-table-toolbar">
            <div className="pv-tabs">
              {[
                "All areas",
                ...new Set(pos.data.tables.map((entry) => entry.area)),
              ].map((name) => (
                <button
                  key={name}
                  aria-pressed={area === name}
                  onClick={() => setArea(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <label className="pv-filter-label">
              Status
              <select
                aria-label="Table status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                {[
                  "ALL",
                  "AVAILABLE",
                  "OCCUPIED",
                  "RESERVED",
                  "DIRTY",
                  "CLEANING",
                  "DISABLED",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value === "ALL"
                      ? "All statuses"
                      : value.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className={`pv-table-layout ${management && table ? "pv-table-with-details" : ""}`}
          >
            <div>
              <div className="pv-table-grid">
                {visible.map((entry) => (
                  <TableCard
                    key={entry.id}
                    table={entry}
                    order={active(entry)}
                    selected={selected === entry.id}
                    selectable={
                      management ||
                      ["AVAILABLE", "OCCUPIED"].includes(entry.status)
                    }
                    onSelect={() => setSelected(entry.id)}
                  />
                ))}
              </div>
              {visible.length === 0 && (
                <EmptyState
                  icon={UtensilsCrossed}
                  title="No tables here"
                  description="Try another area or status."
                />
              )}
            </div>
            {management && table && (
              <aside className="pv-panel pv-table-detail">
                <h2>Table {table.tableNumber}</h2>
                <Badge status={table.status} />
                <p className="pv-muted">
                  {table.area} · {table.capacity} seats
                </p>
                {currentOrder && (
                  <>
                    <strong>{currentOrder.orderNumber}</strong>
                    <p>{money(totalCents(currentOrder.items) / 100)}</p>
                    <Button onClick={() => pos.openOrder(currentOrder.id)}>
                      View order
                    </Button>
                    {currentOrder.paymentStatus === "UNPAID" && (
                      <Button
                        variant="secondary"
                        icon={MoveRight}
                        onClick={() => setMoving(true)}
                      >
                        Move order
                      </Button>
                    )}
                  </>
                )}
                {table.status === "AVAILABLE" && (
                  <Button
                    variant="secondary"
                    onClick={() => action("reserve", "Reserve this table?")}
                  >
                    Reserve table
                  </Button>
                )}
                {table.status === "RESERVED" && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      action("release", "Release this reservation?")
                    }
                  >
                    Release reservation
                  </Button>
                )}
                {table.status === "DIRTY" && (
                  <Button
                    onClick={() =>
                      action("startCleaning", "Start cleaning this table?")
                    }
                  >
                    Start cleaning
                  </Button>
                )}
                {table.status === "CLEANING" && (
                  <Button
                    variant="success"
                    onClick={() =>
                      action(
                        "completeCleaning",
                        "Confirm this table is clean and ready?",
                      )
                    }
                  >
                    Complete cleaning
                  </Button>
                )}
                {["AVAILABLE", "CLEANING"].includes(table.status) && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      action("disable", "Mark this table out of service?")
                    }
                  >
                    Out of service
                  </Button>
                )}
                {table.status === "DISABLED" && (
                  <Button
                    onClick={() =>
                      action("restore", "Restore this table to available?")
                    }
                  >
                    Restore table
                  </Button>
                )}
              </aside>
            )}
          </div>
        </>
      )}
      {!management && mode === "takeaway" && (
        <section className="pv-panel pv-takeaway-start">
          <span className="pv-summary-icon">
            <ShoppingBag size={30} />
          </span>
          <h2>Great food, wherever they go.</h2>
          <p>
            No table needed. Build the order, confirm payment,
            <br />
            and we’ll send it to the kitchen.
          </p>
          {pos.data.orders
            .filter(
              (order) =>
                order.diningMode === "takeaway" &&
                !["COMPLETED", "CANCELLED"].includes(order.status),
            )
            .map((order) => (
              <button
                className="pv-takeaway-existing"
                key={order.id}
                onClick={() => pos.openOrder(order.id)}
              >
                <ReceiptLabel order={order} />
                Open existing order <ArrowRight size={17} />
              </button>
            ))}
        </section>
      )}
      {!management && (
        <div className="pv-sticky-action">
          <div>
            <small>
              {mode === "takeaway" ? "DINING OPTION" : "SELECTED TABLE"}
            </small>
            <strong>
              {mode === "takeaway"
                ? "Takeaway"
                : table
                  ? `Table ${table.tableNumber} · ${table.capacity} seats`
                  : "Select a table to continue"}
            </strong>
          </div>
          <Button
            icon={ArrowRight}
            disabled={pos.busy || (mode === "dine-in" && !table)}
            onClick={() =>
              pos.chooseContext(mode, mode === "dine-in" ? table.id : null)
            }
          >
            {currentOrder && mode === "dine-in"
              ? "Open existing order"
              : "Continue to menu"}
          </Button>
        </div>
      )}
      {moving && (
        <Modal title="Move order" onClose={() => setMoving(false)}>
          <div className="pv-modal-content">
            <p className="pv-muted">
              Choose an available or reserved destination for{" "}
              {currentOrder?.orderNumber}.
            </p>
            <div className="pv-destinations">
              {pos.data.tables
                .filter((entry) =>
                  ["AVAILABLE", "RESERVED"].includes(entry.status),
                )
                .map((entry) => (
                  <Button
                    key={entry.id}
                    variant="secondary"
                    onClick={() => {
                      setMoving(false);
                      setConfirmation({
                        moveTo: entry.id,
                        text: `Move ${currentOrder.orderNumber} to Table ${entry.tableNumber}?`,
                      });
                    }}
                  >
                    Table {entry.tableNumber}
                  </Button>
                ))}
            </div>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal title="Table operation" onClose={() => setConfirmation(null)}>
          <div className="pv-modal-content">
            <p>{confirmation.text}</p>
            <div className="pv-modal-actions">
              <Button variant="secondary" onClick={() => setConfirmation(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  pos.run(
                    () =>
                      confirmation.moveTo
                        ? pos.service.moveOrder(
                            currentOrder.id,
                            confirmation.moveTo,
                          )
                        : pos.service.tableAction(table.id, confirmation.name),
                    () => {
                      setConfirmation(null);
                      pos.setNotice("Table updated.");
                    },
                  )
                }
              >
                Confirm
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReceiptLabel({ order }) {
  return <strong>{order.orderNumber}</strong>;
}
