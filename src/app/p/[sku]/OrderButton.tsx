// src/app/p/[sku]/OrderButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter }  from 'next/navigation';
import toast          from 'react-hot-toast';
import { addToCart }  from '@/lib/cart';

interface Props {
  sku:        string;
  name:       string;
  price:      number;
  salePrice?: number | null;
  imageUrl:   string;
  inStock:    boolean;
  sizes?:     { size: string; quantity: number }[];
}

export default function OrderButton({ sku, name, price, salePrice, imageUrl, inStock, sizes = [] }: Props) {
  const router = useRouter();

  // Auto-select the only available size
  const availableSizes = sizes.filter(s => s.quantity > 0);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    availableSizes.length === 1 ? availableSizes[0].size : undefined
  );

  const checkoutPrice = salePrice && salePrice < price ? salePrice : price;
  const hasSizes      = sizes.length > 0;
  const selectedStock = hasSizes && selectedSize
    ? (sizes.find(s => s.size === selectedSize)?.quantity ?? 0)
    : (inStock ? 99 : 0);
  const canOrder = inStock && (!hasSizes || (!!selectedSize && selectedStock > 0));
  const sizeNotChosen = hasSizes && !selectedSize;

  // Meta Pixel tracking
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_ids: [sku], content_type: 'product',
        value: checkoutPrice, currency: 'PHP', content_name: name,
      });
    }
  }, []);

  const handleAddToCart = () => {
    if (!inStock) { toast.error('This item is out of stock.'); return; }
    if (hasSizes && !selectedSize) {
      toast.error('Please select your size to continue.', { duration: 2500 });
      // Shake the size selector
      const el = document.getElementById('size-selector');
      if (el) { el.classList.add('ring-2','ring-brand-orange','ring-offset-1'); setTimeout(() => el.classList.remove('ring-2','ring-brand-orange','ring-offset-1'), 1800); }
      return;
    }
    if (hasSizes && selectedStock <= 0) { toast.error('Selected size is currently out of stock.'); return; }
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selectedSize });
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'AddToCart', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    }
    toast.success(`Added to cart${selectedSize ? ' — Size ' + selectedSize : ''}`, { duration: 2000 });
    window.dispatchEvent(new Event('cart-updated'));
  };

  const handleBuyNow = () => {
    if (!inStock) { toast.error('This item is out of stock.'); return; }
    if (hasSizes && !selectedSize) {
      toast.error('Please select your size to continue.', { duration: 2500 });
      const el = document.getElementById('size-selector');
      if (el) { el.classList.add('ring-2','ring-brand-orange','ring-offset-1'); setTimeout(() => el.classList.remove('ring-2','ring-brand-orange','ring-offset-1'), 1800); }
      return;
    }
    if (!canOrder) { toast.error('Selected size is out of stock.'); return; }
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selectedSize });
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'InitiateCheckout', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    }
    window.dispatchEvent(new Event('cart-updated'));
    router.push('/checkout');
  };

  if (!inStock) return (
    <div className="space-y-3">
      <button disabled className="w-full bg-[#E8E6E2] text-[#A0A09A] py-4 text-sm font-medium tracking-widest uppercase cursor-not-allowed">
        Out of Stock
      </button>
    </div>
  );

  return (
    <div className="space-y-3">

      {/* Size prompt banner — only shown when sizes exist and none selected */}
      {sizeNotChosen && (
        <div className="flex items-center gap-2 bg-[#FFF8F5] border border-brand-orange/30 rounded px-3 py-2">
          <span className="text-brand-orange text-xs">↑</span>
          <p className="text-xs text-brand-orange font-medium tracking-wide">Select a size above before adding to cart</p>
        </div>
      )}

      <button
        onClick={handleAddToCart}
        className={`w-full border py-3.5 text-sm font-medium tracking-widest uppercase transition-all duration-200 ${
          sizeNotChosen
            ? 'border-brand-orange/50 text-brand-orange/70 bg-[#FFF8F5] hover:border-brand-orange hover:text-brand-orange'
            : 'border-brand-black text-brand-black hover:bg-brand-black hover:text-white'
        }`}>
        {sizeNotChosen ? 'Choose Size First' : 'Add to Cart'}
      </button>

      <button
        onClick={handleBuyNow}
        className={`w-full py-3.5 text-sm font-medium tracking-widest uppercase transition-all duration-200 flex items-center justify-center gap-2 ${
          sizeNotChosen
            ? 'bg-brand-orange/20 text-brand-orange/60 cursor-default'
            : 'bg-brand-black text-white hover:bg-brand-orange'
        }`}>
        ORDER NOW
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>

      <p className="text-[11px] text-brand-gray text-center tracking-wide">Free cancellation within 24 hours</p>
    </div>
  );
}
