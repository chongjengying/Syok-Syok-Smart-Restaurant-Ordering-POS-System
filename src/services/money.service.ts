export function formatMoney(value: number | string | null | undefined, currencyCode = 'MYR', decimalPlaces = 2): string {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currencyCode, minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${currencyCode} ${Number.isFinite(amount) ? amount.toFixed(decimalPlaces) : (0).toFixed(decimalPlaces)}`;
  }
}
