import { useCallback, useMemo, useState } from 'react';
import {
  calculateCartPreviewTotals,
  changeCartItemQuantity,
  removeCartItem,
} from '../services/cart.service';
import type { CartItem } from '../types/cart';

export function useCart() {
  const [cart, setCart] = useState<CartItem[]>([]);

  const saveItem = useCallback((item: CartItem, index = -1) => {
    setCart((current) => {
      if (index < 0) return [...current, item];
      if (index >= current.length) return current;
      return current.map((entry, entryIndex) => (entryIndex === index ? item : entry));
    });
  }, []);

  const changeQuantity = useCallback((index: number, delta: number) => {
    setCart((current) => changeCartItemQuantity(current, index, delta));
  }, []);

  const removeItem = useCallback((index: number) => {
    setCart((current) => removeCartItem(current, index));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const replaceCart = useCallback((items: CartItem[]) => setCart(items), []);

  const previewTotals = useMemo(() => calculateCartPreviewTotals(cart), [cart]);

  return {
    cart,
    previewTotals,
    saveItem,
    changeQuantity,
    removeItem,
    clearCart,
    replaceCart,
  };
}
