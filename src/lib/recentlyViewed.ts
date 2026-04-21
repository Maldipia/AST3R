// src/lib/recentlyViewed.ts
const KEY = 'ast3r_recently_viewed';
const MAX = 6;

export interface ViewedProduct {
  sku: string; name: string; price: number;
  compare_price?: number | null; image_url?: string; category: string;
}

export function addRecentlyViewed(p: ViewedProduct) {
  if (typeof window === 'undefined') return;
  try {
    const list: ViewedProduct[] = JSON.parse(localStorage.getItem(KEY) || '[]');
    const filtered = list.filter(x => x.sku !== p.sku);
    filtered.unshift(p);
    localStorage.setItem(KEY, JSON.stringify(filtered.slice(0, MAX)));
  } catch {}
}

export function getRecentlyViewed(): ViewedProduct[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
