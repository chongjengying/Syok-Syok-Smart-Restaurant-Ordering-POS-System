const DECIMAL_AMOUNT = /^\d+(?:\.\d{1,2})?$/;

export function parseMoneyToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!DECIMAL_AMOUNT.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('A non-negative integer cent value is required.');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function splitCentsEqually(totalCents, parts) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('A non-negative integer cent total is required.');
  if (!Number.isInteger(parts) || parts < 2 || parts > 10) throw new Error('Split count must be from 2 to 10.');
  const base = Math.floor(totalCents / parts);
  return Array.from({ length: parts }, (_, index) => (
    index === parts - 1 ? totalCents - base * (parts - 1) : base
  ));
}

export function selectedItemTotalCents(items, quantities) {
  return items.reduce((sum, item) => {
    const quantity = Number(quantities[item.orderItemId] || 0);
    const unitAmounts = Array.isArray(item.remainingUnitAmounts) ? item.remainingUnitAmounts : [];
    return sum + unitAmounts.slice(0, quantity).reduce(
      (itemSum, value) => itemSum + (parseMoneyToCents(value) || 0),
      0,
    );
  }, 0);
}
