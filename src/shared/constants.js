// Shared domain constants used by UI and feature modules.
export const TABLE_STATUSES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  RESERVED: 'RESERVED',
  CLEANING: 'CLEANING',
  DISABLED: 'DISABLED',
});

export const PAYMENT_METHODS = Object.freeze({
  CASH: 'CASH',
  CARD: 'CARD',
  QR: 'QR',
  EWALLET: 'EWALLET',
});

export const ORDER_STATUSES = Object.freeze([
  'DRAFT', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED',
]);
