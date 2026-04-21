// src/lib/wishlist.ts
const KEY = 'ast3r_wishlist';

export function getWishlist(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function toggleWishlist(sku: string): boolean {
  const list = getWishlist();
  const idx = list.indexOf(sku);
  if (idx > -1) { list.splice(idx, 1); }
  else { list.push(sku); }
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event('wishlist-updated'));
  return idx === -1; // returns true if added
}

export function isWishlisted(sku: string): boolean {
  return getWishlist().includes(sku);
}
