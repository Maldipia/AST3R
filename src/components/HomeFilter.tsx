// src/components/HomeFilter.tsx
'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import Link  from 'next/link';
import { formatPrice } from '@/lib/utils';

type Product = {
  id: string; sku: string; name: string;
  price: number; compare_price: number | null;
  image_url: string; category: string;
};

export default function HomeFilter({
  products,
  categories,
  invMap = {},
}: {
  products: Product[];
  categories: string[];
  invMap?: Record<string, number>;
}) {
  const [search, setSearch] = useState('');
  const [cat,    setCat]    = useState('All');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      const matchCat    = cat === 'All' || p.category === cat;
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [products, search, cat]);

  return (
    <div>
      {/* ── FILTERS ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-10">
        {/* Category tabs */}
        <div className="flex items-center overflow-x-auto scrollbar-none flex-1 border-b border-[#E8E6E2]">
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`flex-shrink-0 px-4 py-3 text-[11px] tracking-[0.25em] uppercase font-medium transition-all border-b-2 -mb-px
                ${cat === c
                  ? 'text-brand-black border-brand-black'
                  : 'text-brand-gray border-transparent hover:text-brand-black'
                }`}>
              {c}
            </button>
          ))}
        </div>
        {/* Search */}
        <div className="relative w-full sm:w-48 flex-shrink-0">
          <input type="text" placeholder="Search" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent border-b border-brand-light py-2 pr-6 text-xs text-brand-black placeholder:text-brand-gray focus:outline-none focus:border-brand-black transition-colors tracking-wide" />
          {search
            ? <button onClick={() => setSearch('')} className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-gray text-xs">✕</button>
            : <span className="absolute right-0 top-1/2 -translate-y-1/2 text-brand-gray text-sm">⌕</span>}
        </div>
      </div>

      {(search || cat !== 'All') && (
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs text-brand-gray">{filtered.length} result{filtered.length !== 1 ? 's' : ''}{cat !== 'All' && ` — ${cat}`}</p>
          <button onClick={() => { setSearch(''); setCat('All'); }}
            className="text-[11px] text-brand-gray hover:text-brand-black tracking-widest uppercase underline underline-offset-2 transition-colors">
            Clear
          </button>
        </div>
      )}

      {/* ── PRODUCT GRID ────────────────────────────────────── */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14">
          {filtered.map(product => {
            const stock     = invMap[product.sku] ?? 0;
            const salePrice = product.compare_price;
            const origPrice = product.price;
            const isOnSale  = salePrice !== null && salePrice > 0 && salePrice < origPrice;
            const discPct   = isOnSale ? Math.round((1 - salePrice! / origPrice) * 100) : 0;
            const isSoldOut   = stock <= 0;
            const isLowStock  = !isSoldOut && stock <= 5;

            return (
              <Link key={product.sku} href={`/p/${product.sku}`} className="group block">
                {/* Image */}
                <div className="relative aspect-[3/4] bg-brand-cream overflow-hidden mb-3">
                  {product.image_url ? (
                    <Image src={product.image_url} alt={product.name} fill
                      className={`object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105 ${isSoldOut ? 'opacity-50 grayscale' : ''}`}
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-serif text-xl text-brand-light tracking-widest">AST3R</span>
                    </div>
                  )}

                  {/* Quick view */}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <span className="bg-white text-brand-black text-[10px] tracking-[0.2em] uppercase px-5 py-2.5 font-medium shadow-sm">
                      View Product
                    </span>
                  </div>

                  {/* Left badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    {isSoldOut  && <span className="bg-[#666] text-white text-[9px] tracking-[0.15em] uppercase px-2.5 py-1">Sold Out</span>}
                    {isLowStock && <span className="bg-brand-orange text-white text-[9px] tracking-[0.15em] uppercase px-2.5 py-1">{stock} Left</span>}
                  </div>

                  {/* Sale badge */}
                  {isOnSale && (
                    <span className="absolute top-3 right-3 bg-brand-black text-white text-[9px] tracking-[0.1em] font-medium px-2.5 py-1">
                      -{discPct}%
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-1">
                  <p className="text-[10px] text-brand-gray tracking-[0.25em] uppercase">{product.category}</p>
                  <h3 className="text-sm font-medium text-brand-black leading-snug group-hover:text-brand-orange transition-colors duration-200 line-clamp-1">
                    {product.name}
                  </h3>
                  <div className="flex items-baseline gap-2 pt-0.5">
                    {isOnSale ? (
                      <>
                        <span className="font-serif text-base text-brand-orange">{formatPrice(salePrice!)}</span>
                        <span className="font-serif text-sm text-brand-gray line-through">{formatPrice(origPrice)}</span>
                      </>
                    ) : (
                      <span className="font-serif text-base text-brand-black">{formatPrice(origPrice)}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="py-24 text-center">
          <p className="text-brand-gray text-sm mb-4">No products found</p>
          <button onClick={() => { setSearch(''); setCat('All'); }}
            className="text-xs text-brand-black tracking-[0.2em] uppercase border-b border-brand-black pb-0.5 hover:text-brand-orange hover:border-brand-orange transition-colors">
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
