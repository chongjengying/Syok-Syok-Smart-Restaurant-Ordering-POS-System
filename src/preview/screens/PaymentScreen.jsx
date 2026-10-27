import { useState } from "react";
import {
  Banknote,
  Smartphone,
  Check,
  ReceiptText,
  ShieldCheck,
  ArrowRight,
  Printer,
  UtensilsCrossed,
} from "lucide-react";
import {
  Button,
  PageTitle,
  Badge,
  CheckField,
  Modal,
  Quantity,
} from "../components/ui.jsx";
import { OrderLines, Totals } from "../components/OrderSummary.jsx";
import { VoucherForm } from "./OrderingScreens.jsx";
import {
  money,
  totalCents,
  remainingCents,
  paidCents,
  parseCents,
  kitchenActive,
  equalParts,
} from "../services/previewMoney.js";

export default function PaymentScreen({ pos, split = false }) {
  const order = pos.order;
  const outstanding = remainingCents(order);
  const [mode, setMode] = useState("FULL");
  const [amountInput, setAmount] = useState("");
  const [received, setReceived] = useState("");
  const [method, setMethod] = useState("CASH");
  const [providerId, setProvider] = useState(
    pos.data.paymentMethods.find((entry) => entry.method === "QR")?.providers[0]
      ?.providerId || "",
  );
  const [reference, setReference] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [equalCount, setEqualCount] = useState(2);
  const [billId, setBillId] = useState("");
  const [quantities, setQuantities] = useState({});
  const [confirm, setConfirm] = useState(false);
  const selectedBill = order.bills.find((bill) => bill.id === billId);
  const allocations = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  const itemAmount = allocations.reduce(
    (sum, allocation) =>
      sum +
      Math.round(
        order.items.find((item) => item.id === allocation.orderItemId)
          .unitPrice * 100,
      ) *
        allocation.quantity,
    0,
  );
  let amount = parseCents(amountInput || (outstanding / 100).toFixed(2));
  if (split && mode === "FULL") amount = outstanding;
  if (split && mode === "EQUAL")
    amount =
      selectedBill && !selectedBill.paid
        ? Math.round(selectedBill.amount * 100)
        : 0;
  if (split && mode === "ITEM") amount = itemAmount;
  const receivedCents = parseCents(
    received || ((amount || 0) / 100).toFixed(2),
  );
  const hasActive = kitchenActive(order);
  const valid =
    outstanding > 0 &&
    amount > 0 &&
    amount <= outstanding &&
    (method !== "CASH" ||
      (receivedCents !== null && receivedCents >= amount)) &&
    (method !== "QR" || providerId) &&
    (!hasActive || acknowledged) &&
    !pos.busy;
  const providers =
    pos.data.paymentMethods.find((entry) => entry.method === "QR")?.providers ||
    [];
  const selectMode = (next) => {
    setMode(next);
    setAmount("");
    setReceived("");
    setQuantities({});
    setBillId("");
    pos.setError("");
  };
  const paymentInput = {
    paymentMethod: method,
    splitType: split ? mode : amount === outstanding ? "FULL" : "AMOUNT",
    amount: ((amount || 0) / 100).toFixed(2),
    receivedAmount: received || ((amount || 0) / 100).toFixed(2),
    providerId: method === "QR" ? providerId : null,
    paymentReference: reference,
    acknowledged,
    qrConfirmed: true,
    billId,
    allocations,
  };
  const record = () =>
    pos.run(
      () => pos.service.recordPayment(order.id, paymentInput),
      () => {
        setConfirm(false);
        setReceived("");
        setAmount("");
        setReference("");
        setQuantities({});
        setBillId("");
        pos.setNotice("Mock payment confirmed. The balance has been updated.");
      },
    );
  return (
    <div className="pv-page">
      <PageTitle
        eyebrow="A GREAT MEAL, ALL SETTLED"
        title={split ? "Split it your way." : "Let’s settle the bill."}
        description={`${pos.tableLabel(order)} · ${order.orderNumber}`}
        onBack={() => pos.go(pos.paymentBack)}
        action={<Badge status={order.paymentStatus} />}
      />
      <div className="pv-payment-layout">
        <section className="pv-panel">
          <div className="pv-panel-heading">
            <h2>Bill details</h2>
            <ReceiptText size={21} />
          </div>
          <OrderLines items={order.items} pos={pos} />
          <Totals items={order.items} order={order} />
          <div className="pv-payment-balance">
            <div>
              <span>Already paid</span>
              <strong>{money(paidCents(order) / 100)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong data-testid="outstanding">
                {money(outstanding / 100)}
              </strong>
            </div>
          </div>
          {order.payments.length > 0 && (
            <div className="pv-payment-history">
              <h3>Confirmed payments</h3>
              {order.payments.map((payment) => (
                <div key={payment.id}>
                  <span className="pv-paid-check">
                    <Check size={16} />
                  </span>
                  <div>
                    <strong>
                      {payment.paymentMethod === "QR"
                        ? "QR / E-wallet"
                        : "Cash"}{" "}
                      · {payment.paymentNumber}
                    </strong>
                    <small>
                      {payment.splitType.toLowerCase()} payment
                      {payment.changeAmount > 0
                        ? ` · Change ${money(payment.changeAmount)}`
                        : ""}
                    </small>
                  </div>
                  <strong>{money(payment.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="pv-panel pv-payment-controls">
          {outstanding === 0 ? (
            <div className="pv-payment-paid">
              <span className="pv-big-check">
                <Check size={32} />
              </span>
              <h2>Payment complete.</h2>
              <p>All payments have been confirmed.</p>
              {hasActive && (
                <div className="pv-info-box">
                  The kitchen is still working on this order. The table stays
                  occupied until service is complete.
                </div>
              )}
              <Button
                variant="success"
                icon={ArrowRight}
                onClick={() => pos.go("receipt")}
              >
                Complete order
              </Button>
            </div>
          ) : (
            <>
              <p className="pv-eyebrow">PAYMENT OPTIONS</p>
              <h2>
                {split
                  ? "How would you like to split?"
                  : "Choose a payment method"}
              </h2>
              {split && (
                <>
                  <div className="pv-tabs pv-split-tabs">
                    {[
                      ["FULL", "Full"],
                      ["EQUAL", "Equal"],
                      ["AMOUNT", "Amount"],
                      ["ITEM", "By item"],
                    ].map(([value, text]) => (
                      <button
                        key={value}
                        aria-pressed={mode === value}
                        onClick={() => selectMode(value)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {mode === "EQUAL" && (
                    <div className="pv-equal-split">
                      {!order.bills.length ? (
                        <>
                          <label className="pv-field">
                            <span>Number of parts</span>
                            <select
                              aria-label="Number of parts"
                              value={equalCount}
                              disabled={paidCents(order) > 0}
                              onChange={(event) =>
                                setEqualCount(Number(event.target.value))
                              }
                            >
                              {Array.from({ length: 9 }, (_, index) => (
                                <option key={index} value={index + 2}>
                                  {index + 2} people
                                </option>
                              ))}
                            </select>
                          </label>
                          <p className="pv-muted">
                            {equalParts(outstanding, equalCount)
                              .map((value) => money(value / 100))
                              .join(" + ")}
                          </p>
                          <Button
                            variant="secondary"
                            disabled={paidCents(order) > 0 || pos.busy}
                            onClick={() =>
                              pos.run(() =>
                                pos.service.createEqualSplit(
                                  order.id,
                                  equalCount,
                                ),
                              )
                            }
                          >
                            Create equal parts
                          </Button>
                          {paidCents(order) > 0 && (
                            <p className="pv-muted">
                              Equal parts must be created before payment starts.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="pv-equal-parts">
                          {order.bills.map((bill) => (
                            <button
                              key={bill.id}
                              aria-pressed={bill.id === billId}
                              disabled={bill.paid}
                              onClick={() => {
                                setBillId(bill.id);
                                setReceived("");
                              }}
                            >
                              <strong>{bill.label}</strong>
                              <span>{money(bill.amount)}</span>
                              {bill.paid ? <Check size={16} /> : null}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {mode === "ITEM" && (
                    <div className="pv-item-split">
                      {order.items.map((item) => {
                        const allocated = order.payments
                          .flatMap((payment) => payment.allocations || [])
                          .filter((entry) => entry.orderItemId === item.id)
                          .reduce((sum, entry) => sum + entry.quantity, 0);
                        return (
                          <div key={item.id}>
                            <div>
                              <strong>{item.name}</strong>
                              <small>
                                {money(item.unitPrice)} each ·{" "}
                                {item.quantity - allocated} remaining
                              </small>
                            </div>
                            <Quantity
                              name={`split ${item.name}`}
                              value={quantities[item.id] || 0}
                              min={0}
                              max={item.quantity - allocated}
                              onChange={(quantity) =>
                                setQuantities((current) => ({
                                  ...current,
                                  [item.id]: quantity,
                                }))
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <div className="pv-payment-methods">
                {pos.data.paymentMethods.map((entry) => (
                  <button
                    key={entry.method}
                    aria-pressed={method === entry.method}
                    disabled={!entry.available}
                    onClick={() => {
                      setMethod(entry.method);
                      setReceived("");
                    }}
                  >
                    <span>
                      {entry.method === "CASH" ? (
                        <Banknote size={24} />
                      ) : (
                        <Smartphone size={24} />
                      )}
                      {method === entry.method && <Check size={17} />}
                    </span>
                    <strong>{entry.label}</strong>
                    <small>
                      {entry.method === "CASH"
                        ? "Tender & change"
                        : "Manual confirmation"}
                    </small>
                  </button>
                ))}
              </div>
              {(!split || mode === "AMOUNT") && (
                <label className="pv-field">
                  <span>Payment amount (RM)</span>
                  <input
                    aria-label="Payment amount"
                    inputMode="decimal"
                    placeholder={(outstanding / 100).toFixed(2)}
                    value={amountInput}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              )}
              {split && mode !== "AMOUNT" && (
                <div className="pv-amount-due">
                  <span>This payment</span>
                  <strong>{money((amount || 0) / 100)}</strong>
                </div>
              )}
              {method === "CASH" ? (
                <>
                  <label className="pv-field">
                    <span>Cash received (RM)</span>
                    <input
                      aria-label="Cash received"
                      inputMode="decimal"
                      placeholder={((amount || 0) / 100).toFixed(2)}
                      value={received}
                      onChange={(event) => setReceived(event.target.value)}
                    />
                  </label>
                  <div className="pv-cash-presets">
                    {[20, 50, 100].map((value) => (
                      <button
                        key={value}
                        disabled={value * 100 < (amount || 0)}
                        onClick={() => setReceived(value.toFixed(2))}
                      >
                        {money(value)}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        setReceived(((amount || 0) / 100).toFixed(2))
                      }
                    >
                      Exact
                    </button>
                  </div>
                  <div className="pv-change">
                    <span>Change due</span>
                    <strong>
                      {money(
                        Math.max(0, (receivedCents || 0) - (amount || 0)) / 100,
                      )}
                    </strong>
                  </div>
                  {receivedCents !== null && receivedCents < (amount || 0) && (
                    <p className="pv-inline-error">
                      Cash received is insufficient.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <label className="pv-field">
                    <span>QR / E-wallet provider</span>
                    <select
                      aria-label="Payment provider"
                      value={providerId}
                      onChange={(event) => setProvider(event.target.value)}
                    >
                      <option value="">Select a provider</option>
                      {providers.map((provider) => (
                        <option
                          key={provider.providerId}
                          value={provider.providerId}
                        >
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="pv-field">
                    <span>
                      Payment reference <small>Optional</small>
                    </span>
                    <input
                      aria-label="Payment reference"
                      value={reference}
                      maxLength={150}
                      onChange={(event) => setReference(event.target.value)}
                      placeholder="Reference number"
                    />
                  </label>
                </>
              )}
              {hasActive && (
                <div className="pv-kitchen-warning">
                  <CheckField checked={acknowledged} onChange={setAcknowledged}>
                    I acknowledge that kitchen items are still being prepared or
                    waiting to be served.
                  </CheckField>
                </div>
              )}
              {!paidCents(order) && <VoucherForm pos={pos} />}
              <Button
                variant="success"
                icon={ShieldCheck}
                disabled={!valid}
                onClick={() =>
                  method === "QR" || split ? setConfirm(true) : record()
                }
              >
                Confirm payment
              </Button>
              <p className="pv-fine-print">
                Preview only · No money is collected.
              </p>
            </>
          )}
        </section>
      </div>
      {confirm && (
        <Modal
          title={
            method === "QR"
              ? "Confirm QR / E-wallet payment"
              : "Confirm split payment"
          }
          onClose={() => setConfirm(false)}
        >
          <div className="pv-modal-content">
            <p>
              {method === "QR"
                ? "Simulate verifying the merchant app or receipt before confirming the amount received."
                : "Review this allocation before confirming."}
            </p>
            <div className="pv-confirm-amount">
              {money((amount || 0) / 100)}
            </div>
            <p className="pv-muted">
              {order.orderNumber} ·{" "}
              {method === "QR"
                ? providers.find(
                    (provider) => provider.providerId === providerId,
                  )?.displayName
                : "Cash"}
            </p>
            <div className="pv-modal-actions">
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Go back
              </Button>
              <Button variant="success" disabled={pos.busy} onClick={record}>
                {method === "QR"
                  ? "Yes, payment received"
                  : "Confirm allocation"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function ReceiptScreen({ pos }) {
  const order = pos.order;
  return (
    <div className="pv-page pv-receipt-page">
      <PageTitle
        eyebrow="THANK YOU FOR A GREAT SERVICE"
        title="All settled. All smiles."
        description="Your mock payment has been confirmed."
      />
      <section className="pv-receipt" id="pv-print-receipt">
        <div className="pv-receipt-brand">
          <span>
            <UtensilsCrossed size={25} />
          </span>
          <strong>
            syok<span>syok.</span>
          </strong>
          <small>GOOD FOOD. GREAT COMPANY.</small>
        </div>
        <Badge status="paid" />
        <h2>{money(totalCents(order.items) / 100)}</h2>
        <p>MOCK RECEIPT · {order.receipt?.receiptNumber || "Not issued"}</p>
        <dl>
          <div>
            <dt>Order</dt>
            <dd>{order.orderNumber}</dd>
          </div>
          <div>
            <dt>Dining</dt>
            <dd>{pos.tableLabel(order)}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>
              {order.receipt
                ? new Intl.DateTimeFormat("en-MY", {
                    timeZone: "Asia/Kuala_Lumpur",
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "numeric",
                    month: "short",
                  }).format(new Date(order.receipt.issuedAt))
                : "—"}
            </dd>
          </div>
        </dl>
        <div className="pv-receipt-lines">
          {order.items.map((item) => (
            <div key={item.id}>
              <span>
                {item.quantity} × {item.name}
              </span>
              <strong>{money(item.unitPrice * item.quantity)}</strong>
            </div>
          ))}
        </div>
        <Totals items={order.items} order={order} />
        <div className="pv-receipt-payments">
          {order.payments.map((payment) => (
            <div key={payment.id}>
              <span>
                {payment.paymentMethod === "QR" ? "QR / E-wallet" : "Cash"}
              </span>
              <strong>{money(payment.amount)}</strong>
              {payment.paymentMethod === "CASH" && (
                <small>
                  Tender {money(payment.receivedAmount)} · Change{" "}
                  {money(payment.changeAmount)}
                </small>
              )}
            </div>
          ))}
        </div>
        {kitchenActive(order) && (
          <div className="pv-info-box">
            Payment is complete. Kitchen service is still in progress.
          </div>
        )}
        <p className="pv-fine-print">
          Design preview only. This is not a fiscal receipt.
        </p>
      </section>
      <div className="pv-receipt-actions">
        <Button
          variant="secondary"
          icon={Printer}
          onClick={() => window.print()}
        >
          Print mock receipt
        </Button>
        <Button icon={ArrowRight} onClick={() => pos.go("welcome")}>
          Done
        </Button>
      </div>
    </div>
  );
}
