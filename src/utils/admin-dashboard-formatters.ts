import { ADMIN_DASHBOARD_CONFIG } from '../config/admin-dashboard';

export const formatCurrency = (value: unknown) => new Intl.NumberFormat('en-MY', {
  style: 'currency', currency: ADMIN_DASHBOARD_CONFIG.currency, minimumFractionDigits: 2,
}).format(Number(value || 0));

export const formatNumber = (value: unknown) => new Intl.NumberFormat('en-MY').format(Number(value || 0));

export const formatPercent = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric >= 0 ? '+' : ''}${numeric.toFixed(1)}%` : 'No comparison';
};

const dateFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: ADMIN_DASHBOARD_CONFIG.timezone, day: '2-digit', month: 'short', year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('en-MY', {
  timeZone: ADMIN_DASHBOARD_CONFIG.timezone, hour: '2-digit', minute: '2-digit', hour12: true,
});

export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
export const formatTime = (value: string | Date) => timeFormatter.format(new Date(value));
export const formatDateTime = (value: string | Date) => `${formatDate(value)}, ${formatTime(value)}`;

export const humanizeCode = (value: unknown) => String(value || '')
  .replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
