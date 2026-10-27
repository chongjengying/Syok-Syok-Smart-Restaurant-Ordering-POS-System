import { money, parseMoney } from "./previewMoney.js";

export const dateKey = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function inPeriod(value, range = "Today", from = "", to = "") {
  if (range === "All time") return true;
  if (!value) return false;
  const day = dateKey(value),
    today = dateKey(Date.now());
  if (range === "Today") return day === today;
  if (range === "Custom range")
    return (!from || day >= from) && (!to || day <= to);
  const start = dateKey(
    Date.now() - (range === "Last 30 days" ? 29 : 6) * 86400000,
  );
  return day >= start && day <= today;
}
export const recordBranch = (row, modules) =>
  row.Branch ||
  row["Branch / terminal"]?.split(" · ")[0] ||
  modules.orders.find((order) => order.Order === row.Order)?.Branch;
export const productAvailable = (product, branch) =>
  !product._archived &&
  product.Status === "Available" &&
  (product._allBranches !== false ||
    (product._branches || []).includes(branch));

export function resolveOrderLine(product, choices = []) {
  const selected = [],
    seen = new Set();
  for (const group of product._modifiers || []) {
    const options = choices.filter((choice) => choice.groupId === group.id);
    if ((group.required && options.length < 1) || options.length > group.max)
      return {
        error: `Choose ${group.required ? "at least one and " : ""}up to ${group.max} option(s) for ${group.name}.`,
      };
    for (const choice of options) {
      const option = group.options.find((item) => item.id === choice.optionId);
      const key = `${group.id}:${choice.optionId}`;
      if (!option || seen.has(key))
        return { error: "Choose valid, unique item options." };
      seen.add(key);
      selected.push({
        groupId: group.id,
        optionId: option.id,
        name: `${group.name}: ${option.name}`,
        priceCents: option.priceCents,
      });
    }
  }
  if (selected.length !== choices.length)
    return { error: "An item option is no longer available." };
  return {
    modifiers: selected,
    priceCents:
      parseMoney(product.Price) +
      selected.reduce((sum, option) => sum + option.priceCents, 0),
  };
}

export function financialSummary(
  modules,
  branch,
  range = "Today",
  from = "",
  to = "",
) {
  const belongs = (row) =>
    branch === "All branches" || recordBranch(row, modules) === branch;
  const orders = modules.orders.filter(
    (row) => belongs(row) && inPeriod(row._createdAt, range, from, to),
  );
  const payments = modules.payments.filter(
    (row) =>
      belongs(row) &&
      row.Status !== "Failed" &&
      inPeriod(row._createdAt, range, from, to),
  );
  const total = payments.reduce((sum, row) => sum + parseMoney(row.Amount), 0);
  const refundEvents = modules.payments
    .filter(belongs)
    .flatMap((row) =>
      (
        row._refundEvents ||
        (row._refundedCents
          ? [{ amount: row._refundedCents, at: row._createdAt }]
          : [])
      )
        .filter((event) => inPeriod(event.at, range, from, to))
        .map((event) => ({ ...event, method: row.Method })),
    );
  const refunds = refundEvents.reduce((sum, event) => sum + event.amount, 0);
  const settled = payments
    .map((payment) => modules.orders.find((row) => row.Order === payment.Order))
    .filter(Boolean);
  const discounts = settled.reduce(
    (sum, row) => sum + (row._discountCents || 0),
    0,
  );
  const tax = settled.reduce((sum, row) => sum + (row._taxCents || 0), 0);
  const service = settled.reduce(
    (sum, row) => sum + (row._serviceCents || 0),
    0,
  );
  const gross = total + discounts - tax - service;
  const items = new Map();
  settled.forEach((order) =>
    (order._items || []).forEach((item) => {
      const key = item.productId;
      const current = items.get(key) || {
        productId: key,
        name: item.name,
        category:
          modules.products.find((row) => row._id === key)?.Category ||
          "Menu item",
        quantity: 0,
        sales: 0,
      };
      current.quantity += item.quantity;
      current.sales += item.priceCents * item.quantity;
      items.set(key, current);
    }),
  );
  const tenderTotals = payments.reduce((totals, row) => {
    totals[row.Method] = (totals[row.Method] || 0) + parseMoney(row.Amount);
    return totals;
  }, {});
  refundEvents.forEach((event) => {
    tenderTotals[event.method] =
      (tenderTotals[event.method] || 0) - event.amount;
  });
  const tenders = Object.entries(tenderTotals);
  return {
    orders,
    payments,
    gross,
    discounts,
    tax,
    service,
    refunds,
    net: total - refunds,
    collected: total,
    settledCount: payments.length,
    aov: payments.length ? Math.round(total / payments.length) : 0,
    topItems: [...items.values()].sort(
      (a, b) => b.quantity - a.quantity || b.sales - a.sales,
    ),
    tenders,
  };
}

export function reportRows(modules, branches, range, from, to) {
  return branches.map((branch) => {
    const summary = financialSummary(modules, branch.name, range, from, to);
    return {
      _id: `report-${branch.id}`,
      Branch: branch.name,
      "Gross sales": money(summary.gross),
      Discounts: money(summary.discounts),
      Refunds: money(summary.refunds),
      Tax: money(summary.tax),
      "Service charge": money(summary.service),
      "Net sales": money(summary.net),
      Orders: String(summary.orders.length),
      "Avg. order": money(summary.aov),
    };
  });
}
