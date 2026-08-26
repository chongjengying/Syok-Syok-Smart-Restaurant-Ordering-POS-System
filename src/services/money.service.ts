export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value);
  return `RM ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}
