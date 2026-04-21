// src/app/p/[sku]/WishlistButton.tsx
'use client';
import { useState, useEffect } from 'react';
import { toggleWishlist, isWishlisted } from '@/lib/wishlist';
import toast from 'react-hot-toast';

export default function WishlistButton({ sku }: { sku: string }) {
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(isWishlisted(sku));
    const update = () => setSaved(isWishlisted(sku));
    window.addEventListener('wishlist-updated', update);
    return () => window.removeEventListener('wishlist-updated', update);
  }, [sku]);

  const toggle = () => {
    const added = toggleWishlist(sku);
    setSaved(added);
    toast(added ? '♥ Saved to wishlist' : 'Removed from wishlist', { duration: 1800 });
  };

  return (
    <button onClick={toggle} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border transition-all duration-200 text-xs tracking-wide ${
        saved
          ? 'border-brand-orange text-brand-orange bg-orange-50'
          : 'border-brand-light text-brand-gray hover:border-brand-orange hover:text-brand-orange'
      }`}>
      <svg className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
      </svg>
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
