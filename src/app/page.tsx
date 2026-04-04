// src/app/page.tsx
import Image  from 'next/image';
import Link   from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/utils';
import Header from '@/components/Header';

export const revalidate = 60; // ISR: revalidate every 60s

export default async function HomePage() {
  const { data: products } = await supabase
    .from('products')
    .select(`*, inventory(quantity)`)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const categories = [...new Set(products?.map(p => p.category) || [])];

  return (
    <>
      <Header />
      <main className="pt-16">

        {/* ── Hero ──────────────────────────────────────── */}
        <section className="relative h-screen bg-brand-black overflow-hidden flex items-end">
          {products?.[0]?.image_url && (
            <Image
              src={products[0].image_url}
              alt="AST3R Fashion Hero"
              fill
              className="object-cover opacity-60"
              priority
              sizes="100vw"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-brand-black via-brand-black/20 to-transparent" />

          <div className="relative z-10 px-6 pb-20 max-w-7xl w-full mx-auto">
            <span className="accent-line mb-6" />
            <h1 className="display-xl text-brand-white mb-4">
              Elevated<br />
              <em className="not-italic text-brand-orange">Essentials.</em>
            </h1>
            <p className="text-brand-gray text-sm max-w-md mb-8 leading-relaxed">
              Bangkok-inspired fashion rooted in quality and comfort.
              Designed for the modern woman who moves through the world with intention.
            </p>
            <div className="flex flex-wrap gap-4">
              <a href="#collections" className="btn-primary">
                Shop Collection
              </a>
              <a
                href="https://instagram.com/ast3r.ph"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-outline border-white text-white hover:bg-white hover:text-brand-black"
              >
                @ast3r.ph
              </a>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
            <div className="w-px h-10 bg-brand-gray/50" />
            <span className="text-brand-gray text-xs tracking-widest uppercase">Scroll</span>
          </div>
        </section>

        {/* ── Brand Strip ───────────────────────────────── */}
        <section className="bg-brand-orange py-4 overflow-hidden">
          <div className="flex gap-12 animate-[marquee_20s_linear_infinite] whitespace-nowrap">
            {Array(3).fill(['Trendy', '·', 'High-Quality', '·', 'Comfort', '·', 'Worldwide Shipping', '·']).flat().map((t, i) => (
              <span key={i} className="text-white text-xs font-medium tracking-widest uppercase">{t}</span>
            ))}
          </div>
        </section>

        {/* ── Collections ───────────────────────────────── */}
        <section id="collections" className="py-20 px-4">
          <div className="max-w-7xl mx-auto">

            {/* Section header */}
            <div className="flex items-end justify-between mb-12">
              <div>
                <span className="accent-line mb-3" />
                <h2 className="display-lg text-brand-black">The Collection</h2>
              </div>
              <p className="text-brand-gray text-sm hidden sm:block">
                {products?.length || 0} pieces available
              </p>
            </div>

            {/* Category filter */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-10">
                {['All', ...categories].map((cat) => (
                  <span
                    key={cat}
                    className="px-4 py-1.5 text-xs tracking-widest uppercase border border-brand-light text-brand-gray cursor-pointer hover:border-brand-black hover:text-brand-black transition-all"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {/* Product Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {products?.map((product, i) => {
                const stock = product.inventory?.[0]?.quantity ?? 0;
                return (
                  <Link
                    key={product.sku}
                    href={`/p/${product.sku}`}
                    className="group block"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  >
                    {/* Image */}
                    <div className="relative aspect-[3/4] bg-brand-cream overflow-hidden mb-4">
                      {product.image_url ? (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-cover transition-transform duration-700 group-hover:scale-105"
                          sizes="(max-width: 640px) 50vw, 33vw"
                        />
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

                      {/* Stock badge */}
                      {stock <= 0 && (
                        <div className="absolute top-3 left-3">
                          <span className="bg-red-600 text-white text-xs px-2 py-1">Sold Out</span>
                        </div>
                      )}
                      {stock > 0 && stock <= 5 && (
                        <div className="absolute top-3 left-3">
                          <span className="bg-brand-orange text-white text-xs px-2 py-1">Only {stock} left</span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <p className="text-xs text-brand-gray tracking-widest uppercase mb-1">{product.category}</p>
                      <h3 className="font-medium text-brand-black text-sm sm:text-base mb-1 group-hover:text-brand-orange transition-colors">
                        {product.name}
                      </h3>
                      <p className="font-serif text-lg text-brand-black">
                        {formatPrice(product.price, product.currency)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── About / Brand Section ─────────────────────── */}
        <section id="about" className="bg-brand-black py-24 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="accent-line mx-auto mb-6" />
            <h2 className="display-lg text-brand-white mb-6">
              The AST3R Story
            </h2>
            <p className="text-brand-gray text-sm leading-relaxed max-w-2xl mx-auto mb-10">
              Born in Tagaytay City, inspired by Bangkok. AST3R Fashion is built around a singular belief:
              that every woman deserves pieces that are effortlessly beautiful, genuinely comfortable,
              and made to last. We source only high-quality fabrics, design with intention, and deliver
              worldwide because style has no borders.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              {[
                { icon: '🌏', label: 'Worldwide Shipping' },
                { icon: '✨', label: 'Premium Fabrics' },
                { icon: '💬', label: 'Personal Service' },
              ].map(({ icon, label }) => (
                <div key={label}>
                  <div className="text-3xl mb-3">{icon}</div>
                  <p className="text-brand-white text-xs tracking-widest uppercase font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────── */}
        <footer className="bg-brand-cream border-t border-brand-light py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
              <div>
                <span className="font-serif text-2xl tracking-[0.15em] text-brand-black">AST3R</span>
                <p className="text-brand-gray text-xs mt-2 leading-relaxed">
                  Trendy · High-Quality · Comfort<br/>
                  Tagaytay City, Philippines
                </p>
              </div>
              <div>
                <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Contact</p>
                <div className="space-y-1 text-sm text-brand-black">
                  <a href="mailto:inquiry@ast3r.store" className="block hover:text-brand-orange transition-colors">
                    inquiry@ast3r.store
                  </a>
                  <a href="tel:09669606060" className="block hover:text-brand-orange transition-colors">
                    0966 960 6060
                  </a>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Follow</p>
                <a
                  href="https://instagram.com/ast3r.ph"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand-black hover:text-brand-orange transition-colors"
                >
                  @ast3r.ph
                </a>
              </div>
            </div>
            <div className="border-t border-brand-light pt-6 flex flex-col sm:flex-row justify-between items-center gap-2">
              <p className="text-xs text-brand-gray">© 2024 AST3R Fashion. All rights reserved.</p>
              <p className="text-xs text-brand-gray">Part of the TYG Business Network</p>
            </div>
          </div>
        </footer>
      </main>

    </>
  );
}
