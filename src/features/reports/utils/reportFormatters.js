export function formatReportValue(value, type) {
  if (value == null || value === '') return '—';
  if (type === 'currency') return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(Number(value || 0));
  if (type === 'number') return new Intl.NumberFormat('en-MY', { maximumFractionDigits: 2 }).format(Number(value || 0));
  if (type === 'percent') return `${Number(value || 0).toFixed(2)}%`;
  if (type === 'date') return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-MY');
  if (type === 'datetime') return new Date(value).toLocaleString('en-MY');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
