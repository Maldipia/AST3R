// src/lib/cart.ts
// Global cart utilities - sessionStorage based

export type CartItem = {
  sku:       string;
  name:      string;
  price:     number;
  image_url: string;
  quantity:  number;
  size?:     string;
};

const CART_KEY = 'ast3r_cart';

export function getCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCart(items: CartItem[]) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('cart-updated'));
}

export function addToCart(item: Omit<CartItem, 'quantity'> & { quantity?: number }) {
  const cart  = getCart();
  const key   = item.sku + (item.size ? '-' + item.size : '');
  const idx   = cart.findIndex(c => c.sku === item.sku && c.size === item.size);
  if (idx >= 0) {
    cart[idx].quantity += item.quantity ?? 1;
  } else {
    cart.push({ ...item, quantity: item.quantity ?? 1 });
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(sku: string, size?: string) {
  const cart = getCart().filter(c => !(c.sku === sku && c.size === size));
  saveCart(cart);
  return cart;
}

export function updateQty(sku: string, size: string | undefined, qty: number) {
  const cart = getCart().map(c =>
    c.sku === sku && c.size === size ? { ...c, quantity: qty } : c
  ).filter(c => c.quantity > 0);
  saveCart(cart);
  return cart;
}

export function clearCart() {
  saveCart([]);
}

export function cartTotal(cart: CartItem[]) {
  return cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function cartCount(cart: CartItem[]) {
  return cart.reduce((sum, i) => sum + i.quantity, 0);
}
