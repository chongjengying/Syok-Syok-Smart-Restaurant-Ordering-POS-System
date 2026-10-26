import test from "node:test";
import assert from "node:assert/strict";
import { createMockPosService } from "../services/mockPosService.js";
import {
  equalParts,
  parseCents,
  totalCents,
  remainingCents,
} from "../services/previewMoney.js";
import {
  generateMockReport,
  businessDate,
} from "../services/mockReportService.js";

const order = (service, id) =>
  service.getSnapshot().orders.find((entry) => entry.id === id);
function start(service, mode = "dine-in") {
  return service.openOrder(mode, mode === "dine-in" ? "table-1" : null).id;
}
function add(service, id, productId = "nasi", quantity = 1, extra = {}) {
  return service.saveItem(id, {
    productId,
    quantity,
    optionIds: productId === "nasi" ? { spice: ["mild"] } : {},
    specialRequest: "",
    serviceMode: "DINE_IN",
    ...extra,
  });
}
function pay(service, id, extra = {}) {
  const amount = (remainingCents(order(service, id)) / 100).toFixed(2);
  return service.recordPayment(id, {
    paymentMethod: "CASH",
    splitType: "FULL",
    amount,
    receivedAmount: amount,
    acknowledged: true,
    ...extra,
  });
}

test("occupied tables reopen existing orders; restricted table states cannot open", () => {
  const service = createMockPosService();
  assert.deepEqual(service.openOrder("dine-in", "table-3"), {
    id: "order-1042",
    existing: true,
  });
  for (const id of ["table-8", "table-10", "table-12"])
    assert.throws(
      () => service.openOrder("dine-in", id),
      /available or occupied/,
    );
  assert.throws(() => service.openOrder("dine-in"), /Select/);
});

test("canonical product options and price, quantity bounds, trimmed notes and atomic failure", () => {
  const service = createMockPosService(),
    id = start(service);
  const before = service.getSnapshot();
  assert.throws(
    () => add(service, id, "nasi", 1, { optionIds: {} }),
    /selections/,
  );
  assert.equal(service.getSnapshot(), before);
  assert.throws(() => add(service, id, "nasi", 100), /1 to 99/);
  assert.throws(
    () => add(service, id, "nasi", 1, { optionIds: { spice: ["fake"] } }),
    /Invalid product option/,
  );
  add(service, id, "nasi", 2, {
    specialRequest: `  ${"a".repeat(1200)}  `,
    unitPrice: 0,
  });
  assert.equal(order(service, id).items[0].specialRequest.length, 1000);
  assert.equal(totalCents(order(service, id).items), 1980);
});

test("draft changes remove at zero, cap at 99, and discard releases table", () => {
  const service = createMockPosService(),
    id = start(service),
    itemId = add(service, id, "fries", 99);
  service.changeQuantity(id, itemId, 1);
  assert.equal(order(service, id).items[0].quantity, 99);
  service.changeQuantity(id, itemId, -99);
  assert.equal(order(service, id).items.length, 0);
  service.discardDraft(id);
  assert.equal(
    service.getSnapshot().tables.find((table) => table.id === "table-1").status,
    "AVAILABLE",
  );
});

test("dine-in requires submission; add-ons create batches without resending or editing old items", () => {
  const service = createMockPosService(),
    id = start(service),
    itemId = add(service, id);
  assert.throws(() => pay(service, id), /Send dine-in draft/);
  service.submitOrder(id);
  assert.equal(order(service, id).batches.length, 1);
  assert.throws(() => service.changeQuantity(id, itemId, 1), /Only draft/);
  assert.throws(
    () =>
      service.saveItem(
        id,
        {
          productId: "nasi",
          quantity: 1,
          optionIds: { spice: ["mild"] },
          serviceMode: "DINE_IN",
        },
        itemId,
      ),
    /Submitted/,
  );
  add(service, id, "tea");
  service.submitOrder(id);
  assert.deepEqual(
    order(service, id).batches.map((batch) => batch.batchNo),
    [1, 2],
  );
  assert.notEqual(
    order(service, id).items[0].batchId,
    order(service, id).items[1].batchId,
  );
  assert.throws(() => service.submitOrder(id), /at least one/);
});

test("takeaway remains a draft through partial payment and submits only on full settlement", () => {
  const service = createMockPosService(),
    id = start(service, "takeaway");
  add(service, id, "coffee", 2, { serviceMode: "TAKEAWAY" });
  service.setPackaging(id, ["PAPER_BAG", "CUTLERY"]);
  assert.throws(() => service.submitOrder(id), /paid before/);
  pay(service, id, {
    splitType: "AMOUNT",
    amount: "7.00",
    receivedAmount: "10.00",
  });
  assert.equal(order(service, id).batches.length, 0);
  assert.equal(order(service, id).paymentStatus, "PARTIALLY_PAID");
  assert.throws(() => service.discardDraft(id), /partially paid/);
  assert.throws(() => add(service, id, "tea"), /after payment/);
  pay(service, id);
  assert.equal(order(service, id).paymentStatus, "PAID");
  assert.equal(order(service, id).batches.length, 1);
  assert.ok(order(service, id).receipt);
  assert.deepEqual(order(service, id).takeawayPackaging, [
    "PAPER_BAG",
    "CUTLERY",
  ]);
});

test("early payment requires acknowledgment and retains occupied table until fulfilled", () => {
  const service = createMockPosService(),
    id = start(service);
  add(service, id);
  service.submitOrder(id);
  assert.throws(() => pay(service, id, { acknowledged: false }), /Acknowledge/);
  pay(service, id);
  const tableStatus = () =>
    service.getSnapshot().tables.find((table) => table.id === "table-1").status;
  assert.equal(tableStatus(), "OCCUPIED");
  const batch = order(service, id).batches[0].id;
  service.advanceBatch(id, batch);
  service.advanceBatch(id, batch);
  service.serveOrder(id);
  assert.equal(order(service, id).status, "COMPLETED");
  assert.equal(tableStatus(), "DIRTY");
  assert.throws(
    () => service.tableAction("table-1", "completeCleaning"),
    /Invalid table/,
  );
  service.tableAction("table-1", "startCleaning");
  service.tableAction("table-1", "completeCleaning");
  assert.equal(tableStatus(), "AVAILABLE");
});

test("cash, QR provider/manual verification, overpayment and repeat-payment validation", () => {
  const service = createMockPosService(),
    id = start(service, "takeaway");
  add(service, id, "coffee");
  assert.throws(
    () => pay(service, id, { receivedAmount: "1.00" }),
    /insufficient/,
  );
  assert.throws(
    () => pay(service, id, { amount: "100.00", receivedAmount: "100.00" }),
    /exceed/,
  );
  assert.throws(() => pay(service, id, { paymentMethod: "QR" }), /provider/);
  assert.throws(
    () =>
      pay(service, id, {
        paymentMethod: "QR",
        providerId: "mock-qr",
        qrConfirmed: false,
      }),
    /manual/,
  );
  const payment = pay(service, id, {
    paymentMethod: "QR",
    providerId: "mock-qr",
    qrConfirmed: true,
  });
  assert.equal(payment.changeAmount, 0);
  assert.throws(() => pay(service, id), /not payable/);
});

test("money parsing and equal splits preserve every cent with last-part remainder", () => {
  assert.deepEqual(equalParts(1000, 3), [333, 333, 334]);
  assert.equal(
    equalParts(1700, 3).reduce((sum, value) => sum + value),
    1700,
  );
  assert.equal(parseCents("1.999"), null);
  assert.equal(parseCents("-1"), null);
  assert.equal(parseCents("12.90"), 1290);
  assert.throws(() => equalParts(1000, 11), /2 to 10/);
  const service = createMockPosService(),
    id = start(service, "takeaway");
  add(service, id, "coffee", 2);
  service.createEqualSplit(id, 3);
  const bills = order(service, id).bills;
  for (const bill of bills)
    pay(service, id, {
      splitType: "EQUAL",
      billId: bill.id,
      amount: bill.amount.toFixed(2),
      receivedAmount: bill.amount.toFixed(2),
    });
  assert.equal(order(service, id).paymentStatus, "PAID");
});

test("item splits attribute quantities once and permit mixed payments within outstanding cap", () => {
  const service = createMockPosService(),
    id = start(service, "takeaway"),
    itemId = add(service, id, "coffee", 2);
  pay(service, id, {
    splitType: "ITEM",
    amount: "8.50",
    receivedAmount: "10.00",
    allocations: [{ orderItemId: itemId, quantity: 1 }],
  });
  assert.equal(order(service, id).payments[0].changeAmount, 1.5);
  assert.throws(
    () =>
      pay(service, id, {
        splitType: "ITEM",
        amount: "8.50",
        receivedAmount: "8.50",
        allocations: [{ orderItemId: itemId, quantity: 2 }],
      }),
    /allocation/,
  );
  pay(service, id, {
    splitType: "AMOUNT",
    amount: "1.00",
    receivedAmount: "1.00",
  });
  assert.throws(
    () =>
      pay(service, id, {
        splitType: "ITEM",
        amount: "8.50",
        receivedAmount: "8.50",
        allocations: [{ orderItemId: itemId, quantity: 1 }],
      }),
    /exceed/,
  );
  pay(service, id);
  assert.equal(remainingCents(order(service, id)), 0);
});

test("table operations, movement and empty vouchers preserve data", () => {
  const service = createMockPosService();
  service.tableAction("table-1", "reserve");
  assert.throws(() => start(service), /available or occupied/);
  service.tableAction("table-1", "release");
  const id = start(service);
  add(service, id);
  service.submitOrder(id);
  service.moveOrder(id, "table-10");
  assert.equal(order(service, id).tableId, "table-10");
  assert.equal(
    service.getSnapshot().tables.find((table) => table.id === "table-1").status,
    "AVAILABLE",
  );
  const previous = service.getSnapshot();
  assert.throws(() => service.applyVoucher(id, "FREE"), /No mock vouchers/);
  assert.equal(service.getSnapshot(), previous);
});

test("shift gating, reason validation and new shift lifecycle remain local", () => {
  const service = createMockPosService();
  assert.throws(() => service.cashMovement("CASH_IN", "10.00", ""), /reason/);
  service.cashMovement("CASH_OUT", "10.00", "Mock supplies");
  service.closeShift("207.00");
  assert.throws(() => start(service), /Open a cashier shift/);
  service.openShift("100.00");
  assert.equal(service.getSnapshot().shift.openingFloat, 100);
  assert.equal(service.getSnapshot().shift.movements.length, 0);
});

test("reports derive mock payment records and date filtering, with no backend", () => {
  const service = createMockPosService(),
    today = businessDate();
  const report = generateMockReport(
    service.getSnapshot(),
    "daily-sales",
    today,
    today,
  );
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].at(-1), "RM 17.00");
  const empty = generateMockReport(
    service.getSnapshot(),
    "payments",
    "2000-01-01",
    "2000-01-02",
  );
  assert.equal(empty.rows.length, 0);
});
