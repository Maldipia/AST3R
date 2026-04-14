// src/app/page.tsx  — SERVER COMPONENT (prices in HTML, no JS needed)
import Image  from 'next/image';
import Link   from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPrice } from '@/lib/utils';
import Header from '@/components/Header';
import HomeFilter from '@/components/HomeFilter';

export const revalidate = 60;

export default async function HomePage() {
  // Fetch products without joins to avoid duplicate rows from size_inventory
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, sku, name, price, compare_price, image_url, category, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  // Fetch inventory separately to get stock counts
  const { data: inventoryData } = await supabase
    .from('inventory')
    .select('sku, quantity');
  const invMap: Record<string, number> = {};
  (inventoryData || []).forEach(i => { invMap[i.sku] = i.quantity; });

  // Deduplicate by SKU
  const seen = new Set<string>();
  const products = (allProducts || []).filter(p => {
    if (seen.has(p.sku)) return false;
    seen.add(p.sku);
    return true;
  });

  const categories = ['All', ...new Set(products.map(p => p.category))];

  return (
    <>
      <Header />
      <main className="pt-16">

        {/* ── Hero ── */}
        <section className="relative h-screen bg-brand-black overflow-hidden flex items-end">
          {products[0]?.image_url && (
            <Image src={products[0].image_url} alt="AST3R Fashion Hero"
              fill className="object-cover opacity-60" priority sizes="100vw" />
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
              <a href="#collections" className="btn-primary">Shop Collection</a>
              <a href="https://instagram.com/ast3r.ph" target="_blank" rel="noopener noreferrer"
                className="btn-outline border-white text-white hover:bg-white hover:text-brand-black">
                @ast3r.ph
              </a>
            </div>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
            <div className="w-px h-10 bg-brand-gray/50" />
            <span className="text-brand-gray text-xs tracking-widest uppercase">Scroll</span>
          </div>
        </section>

        {/* ── Collections ── */}
        <section id="collections" className="py-20 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-10">
              <div>
                <span className="accent-line mb-3" />
                <h2 className="display-lg text-brand-black">Collection</h2>
              </div>
              <p className="text-brand-gray text-sm">{products.length} pieces</p>
            </div>

            {/* Client filter component handles search + category tabs */}
            <HomeFilter products={products} categories={categories} invMap={invMap} />
          </div>
        </section>

        {/* ── Brand ── */}
        <section id="about" className="bg-brand-black py-24 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="accent-line mx-auto mb-6" />
            <h2 className="display-lg text-brand-white mb-6">
              Elevated Essentials for the Modern Woman
            </h2>
            <p className="text-brand-gray text-sm leading-relaxed max-w-2xl mx-auto mb-10">
              AST3R is a fashion brand based in Tagaytay City, Philippines.
              We create trendy, high-quality pieces built to last — designed with comfort and elegance in mind.
              Ships worldwide.
            </p>
            <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
              {[
                { value: products.length + '+', label: 'Products' },
                { value: 'WW', label: 'Ships Worldwide' },
                { value: 'PH', label: 'Based in Tagaytay' },
              ].map(({ value, label }) => (
                <div key={label} className="text-center">
                  <p className="font-serif text-3xl text-brand-white mb-1">{value}</p>
                  <p className="text-brand-gray text-xs tracking-widest uppercase">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-brand-cream border-t border-brand-light py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">
              <div>
                <p className="font-serif text-xl tracking-widest text-brand-black mb-3">AST3R</p>
                <p className="text-brand-gray text-xs leading-relaxed">Elevated essentials.<br />Tagaytay City, Philippines.</p>
              </div>
              {[
                { title: 'Shop', links: [{ label: 'Collections', href: '#collections' }, { label: 'New Arrivals', href: '#collections' }] },
                { title: 'Help', links: [{ label: 'Track Order', href: '/track' }, { label: 'Returns', href: '/returns' }, { label: 'Visit Store', href: '/store' }] },
                { title: 'Contact', links: [{ label: 'inquiry@ast3r.store', href: 'mailto:inquiry@ast3r.store' }, { label: '0966 960 6060', href: 'tel:09669606060' }, { label: '@ast3r.ph', href: 'https://instagram.com/ast3r.ph' }] },
              ].map(({ title, links }) => (
                <div key={title}>
                  <p className="text-xs font-medium tracking-widest uppercase text-brand-black mb-3">{title}</p>
                  <div className="space-y-2">
                    {links.map(({ label, href }) => (
                      <a key={label} href={href} className="block text-xs text-brand-gray hover:text-brand-black transition-colors">{label}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-light pt-6 text-center">
              <p className="text-xs text-brand-gray">© {new Date().getFullYear()} AST3R Fashion. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
