const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Your session has expired. Sign in again to continue.',
  AUTHENTICATION_REQUIRED: 'Your session has expired. Sign in again to continue.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again to continue.',
  ACTIVE_PROFILE_REQUIRED: 'Your staff session is no longer active. Sign in again or contact a manager.',
  TABLE_NOT_AVAILABLE: 'This table is already occupied or unavailable. Refresh the tables and choose another one.',
  ACTIVE_ORDER_EXISTS: 'This table already has an active order. Open the existing table order instead.',
  TABLE_HAS_ACTIVE_ORDER: 'This table already has an active order and cannot be changed yet.',
  TABLE_NOT_AWAITING_CLEANING: 'This table is not ready to start cleaning.',
  DESTINATION_TABLE_NOT_AVAILABLE: 'The destination table is no longer available. Refresh and choose another table.',
  PRODUCT_NOT_AVAILABLE: 'One or more products are no longer available. Remove them from the cart and try again.',
  OPTION_NOT_AVAILABLE: 'A selected product option is no longer available. Review the item and try again.',
  INVALID_ITEM_QUANTITY: 'An item quantity is invalid. Use a whole number between 1 and 99.',
  INVALID_QUANTITY: 'An item quantity is invalid. Use a whole number between 1 and 99.',
  PRICE_CHANGED: 'A product price changed. The updated database price is shown in the final order total.',
  ORDER_CREATION_FAILED: 'The order could not be created. Nothing was charged. Review the order and try again.',
  DRAFT_CREATION_FAILED: 'The order could not be started. Refresh the tables and try again.',
  ORDER_APPEND_FAILED: 'The add-on items could not be added. The existing order was not changed.',
  KITCHEN_START_FAILED: 'The kitchen could not start this order. Refresh the ticket and try again.',
  ORDER_NOT_READY_TO_START: 'This ticket is no longer waiting to start. Refresh the kitchen queue.',
  KITCHEN_UPDATE_FAILED: 'The kitchen status could not be updated. Refresh the ticket and try again.',
  ORDER_TRANSITION_REJECTED: 'The order status could not be changed. Refresh the order and try again.',
  NETWORK_ERROR: 'Cannot reach the POS server. Check the network connection and try again.',
  REQUEST_TIMEOUT: 'The POS server did not respond in time. Check the connection and retry.',
  PAYMENT_PROVIDER_UNAVAILABLE: 'The payment provider did not confirm the payment. Do not retry the charge until its status is checked.',
  PAYMENT_COMPLETION_FAILED: 'The payment could not be recorded. Check the order before trying again.',
  PAYMENT_AMOUNT_MISMATCH: 'The order total changed before payment. Refresh the bill and confirm the updated amount.',
  ORDER_HAS_UNSENT_ITEMS: 'Send or remove all draft items before taking payment.',
  ORDER_ALREADY_PAID: 'This order has already been paid. Refresh the order before taking another payment.',
  PAYMENT_ALREADY_CONFIRMED: 'A payment has already been completed for this order.',
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST: 'This request was already used for different details. Refresh and try again.',
  INVALID_ORDER_TRANSITION: 'The order status changed on another device. Refresh before trying the action again.',
  ORDER_NOT_READY: 'This order is no longer ready for that action. Refresh the list.',
  INSUFFICIENT_PERMISSION: 'Your staff role does not have permission to perform this action.',
  SERVER_ERROR: 'The POS server could not complete the request. Try again or contact support if it continues.',
};

export function getErrorCode(error) {
  if (error && typeof error === 'object' && typeof error.code === 'string') return error.code.toUpperCase();
  return '';
}

export function getUserErrorMessage(error, fallback = 'The operation could not be completed. Please try again.') {
  const code = getErrorCode(error);
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (error && typeof error === 'object' && Number(error.status) === 401) return ERROR_MESSAGES.SESSION_EXPIRED;
  if (error instanceof Error && error.message?.trim()) return error.message.trim();
  return fallback;
}

export function getApiErrorMessage({ code, status, serverMessage }) {
  const normalizedCode = String(code || '').toUpperCase();
  if (ERROR_MESSAGES[normalizedCode]) return ERROR_MESSAGES[normalizedCode];
  if (Number(status) === 401) return ERROR_MESSAGES.SESSION_EXPIRED;
  if (Number(status) >= 500) return ERROR_MESSAGES.SERVER_ERROR;
  return String(serverMessage || '').trim() || 'The request could not be completed. Please try again.';
}

export function getPriceChangeMessage(previewTotal, persistedTotal) {
  const preview = Number(previewTotal);
  const persisted = Number(persistedTotal);
  if (!Number.isFinite(preview) || !Number.isFinite(persisted) || Math.abs(preview - persisted) < 0.01) return '';
  return `A product price changed. The database total is RM ${persisted.toFixed(2)} instead of the RM ${preview.toFixed(2)} preview.`;
}

export { ERROR_MESSAGES };
