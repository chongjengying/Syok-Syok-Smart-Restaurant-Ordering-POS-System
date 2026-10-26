// Integer-cent arithmetic. Same accepted decimal shape and equal-split
// remainder rule as the existing services/split-payment.service.js.
export const cents = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100);
export const money = (value) => `RM ${Number(value || 0).toFixed(2)}`;
export function parseCents(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? "").trim())) return null;
  const result = cents(value);
  return Number.isSafeInteger(result) ? result : null;
}
export function equalParts(totalCents, count) {
  if (!Number.isInteger(count) || count < 2 || count > 10)
    throw new Error("Choose 2 to 10 equal parts.");
  const base = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? totalCents - base * (count - 1) : base,
  );
}
export const totalCents = (items) =>
  items.reduce((sum, item) => sum + cents(item.unitPrice) * item.quantity, 0);
export const paidCents = (order) =>
  order.payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
export const remainingCents = (order) =>
  Math.max(0, totalCents(order.items) - paidCents(order));
export const draftItems = (order) =>
  order?.items.filter((item) => item.itemStatus === "DRAFT") || [];
export const sentItems = (order) =>
  order?.items.filter((item) => item.itemStatus !== "DRAFT") || [];
export const kitchenActive = (order) =>
  order.items.some((item) =>
    ["SUBMITTED", "PREPARING", "READY"].includes(item.itemStatus),
  );
