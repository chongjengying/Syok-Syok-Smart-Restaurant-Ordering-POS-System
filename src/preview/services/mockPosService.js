import {
  mockMenu,
  mockCategories,
  packagingOptions,
} from "../data/mockMenu.js";
import { mockTables } from "../data/mockTables.js";
import {
  mockPaymentMethods,
  mockVouchers,
  mockShift,
} from "../data/mockPayments.js";
import { createMockOrders } from "../data/mockOrders.js";
import {
  cents,
  parseCents,
  totalCents,
  paidCents,
  remainingCents,
  draftItems,
  kitchenActive,
  equalParts,
} from "./previewMoney.js";

const copy = (value) => structuredClone(value);
const activeOrder = (state, tableId) =>
  state.orders.find(
    (order) =>
      order.tableId === tableId &&
      !["COMPLETED", "CANCELLED"].includes(order.status),
  );
function requireOrder(state, id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) throw new Error("Order not found.");
  return order;
}

function updateLifecycle(state, order) {
  if (!order.batches.length) {
    order.status = "DRAFT";
    return;
  }
  const pending = order.batches.find((batch) => batch.status === "PENDING");
  if (pending) order.status = "CONFIRMED";
  else if (order.batches.some((batch) => batch.status === "PREPARING"))
    order.status = "PREPARING";
  else if (order.batches.some((batch) => batch.status === "READY"))
    order.status = "READY";
  else order.status = "SERVED";
  if (
    order.paymentStatus === "PAID" &&
    order.receipt &&
    !kitchenActive(order) &&
    !draftItems(order).length
  ) {
    order.status = "COMPLETED";
    const table = state.tables.find((entry) => entry.id === order.tableId);
    if (table && !activeOrder(state, table.id)) table.status = "DIRTY";
  }
}

function appendBatch(order, nextId) {
  const drafts = draftItems(order);
  if (!drafts.length)
    throw new Error("Add at least one product before sending.");
  const batch = {
    id: nextId("batch"),
    batchNo: order.batches.length + 1,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
  for (const item of drafts) {
    item.batchId = batch.id;
    item.itemStatus = "SUBMITTED";
  }
  order.batches.push(batch);
  order.status = "CONFIRMED";
}

/** Local adapter only. Commands can be awaited by UI orchestration. An eventual
 * remote adapter must maintain the snapshot cache and retain server authority.
 * No imports from production services, browser storage or network clients. */
export function createMockPosService() {
  let sequence = 1100;
  const nextId = (prefix) => `preview-${prefix}-${++sequence}`;
  const listeners = new Set();
  let state = {
    tables: copy(mockTables),
    products: copy(mockMenu),
    categories: copy(mockCategories),
    orders: createMockOrders(),
    paymentMethods: copy(mockPaymentMethods),
    vouchers: copy(mockVouchers),
    shift: copy(mockShift),
  };

  function commit(operation) {
    const next = copy(state);
    const result = operation(next);
    state = next;
    listeners.forEach((listener) => listener());
    return result;
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openOrder(mode, tableId = null) {
      return commit((next) => {
        if (next.shift.status !== "OPEN")
          throw new Error("Open a cashier shift before starting an order.");
        if (!["dine-in", "takeaway"].includes(mode))
          throw new Error("Choose a dining mode.");
        let table = null;
        if (mode === "dine-in") {
          table = next.tables.find((entry) => entry.id === tableId);
          if (!table || !["AVAILABLE", "OCCUPIED"].includes(table.status))
            throw new Error("Select an available or occupied table.");
          const existing = activeOrder(next, table.id);
          if (existing) return { id: existing.id, existing: true };
          // A paid table with unfinished kitchen work remains occupied.
          if (table.status === "OCCUPIED")
            throw new Error("This occupied table is still in use.");
        }
        const id = nextId("order");
        const order = {
          id,
          orderNumber: `DEMO-${sequence}`,
          tableId: table?.id || null,
          diningMode: mode,
          status: "DRAFT",
          paymentStatus: "UNPAID",
          createdAt: new Date().toISOString(),
          items: [],
          batches: [],
          payments: [],
          bills: [],
          takeawayPackaging: ["PAPER_BAG", "NAPKIN"],
          receipt: null,
          discount: 0,
          tax: 0,
          serviceCharge: 0,
          rounding: 0,
        };
        next.orders.unshift(order);
        if (table) table.status = "OCCUPIED";
        return { id, existing: false };
      });
    },
    discardDraft(id) {
      return commit((next) => {
        const order = requireOrder(next, id);
        if (order.status !== "DRAFT") return;
        if (paidCents(order))
          throw new Error(
            "A partially paid draft cannot be discarded. Resume its payment.",
          );
        order.status = "CANCELLED";
        const table = next.tables.find((entry) => entry.id === order.tableId);
        if (table) table.status = "AVAILABLE";
      });
    },
    saveItem(orderId, input, itemId = null) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (
          order.paymentStatus !== "UNPAID" ||
          ["COMPLETED", "CANCELLED"].includes(order.status)
        )
          throw new Error("Items cannot be changed after payment has started.");
        const dish = next.products.find(
          (entry) => entry.id === input.productId,
        );
        if (!dish?.isActive || !dish.isAvailable)
          throw new Error("This product is unavailable.");
        if (
          !Number.isInteger(input.quantity) ||
          input.quantity < 1 ||
          input.quantity > 99
        )
          throw new Error("Quantity must be from 1 to 99.");
        const options = [];
        for (const group of dish.optionGroups) {
          const selected = [...new Set(input.optionIds?.[group.id] || [])];
          const minimum = Math.max(
            group.minSelection,
            group.isRequired ? 1 : 0,
          );
          if (selected.length < minimum || selected.length > group.maxSelection)
            throw new Error(`Check your selections for ${group.name}.`);
          for (const id of selected) {
            const option = group.options.find((entry) => entry.id === id);
            if (!option) throw new Error("Invalid product option.");
            options.push({
              ...option,
              groupId: group.id,
              groupName: group.name,
              selectionType: group.selectionType,
            });
          }
        }
        if (!["DINE_IN", "TAKEAWAY"].includes(input.serviceMode))
          throw new Error("Choose the item service mode.");
        const old = itemId
          ? order.items.find((entry) => entry.id === itemId)
          : null;
        if (itemId && (!old || old.itemStatus !== "DRAFT"))
          throw new Error("Submitted kitchen items cannot be edited.");
        const item = {
          id: old?.id || nextId("item"),
          productId: dish.id,
          name: dish.name,
          quantity: input.quantity,
          unitPrice:
            (cents(dish.price) +
              options.reduce(
                (sum, option) => sum + cents(option.priceAdjustment),
                0,
              )) /
            100,
          selectedOptions: options,
          specialRequest: String(input.specialRequest || "")
            .trim()
            .slice(0, 1000),
          serviceMode: input.serviceMode,
          itemStatus: "DRAFT",
          batchId: null,
        };
        if (old) order.items[order.items.indexOf(old)] = item;
        else order.items.push(item);
        return item.id;
      });
    },
    changeQuantity(orderId, itemId, delta) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (order.paymentStatus !== "UNPAID")
          throw new Error("This bill is locked after payment starts.");
        const item = order.items.find((entry) => entry.id === itemId);
        if (!item || item.itemStatus !== "DRAFT" || !Number.isInteger(delta))
          throw new Error("Only draft items can be adjusted.");
        item.quantity = Math.min(99, item.quantity + delta);
        if (item.quantity <= 0)
          order.items = order.items.filter((entry) => entry.id !== itemId);
      });
    },
    clearDraft(orderId) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (order.paymentStatus !== "UNPAID")
          throw new Error("This bill is locked after payment starts.");
        order.items = order.items.filter((item) => item.itemStatus !== "DRAFT");
      });
    },
    setPackaging(orderId, codes) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (order.diningMode !== "takeaway" || order.paymentStatus !== "UNPAID")
          throw new Error("Packaging can only change before takeaway payment.");
        if (
          codes.some(
            (code) => !packagingOptions.some(([allowed]) => allowed === code),
          )
        )
          throw new Error("Unknown packaging option.");
        order.takeawayPackaging = [...new Set(codes)];
      });
    },
    submitOrder(orderId) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (order.diningMode === "takeaway")
          throw new Error(
            "Takeaway orders must be paid before kitchen submission.",
          );
        if (order.paymentStatus !== "UNPAID")
          throw new Error(
            "This order cannot accept additions after payment starts.",
          );
        appendBatch(order, nextId);
      });
    },
    advanceBatch(orderId, batchId) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        const batch = order.batches.find((entry) => entry.id === batchId);
        if (!batch || !["PENDING", "PREPARING"].includes(batch.status))
          throw new Error("This kitchen batch cannot advance.");
        batch.status = batch.status === "PENDING" ? "PREPARING" : "READY";
        for (const item of order.items.filter(
          (entry) => entry.batchId === batchId,
        ))
          item.itemStatus = batch.status;
        updateLifecycle(next, order);
      });
    },
    serveOrder(orderId) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        const batches = order.batches.filter(
          (batch) => batch.status === "READY",
        );
        if (!batches.length) throw new Error("No ready items to serve.");
        for (const batch of batches) {
          batch.status = "SERVED";
          for (const item of order.items.filter(
            (entry) => entry.batchId === batch.id,
          ))
            item.itemStatus = "SERVED";
        }
        updateLifecycle(next, order);
      });
    },
    createEqualSplit(orderId, count) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (paidCents(order) || order.bills.length)
          throw new Error("Equal parts must be created before any payment.");
        order.bills = equalParts(totalCents(order.items), count).map(
          (amount, index) => ({
            id: nextId("bill"),
            label: `Part ${index + 1}`,
            amount: amount / 100,
            paid: false,
          }),
        );
      });
    },
    recordPayment(orderId, input) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        if (next.shift.status !== "OPEN")
          throw new Error("Open a cashier shift before taking payment.");
        if (
          order.paymentStatus === "PAID" ||
          !order.items.length ||
          ["COMPLETED", "CANCELLED"].includes(order.status)
        )
          throw new Error("This order is not payable.");
        if (order.diningMode === "dine-in" && draftItems(order).length)
          throw new Error(
            "Send dine-in draft items to the kitchen before payment.",
          );
        if (kitchenActive(order) && !input.acknowledged)
          throw new Error("Acknowledge that kitchen work is still active.");
        const method = next.paymentMethods.find(
          (entry) => entry.method === input.paymentMethod && entry.available,
        );
        if (!method) throw new Error("Select a payment method.");
        if (
          method.method === "QR" &&
          !method.providers.some(
            (provider) => provider.providerId === input.providerId,
          )
        )
          throw new Error("Select a QR provider.");
        if (method.method === "QR" && !input.qrConfirmed)
          throw new Error("Confirm manual QR verification first.");
        const amountCents = parseCents(input.amount);
        const receivedCents = parseCents(input.receivedAmount || input.amount);
        if (!amountCents || amountCents > remainingCents(order))
          throw new Error(
            "Payment must be positive and cannot exceed the outstanding balance.",
          );
        if (receivedCents === null || receivedCents < amountCents)
          throw new Error("Cash received is insufficient.");
        if (!["FULL", "AMOUNT", "EQUAL", "ITEM"].includes(input.splitType))
          throw new Error("Invalid split type.");
        if (input.splitType === "FULL" && amountCents !== remainingCents(order))
          throw new Error("A full payment must settle the balance.");
        const bill = order.bills.find((entry) => entry.id === input.billId);
        if (
          input.splitType === "EQUAL" &&
          (!bill || bill.paid || cents(bill.amount) !== amountCents)
        )
          throw new Error("Select an unpaid equal part.");
        const allocations = input.allocations || [];
        if (input.splitType === "ITEM") {
          // The production summary attributes quantities only to ITEM payments;
          // any mixed payment is still capped by the order's outstanding total.
          let allocated = 0;
          const seen = new Set();
          for (const allocation of allocations) {
            const item = order.items.find(
              (entry) => entry.id === allocation.orderItemId,
            );
            const already = order.payments
              .flatMap((payment) => payment.allocations || [])
              .filter((entry) => entry.orderItemId === allocation.orderItemId)
              .reduce((sum, entry) => sum + entry.quantity, 0);
            if (
              !item ||
              seen.has(item.id) ||
              !Number.isInteger(allocation.quantity) ||
              allocation.quantity < 1 ||
              allocation.quantity + already > item.quantity
            )
              throw new Error("Invalid item allocation.");
            seen.add(item.id);
            allocated += cents(item.unitPrice) * allocation.quantity;
          }
          if (!allocated || allocated !== amountCents)
            throw new Error("Selected item total does not match payment.");
        }
        const payment = {
          id: nextId("payment"),
          paymentNumber: `PAY-DEMO-${sequence}`,
          paymentMethod: method.method,
          providerId: input.providerId || null,
          paymentReference: String(input.paymentReference || "").slice(0, 150),
          amount: amountCents / 100,
          receivedAmount:
            method.method === "CASH" ? receivedCents / 100 : amountCents / 100,
          changeAmount:
            method.method === "CASH" ? (receivedCents - amountCents) / 100 : 0,
          splitType: input.splitType,
          allocations: copy(allocations),
          shiftId: next.shift.id,
          paidAt: new Date().toISOString(),
        };
        order.payments.push(payment);
        if (input.splitType === "EQUAL") bill.paid = true;
        order.paymentStatus =
          remainingCents(order) === 0 ? "PAID" : "PARTIALLY_PAID";
        if (order.paymentStatus === "PAID") {
          order.receipt = {
            receiptNumber: `RCP-DEMO-${sequence}`,
            issuedAt: new Date().toISOString(),
          };
          if (order.diningMode === "takeaway" && draftItems(order).length)
            appendBatch(order, nextId);
          updateLifecycle(next, order);
        }
        return payment;
      });
    },
    applyVoucher() {
      throw new Error(
        "No mock vouchers are configured. Your total has not changed.",
      );
    },
    tableAction(tableId, action) {
      return commit((next) => {
        const table = next.tables.find((entry) => entry.id === tableId);
        if (!table) throw new Error("Table not found.");
        const transitions = {
          reserve: ["AVAILABLE", "RESERVED"],
          release: ["RESERVED", "AVAILABLE"],
          startCleaning: ["DIRTY", "CLEANING"],
          completeCleaning: ["CLEANING", "AVAILABLE"],
          restore: ["DISABLED", "AVAILABLE"],
        };
        if (action === "disable") {
          if (!["AVAILABLE", "CLEANING"].includes(table.status))
            throw new Error(
              "Only available or cleaning tables can be disabled.",
            );
          table.status = "DISABLED";
          return;
        }
        const transition = transitions[action];
        if (!transition || table.status !== transition[0])
          throw new Error("Invalid table transition.");
        if (action === "completeCleaning" && activeOrder(next, tableId))
          throw new Error("This table still has an active order.");
        table.status = transition[1];
      });
    },
    moveOrder(orderId, tableId) {
      return commit((next) => {
        const order = requireOrder(next, orderId);
        const destination = next.tables.find((entry) => entry.id === tableId);
        if (
          !destination ||
          !["AVAILABLE", "RESERVED"].includes(destination.status) ||
          activeOrder(next, tableId)
        )
          throw new Error("Choose an available destination table.");
        if (
          order.diningMode !== "dine-in" ||
          order.paymentStatus !== "UNPAID" ||
          ["COMPLETED", "CANCELLED"].includes(order.status)
        )
          throw new Error("Only active unpaid dine-in orders can be moved.");
        const source = next.tables.find((entry) => entry.id === order.tableId);
        if (source) source.status = "AVAILABLE";
        order.tableId = tableId;
        destination.status = "OCCUPIED";
      });
    },
    openShift(openingFloat) {
      return commit((next) => {
        if (next.shift.status === "OPEN")
          throw new Error("A cashier shift is already open.");
        if (parseCents(openingFloat) === null)
          throw new Error("Enter a valid opening float.");
        next.shift = {
          id: nextId("shift"),
          shiftNumber: `SHIFT-DEMO-${sequence}`,
          status: "OPEN",
          openingFloat: Number(openingFloat),
          movements: [],
          actualCash: null,
        };
      });
    },
    cashMovement(type, amount, reason) {
      return commit((next) => {
        if (next.shift.status !== "OPEN")
          throw new Error("Open a shift first.");
        if (
          !["CASH_IN", "CASH_OUT", "NO_SALE_DRAWER_OPEN"].includes(type) ||
          !reason.trim()
        )
          throw new Error("A movement type and reason are required.");
        const value = parseCents(amount);
        if (value === null || (type !== "NO_SALE_DRAWER_OPEN" && !value))
          throw new Error("Enter a valid movement amount.");
        next.shift.movements.push({
          id: nextId("movement"),
          type,
          amount: type === "NO_SALE_DRAWER_OPEN" ? 0 : value / 100,
          reason: reason.trim(),
          createdAt: new Date().toISOString(),
        });
      });
    },
    closeShift(actualCash) {
      return commit((next) => {
        if (next.shift.status !== "OPEN" || parseCents(actualCash) === null)
          throw new Error("Enter the actual cash count for the open shift.");
        next.shift.actualCash = Number(actualCash);
        next.shift.status = "CLOSED";
      });
    },
  };
}
