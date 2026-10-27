import assert from "node:assert/strict";
import {
  dateKey,
  financialSummary,
  inPeriod,
  reportRows,
  resolveOrderLine,
} from "../previewSelectors.js";
const today = new Date().toISOString(),
  yesterday = new Date(Date.now() - 86400000).toISOString();
const product = {
  _id: "p1",
  Product: "Tea",
  Price: "RM 10.00",
  Category: "Drinks",
  _modifiers: [
    {
      id: "size",
      name: "Size",
      required: true,
      max: 1,
      options: [
        { id: "small", name: "Small", priceCents: 0 },
        { id: "large", name: "Large", priceCents: 200 },
      ],
    },
  ],
};
assert(resolveOrderLine(product, []).error);
assert.equal(
  resolveOrderLine(product, [{ groupId: "size", optionId: "large" }])
    .priceCents,
  1200,
);
assert(
  resolveOrderLine(product, [{ groupId: "size", optionId: "unknown" }]).error,
);
assert(
  resolveOrderLine(product, [
    { groupId: "size", optionId: "small" },
    { groupId: "size", optionId: "large" },
  ]).error,
);
const modules = {
  products: [product],
  orders: [
    {
      _id: "o1",
      Order: "#1",
      Branch: "A",
      Status: "Completed",
      Payment: "Paid",
      _createdAt: yesterday,
      _items: [{ productId: "p1", name: "Tea", quantity: 2, priceCents: 1000 }],
    },
    {
      _id: "o2",
      Order: "#2",
      Branch: "A",
      Status: "Completed",
      Payment: "Paid",
      _createdAt: today,
      _taxCents: 60,
      _serviceCents: 0,
      _discountCents: 0,
      _items: [{ productId: "p1", name: "Tea", quantity: 1, priceCents: 1000 }],
    },
    {
      _id: "o3",
      Order: "#3",
      Branch: "B",
      Status: "Preparing",
      Payment: "Unpaid",
      _createdAt: today,
    },
  ],
  payments: [
    {
      Payment: "p1",
      Order: "#1",
      Method: "Cash",
      Status: "Partially refunded",
      Amount: "RM 20.00",
      _createdAt: yesterday,
      _refundedCents: 500,
      _refundEvents: [{ amount: 500, at: today }],
    },
    {
      Payment: "p2",
      Order: "#2",
      Method: "Card",
      Status: "Completed",
      Amount: "RM 10.60",
      _createdAt: today,
    },
  ],
};
const summary = financialSummary(modules, "A");
assert.equal(summary.orders.length, 1);
assert.equal(summary.collected, 1060);
assert.equal(summary.gross, 1000);
assert.equal(summary.refunds, 500);
assert.equal(summary.net, 560);
assert.equal(summary.aov, 1060);
assert.equal(summary.topItems[0].quantity, 1);
assert.deepEqual(Object.fromEntries(summary.tenders), {
  Card: 1060,
  Cash: -500,
});
assert.equal(financialSummary(modules, "B").net, 0);
assert.equal(financialSummary(modules, "All branches").orders.length, 2);
assert.equal(financialSummary(modules, "A", "Last 7 days").net, 2560);
assert.equal(
  financialSummary(modules, "A", "Custom range", "2000-01-01", "2000-12-31")
    .net,
  0,
);
assert.match(
  reportRows(modules, [{ id: "a", name: "A" }], "Today")[0]["Net sales"],
  /RM\s*5\.60/,
);
assert(inPeriod(today, "Today"));
assert(!inPeriod(yesterday, "Today"));
assert(inPeriod(yesterday, "Last 7 days"));
assert.equal(dateKey(today).length, 10);
console.log(
  "VERIFIED PASS: required/limited modifiers, integer-cent prices, branch/date scopes, refunds by refund date, AOV, tender reconciliation, and report totals.",
);
