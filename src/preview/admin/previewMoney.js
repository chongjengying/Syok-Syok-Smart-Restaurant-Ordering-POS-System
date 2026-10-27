export const money = (cents) =>
  new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(
    cents / 100,
  );
export function parseMoney(value, allowNegative = false) {
  const text = String(value ?? "").replace(/RM|MYR|,|\s/g, "");
  const negative = text.startsWith("-");
  if (negative && !allowNegative) return NaN;
  const unsigned = negative ? text.slice(1) : text;
  if (!/^\d+(?:\.\d{1,2})?$/.test(unsigned)) return NaN;
  const [whole, decimals = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : NaN;
}
