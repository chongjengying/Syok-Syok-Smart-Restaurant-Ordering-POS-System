export const shiftMoney = value => `RM ${Number(value || 0).toFixed(2)}`;
export const shiftDate = value => value ? new Date(value).toLocaleString() : '-';
export function shiftDuration(opened, closed, now = Date.now()) {
  const minutes = Math.max(0, Math.floor(((closed ? new Date(closed).getTime() : now) - new Date(opened).getTime()) / 60000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function shiftVariance(value) {
  if (value == null) return 'Pending close';
  if (Number(value) === 0) return 'Balanced';
  return `${Number(value) < 0 ? 'Short' : 'Over'} by ${shiftMoney(Math.abs(Number(value)))}`;
}
export function shiftError(error) {
  const message = String(error?.message || error || 'Unable to complete shift action.');
  const reasons = {
    SHIFT_ALREADY_OPEN: 'An active shift already exists on this terminal.',
    ACTIVE_CASHIER_SHIFT_REQUIRED: 'Open a shift on this terminal before recording transactions.',
    DEVICE_NOT_AUTHENTICATED: 'This device is not actively bound to the terminal.',
    ACTIVE_STAFF_SESSION_REQUIRED: 'Sign in with an active staff PIN on this terminal.',
    SHIFT_ALREADY_CLOSED: 'This shift is already closed.',
    SHIFT_NOT_FOUND: 'This shift is unavailable in your company, branch or terminal.',
    INSUFFICIENT_PERMISSION: 'Your role does not have permission for this action.',
    INVALID_CASH_MOVEMENT: 'Enter a positive amount and a reason. Drawer openings must have zero amount.',
    INVALID_OPENING_FLOAT: 'Opening cash must be between RM 0 and RM 100,000.',
    INVALID_ACTUAL_CASH: 'Actual cash must be between RM 0 and RM 1,000,000.',
    IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST: 'This request was already used for a different cash movement.',
  };
  return Object.entries(reasons).find(([code]) => message.includes(code))?.[1] || message;
}
