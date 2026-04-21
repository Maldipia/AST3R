// src/components/RecentlyViewed.tsx
'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getRecentlyViewed, type ViewedProduct } from '@/lib/recentlyViewed';
import { formatPrice } from '@/lib/utils';

export default function RecentlyViewed({ currentSku }: { currentSku: string }) {
  const [items, setItems] = useState<ViewedProduct[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed().filter(p => p.sku !== currentSku).slice(0, 4));
  }, [currentSku]);

  if (items.length === 0) return null;

  return (
    <div className="border-t border-brand-light py-14 px-4 bg-[#FAFAF8]">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <span className="accent-line mb-3" />
          <h2 className="display-md text-brand-black">Recently Viewed</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map(p => {
            const onSale = p.compare_price && p.compare_price < p.price;
            return (
              <a key={p.sku} href={`/p/${p.sku}`} className="group block">
                <div className="relative aspect-[3/4] bg-brand-cream overflow-hidden mb-3">
                  {p.image_url ? (
                    <Image src={p.image_url} alt={p.name} fill className="object-cover object-top group-hover:scale-105 transition-transform duration-500" sizes="25vw" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center font-serif text-sm text-brand-gray">AST3R</div>
                  )}
                </div>
                <p className="text-[10px] text-brand-gray tracking-widest uppercase">{p.category}</p>
                <p className="text-sm font-medium text-brand-black group-hover:text-brand-orange transition-colors line-clamp-1">{p.name}</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  {onSale ? (
                    <><span className="text-sm text-brand-orange font-medium">{formatPrice(p.compare_price!)}</span>
                    <span className="text-xs text-brand-gray line-through">{formatPrice(p.price)}</span></>
                  ) : (
                    <span className="text-sm font-medium">{formatPrice(p.price)}</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
