import type { CartItem, CartPreviewTotals } from '../types/cart';

export const CART_QUANTITY_MIN = 1;
export const CART_QUANTITY_MAX = 99;
export const CART_NOTE_MAX_LENGTH = 1000;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function changeCartItemQuantity(cart: CartItem[], index: number, delta: number): CartItem[] {
  if (!Number.isInteger(index) || !Number.isInteger(delta) || delta === 0) return cart;
  return cart.flatMap((item, itemIndex) => {
    if (itemIndex !== index) return [item];
    const quantity = Math.min(CART_QUANTITY_MAX, item.quantity + delta);
    return quantity > 0 ? [{ ...item, quantity }] : [];
  });
}

export function removeCartItem(cart: CartItem[], index: number): CartItem[] {
  return cart.filter((_item, itemIndex) => itemIndex !== index);
}

export function normalizeCartNote(note: unknown): string {
  return String(note || '').trim().slice(0, CART_NOTE_MAX_LENGTH);
}

export function getCartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartItemPreviewTotal(item: CartItem): number {
  return roundCurrency(item.finalPrice * item.quantity);
}

/** Display-only estimate. Order placement recalculates every value in PostgreSQL. */
export function calculateCartPreviewTotals(cart: CartItem[]): CartPreviewTotals {
  const subtotal = roundCurrency(cart.reduce((sum, item) => sum + getCartItemPreviewTotal(item), 0));
  const tax = roundCurrency(subtotal * 0.06);
  const serviceCharge = roundCurrency(subtotal * 0.10);
  return { subtotal, tax, serviceCharge, total: roundCurrency(subtotal + tax + serviceCharge) };
}
