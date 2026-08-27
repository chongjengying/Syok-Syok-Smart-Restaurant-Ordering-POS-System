export function formatMoney(value: number | string | null | undefined, currencyCode = 'MYR', decimalPlaces = 2, currencySymbol = ''): string {
  const amount = Number(value);
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  try {
    if (currencySymbol.trim()) return `${currencySymbol.trim()} ${new Intl.NumberFormat('en-MY', { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(normalizedAmount)}`;
    return new Intl.NumberFormat('en-MY', { style: 'currency', currency: currencyCode, minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(normalizedAmount);
  } catch {
    return `${currencySymbol.trim() || currencyCode} ${normalizedAmount.toFixed(decimalPlaces)}`;
  }
}
