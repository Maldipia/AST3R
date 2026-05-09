// src/app/p/[sku]/OrderButton.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { addToCart } from '@/lib/cart';
import { formatPrice } from '@/lib/utils';

interface SizeOption { size: string; quantity: number; }

interface Props {
  sku: string; name: string; price: number;
  salePrice?: number | null; imageUrl: string;
  inStock: boolean; sizes?: SizeOption[];
}

export default function OrderButton({ sku, name, price, salePrice, imageUrl, inStock, sizes = [] }: Props) {
  const router = useRouter();
  const available = sizes.filter(s => s.quantity > 0);
  const [selected, setSelected] = useState<string | undefined>(
    available.length === 1 ? available[0].size : undefined
  );
  const [pulse, setPulse] = useState(false);
  const [stickyVisible, setStickyVisible] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const checkoutPrice = salePrice && salePrice < price ? salePrice : price;
  const hasSizes = sizes.length > 0;
  const selStock = hasSizes && selected ? (sizes.find(s => s.size === selected)?.quantity ?? 0) : (inStock ? 99 : 0);
  const canOrder = inStock && (!hasSizes || (!!selected && selStock > 0));

  // Show sticky bar when main buttons scroll out of view
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-80px 0px 0px 0px' }
    );
    if (buttonRef.current) obs.observe(buttonRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).fbq)
      (window as any).fbq('track', 'ViewContent', { content_ids: [sku], content_type: 'product', value: checkoutPrice, currency: 'PHP' });
  }, []);

  const nudgeSizes = () => {
    setPulse(true);
    setTimeout(() => setPulse(false), 700);
    const el = document.getElementById('size-picker');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('👆 Choose your size first', { duration: 2000, icon: '' });
  };

  const doAdd = () => {
    if (!inStock) return;
    if (hasSizes && !selected) { nudgeSizes(); return; }
    if (hasSizes && selStock <= 0) { toast.error('That size is out of stock'); return; }
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selected });
    if (typeof window !== 'undefined' && (window as any).fbq)
      (window as any).fbq('track', 'AddToCart', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    toast.success(`✓ Added${selected ? ` — Size ${selected}` : ''}`, { duration: 2200 });
    window.dispatchEvent(new Event('cart-updated'));
  };

  const doBuy = () => {
    if (!inStock) return;
    if (hasSizes && !selected) { nudgeSizes(); return; }
    if (!canOrder) return;
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selected });
    if (typeof window !== 'undefined' && (window as any).fbq)
      (window as any).fbq('track', 'InitiateCheckout', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    window.dispatchEvent(new Event('cart-updated'));
    router.push('/checkout');
  };

  if (!inStock) return (
    <div className="space-y-2">
      <button disabled className="w-full py-4 bg-[#E8E6E2] text-[#A0A09A] text-xs tracking-[0.25em] uppercase font-medium cursor-not-allowed">
        Out of Stock
      </button>
      <p className="text-[11px] text-center text-brand-gray">Join our waitlist — DM @ast3r.ph</p>
    </div>
  );

  return (
    <>
      {/* ── MAIN BUTTONS (inline) ── */}
      <div ref={buttonRef} id="order-buttons" className="space-y-2.5">
        {hasSizes && (
          <div id="size-picker" className={`mb-4 transition-all duration-300 ${pulse ? 'ring-2 ring-brand-orange ring-offset-2 rounded' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] tracking-[0.25em] uppercase font-medium text-brand-gray">
                {selected ? `Size: ${selected}` : 'Select Size'}
              </p>
              {!selected && <span className="text-[10px] text-brand-orange animate-pulse">Required ↑</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => {
                const sold = s.quantity <= 0;
                const isSelected = selected === s.size;
                return (
                  <button key={s.size} disabled={sold}
                    onClick={() => setSelected(isSelected ? undefined : s.size)}
                    className={`relative px-3 py-2 min-w-[52px] text-xs font-medium transition-all duration-150 border
                      ${sold ? 'border-[#D4D4CF] text-[#C0C0BA] line-through cursor-not-allowed'
                      : isSelected ? 'border-brand-black bg-brand-black text-white shadow-sm'
                      : 'border-[#D4D4CF] text-brand-black hover:border-brand-black'}`}>
                    {s.size}
                    {!sold && s.quantity <= 3 && (
                      <span className={`block text-[9px] mt-0.5 ${isSelected ? 'text-orange-300' : 'text-brand-orange'}`}>
                        {s.quantity} left
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button onClick={doBuy}
          className={`w-full py-4 text-xs tracking-[0.25em] uppercase font-medium transition-all duration-200 flex items-center justify-center gap-2
            ${canOrder ? 'bg-brand-black text-white hover:bg-brand-orange' : 'bg-[#E8E6E2] text-[#A0A09A] cursor-default'}`}>
          {!selected && hasSizes ? 'Choose Size to Order' : 'Order Now'}
          {canOrder && (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
          )}
        </button>

        <button onClick={doAdd}
          className={`w-full py-3.5 text-xs tracking-[0.25em] uppercase font-medium transition-all duration-200 border
            ${canOrder ? 'border-brand-black text-brand-black hover:bg-brand-cream' : 'border-[#D4D4CF] text-[#A0A09A] cursor-default'}`}>
          {!selected && hasSizes ? '↑ Select Size First' : 'Add to Cart'}
        </button>

        <p className="text-[11px] text-brand-gray text-center pt-1">Free cancellation within 24 hours</p>
      </div>

      {/* ── STICKY BOTTOM BAR (mobile only, shows when buttons scroll out of view) ── */}
      <div className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E8E6E2] transition-transform duration-300 ${
        stickyVisible ? 'translate-y-0' : 'translate-y-full'
      }`} style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
        <div className="px-4 py-3 flex items-center gap-3">
          {/* Price */}
          <div className="flex-shrink-0">
            {salePrice && salePrice < price ? (
              <div>
                <p className="font-serif text-[15px] font-medium text-brand-black leading-none">{formatPrice(salePrice)}</p>
                <p className="text-[10px] text-brand-gray line-through">{formatPrice(price)}</p>
              </div>
            ) : (
              <p className="font-serif text-[15px] font-medium text-brand-black">{formatPrice(price)}</p>
            )}
          </div>

          {/* Size selector in sticky bar (compact) */}
          {hasSizes && !selected && (
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-1.5">
                {sizes.filter(s => s.quantity > 0).map(s => (
                  <button key={s.size} onClick={() => setSelected(s.size)}
                    className="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-medium border border-[#D4D4CF] hover:border-brand-black transition-colors">
                    {s.size}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasSizes && selected && (
            <button onClick={() => setSelected(undefined)}
              className="flex-1 text-left text-xs text-brand-gray border border-[#E8E6E2] px-3 py-1.5">
              Size: <span className="font-medium text-brand-black">{selected}</span> · change
            </button>
          )}
          {!hasSizes && <div className="flex-1" />}

          {/* CTA */}
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={doAdd}
              className="px-4 py-3 text-[11px] tracking-[0.15em] uppercase font-medium border border-brand-black text-brand-black hover:bg-brand-cream transition-colors">
              Cart
            </button>
            <button onClick={doBuy}
              className={`px-5 py-3 text-[11px] tracking-[0.15em] uppercase font-medium transition-colors ${
                canOrder ? 'bg-brand-black text-white' : 'bg-brand-orange text-white'
              }`}>
              {!selected && hasSizes ? 'Pick Size' : 'Order Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Spacer so content doesn't hide behind sticky bar */}
      {stickyVisible && <div className="lg:hidden h-20" />}
    </>
  );
}
