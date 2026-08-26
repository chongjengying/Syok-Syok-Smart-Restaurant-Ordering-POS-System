const paymentMethods = new Set(['CASH', 'CARD', 'QR', 'EWALLET']);
const diningModes = new Set(['dine-in', 'takeaway']);

export function buildCreateOrderInput({ cart, paymentMethod, diningMode, tableId, idempotencyKey }) {
  if (!Array.isArray(cart) || cart.length === 0) throw new Error('The cart is empty.');

  const method = String(paymentMethod || '').toUpperCase();
  if (!paymentMethods.has(method)) throw new Error('The selected payment method is unsupported.');
  if (!diningModes.has(diningMode)) throw new Error('The dining mode is invalid.');
  if (diningMode === 'dine-in' && !tableId) {
    throw new Error('Select an available table before checkout.');
  }

  const items = cart.map((item, index) => {
    const productId = item?.dish?.id;
    if (!productId) throw new Error(`Cart item ${index + 1} has no product ID.`);
    if (item.dish.isActive !== true || item.dish.isAvailable !== true) {
      throw new Error(`Cart item ${index + 1} is unavailable.`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error(`Cart item ${index + 1} has an invalid quantity.`);
    }
    return {
      productId,
      quantity: item.quantity,
      optionIds: (item.selectedOptions || []).map((option) => option.id),
      specialRequest: String(item.specialRequest || '').trim().slice(0, 1000),
    };
  });

  return {
    items,
    paymentMethod: method,
    diningMode,
    tableId: diningMode === 'dine-in' ? tableId : null,
    idempotencyKey: idempotencyKey || null,
  };
}
