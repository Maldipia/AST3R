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
  inventory: { quantity: number }[];
};

export default function HomeFilter({
  products,
  categories,
}: {
  products: Product[];
  categories: string[];
}) {
  const [search, setSearch]   = useState('');
  const [cat,    setCat]      = useState('All');

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
      {/* Search + category tabs */}
      <div className="mb-8 space-y-4">
        <div className="relative max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm">🔍</span>
          <input type="text" placeholder="Search products..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-brand-light pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:border-brand-black bg-white" />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-black text-xs">✕</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`px-4 py-1.5 text-xs tracking-widest uppercase border transition-all ${
                cat === c
                  ? 'border-brand-black bg-brand-black text-white'
                  : 'border-brand-light text-brand-gray hover:border-brand-black hover:text-brand-black'
              }`}>
              {c}
            </button>
          ))}
        </div>
        {(search || cat !== 'All') && (
          <p className="text-xs text-brand-gray">
            {filtered.length} product{filtered.length !== 1 ? 's' : ''}
            {cat !== 'All' && ` in ${cat}`}
            {search && ` matching "${search}"`}
            {' — '}
            <button onClick={() => { setSearch(''); setCat('All'); }}
              className="text-brand-orange underline">Clear</button>
          </p>
        )}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {filtered.map(product => {
          const stock      = product.inventory?.[0]?.quantity ?? 0;
          const salePrice  = product.compare_price;
          const origPrice  = product.price;
          const isOnSale   = salePrice !== null && salePrice > 0 && salePrice < origPrice;
          const discPct    = isOnSale ? Math.round((1 - salePrice! / origPrice) * 100) : 0;

          return (
            <Link key={product.sku} href={`/p/${product.sku}`} className="group block">
              {/* Image */}
              <div className="relative aspect-[3/4] bg-brand-cream overflow-hidden mb-4">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.name}
                    fill className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, 33vw" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-serif text-2xl text-brand-light">AST3R</span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-brand-black/0 group-hover:bg-brand-black/10 transition-all duration-300 flex items-center justify-center">
                  <span className="btn-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-xs py-3 px-6">
                    View Product
                  </span>
                </div>

                {/* Badges */}
                {stock <= 0 && (
                  <div className="absolute top-3 left-3">
                    <span className="bg-brand-black text-white text-xs px-2 py-1">Sold Out</span>
                  </div>
                )}
                {stock > 0 && stock <= 5 && (
                  <div className="absolute top-3 left-3">
                    <span className="bg-brand-orange text-white text-xs px-2 py-1">Only {stock} left</span>
                  </div>
                )}
                {isOnSale && (
                  <div className="absolute top-3 right-3">
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-1">-{discPct}%</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div>
                <p className="text-xs text-brand-gray tracking-widest uppercase mb-1">{product.category}</p>
                <h3 className="font-medium text-brand-black text-sm sm:text-base mb-1.5 group-hover:text-brand-orange transition-colors leading-tight">
                  {product.name}
                </h3>

                {/* Price */}
                {isOnSale ? (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-serif text-lg text-red-600 font-medium">
                      {formatPrice(salePrice!)}
                    </span>
                    <span className="font-serif text-sm text-brand-gray line-through">
                      {formatPrice(origPrice)}
                    </span>
                  </div>
                ) : (
                  <span className="font-serif text-lg text-brand-black">
                    {formatPrice(origPrice)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-brand-gray">No products found</p>
          <button onClick={() => { setSearch(''); setCat('All'); }}
            className="text-brand-orange text-sm underline mt-2">Clear filters</button>
        </div>
      )}
    </div>
  );
}
