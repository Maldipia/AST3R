// src/app/page.tsx — SERVER COMPONENT
import Image      from 'next/image';
import Link       from 'next/link';
import { supabase }    from '@/lib/supabase';
import Header          from '@/components/Header';
import HomeFilter      from '@/components/HomeFilter';
import FlashSaleBanner from '@/components/FlashSaleBanner';

export const revalidate = 0;

export default async function HomePage() {
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, sku, name, price, compare_price, image_url, category, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  const { data: inventoryData } = await supabase
    .from('inventory').select('sku, quantity');
  const invMap: Record<string, number> = {};
  (inventoryData || []).forEach((i: any) => { invMap[i.sku] = i.quantity; });

  const seen = new Set<string>();
  const products = (allProducts || []).filter((p: any) => {
    if (seen.has(p.sku)) return false;
    seen.add(p.sku); return true;
  });

  const categories = ['All', ...Array.from(new Set(products.map((p: any) => p.category)))];
  const heroProduct = products.find((p: any) => p.image_url) || products[0];

  // Flash sale settings
  const { data: flashData } = await supabase.from('settings').select('value').eq('key', 'flash_sale').single();
  const flashSale = flashData?.value || null;

  return (
    <>
      <Header />
      <FlashSaleBanner sale={flashSale} />
      <main>

        {/* ── HERO ─────────────────────────────────────────────── */}
        <section className="relative h-screen bg-brand-black overflow-hidden">
          {heroProduct?.image_url && (
            <Image
              src={heroProduct.image_url}
              alt="AST3R Fashion"
              fill
              className="object-cover object-top opacity-50"
              priority
              sizes="100vw"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
          <div className="absolute bottom-0 left-0 right-0 px-6 sm:px-12 pb-16">
            <div className="max-w-7xl mx-auto">
              <div className="max-w-xl">
                <p className="text-brand-orange text-xs tracking-[0.3em] uppercase mb-4 font-medium">New Collection 2026</p>
                <h1 className="display-xl text-white mb-6 leading-[1.02]">
                  Elevated<br/>Essentials.
                </h1>
                <p className="text-white/60 text-sm leading-relaxed mb-8 max-w-sm">
                  Bangkok-inspired fashion built for the modern woman. Quality pieces designed to last.
                </p>
                <div className="flex items-center gap-6">
                  <a href="#collections"
                    className="bg-white text-brand-black px-8 py-3.5 text-xs tracking-[0.2em] uppercase font-medium hover:bg-brand-orange hover:text-white transition-all duration-300">
                    Shop Now
                  </a>
                  <a href="https://instagram.com/ast3r.ph" target="_blank" rel="noopener noreferrer"
                    className="text-white/70 text-xs tracking-[0.2em] uppercase border-b border-white/30 hover:text-white hover:border-white transition-all pb-0.5">
                    @ast3r.ph
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-8 right-8 sm:right-12 flex flex-col items-center gap-3">
            <div className="w-px h-12 bg-white/30" />
            <span className="text-white/40 text-[9px] tracking-[0.3em] uppercase" style={{writingMode:'vertical-rl'}}>Scroll</span>
          </div>
        </section>

        {/* ── MARQUEE ───────────────────────────────────────────── */}
        <div className="bg-brand-black border-t border-white/10 py-3 overflow-hidden">
          <div className="flex animate-marquee whitespace-nowrap">
            {Array(6).fill(['Free Shipping on Orders ₱3,000+', '·', 'New Arrivals Weekly', '·', 'Ships Worldwide', '·', 'Quality Elevated Essentials', '·']).flat().map((t, i) => (
              <span key={i} className="text-white/50 text-[10px] tracking-[0.3em] uppercase mx-8 font-medium">{t}</span>
            ))}
          </div>
        </div>

        {/* ── COLLECTION ────────────────────────────────────────── */}
        <section id="collections" className="bg-[#FAFAF8] pt-16 pb-24">
          <div className="max-w-7xl mx-auto px-5 sm:px-8">
            {/* Header row */}
            <div className="flex items-baseline justify-between border-b border-[#E8E6E2] pb-6 mb-10">
              <div className="flex items-baseline gap-6">
                <h2 className="font-serif text-2xl sm:text-3xl text-brand-black tracking-tight">The Collection</h2>
                <span className="text-brand-gray text-xs tracking-widest hidden sm:block">{products.length} pieces</span>
              </div>
              <span className="text-brand-gray text-[10px] tracking-[0.3em] uppercase">AST3R · 2026</span>
            </div>

            <HomeFilter products={products} categories={categories} invMap={invMap} />
          </div>
        </section>

        {/* ── BRAND ─────────────────────────────────────────────── */}
        <section className="bg-brand-black py-20 px-5 sm:px-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-brand-orange text-[10px] tracking-[0.35em] uppercase mb-5">Our Story</p>
              <h2 className="display-lg text-white mb-5 leading-[1.1]">Designed in Tagaytay.<br/>Worn Worldwide.</h2>
              <p className="text-white/45 text-sm leading-relaxed mb-8 max-w-md">
                AST3R is a fashion brand from the cool highlands of Tagaytay City, Philippines.
                Every piece is thoughtfully made — elevated basics with Bangkok-inspired aesthetics,
                built for comfort without sacrificing style.
              </p>
              <a href="#collections"
                className="inline-flex items-center gap-3 text-white text-xs tracking-[0.2em] uppercase border-b border-white/20 hover:border-brand-orange hover:text-brand-orange transition-all pb-1">
                Shop the Collection <span>→</span>
              </a>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { num: products.length + '+', label: 'Pieces' },
                { num: 'PH', label: 'Tagaytay' },
                { num: 'WW', label: 'Worldwide' },
              ].map(({ num, label }) => (
                <div key={label} className="border border-white/10 p-6 text-center">
                  <p className="font-serif text-3xl text-white mb-2">{num}</p>
                  <p className="text-white/35 text-[9px] tracking-[0.3em] uppercase">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <footer className="bg-[#F2F0EC] border-t border-[#D4D4CF]">
          <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 mb-10">
              <div className="col-span-2 sm:col-span-1">
                <p className="font-serif text-2xl tracking-[0.15em] text-brand-black mb-3">AST3R</p>
                <p className="text-brand-gray text-xs leading-relaxed">Elevated essentials.<br/>Amadeo, Cavite, Philippines.</p>
              </div>
              {[
                { title: 'Shop', links: [['All Collections','#collections'],['New Arrivals','#collections'],['Sale','#collections']] },
                { title: 'Help', links: [['Track Order','/track'],['Returns','/returns'],['Visit Store','/store']] },
                { title: 'Contact', links: [['inquiry@ast3r.store','mailto:inquiry@ast3r.store'],['0967-4000-040','tel:09674000040'],['@ast3r.ph','https://instagram.com/ast3r.ph']] },
              ].map(({ title, links }) => (
                <div key={title}>
                  <p className="text-[10px] font-medium tracking-[0.3em] uppercase text-brand-black mb-4">{title}</p>
                  <div className="space-y-2.5">
                    {links.map(([label, href]) => (
                      <a key={label} href={href} className="block text-xs text-brand-gray hover:text-brand-black transition-colors">{label}</a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#D4D4CF] pt-5 flex flex-col sm:flex-row items-center justify-between gap-2">
              <p className="text-[11px] text-brand-gray">© {new Date().getFullYear()} AST3R Fashion. All rights reserved.</p>
              <div className="flex gap-5">
                <a href="#" className="text-[11px] text-brand-gray hover:text-brand-black transition-colors">Privacy</a>
                <a href="#" className="text-[11px] text-brand-gray hover:text-brand-black transition-colors">Terms</a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
