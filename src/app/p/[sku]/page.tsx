// src/app/p/[sku]/page.tsx
import { notFound }    from 'next/navigation';
import { Metadata }    from 'next';
import Image           from 'next/image';
import { supabase }    from '@/lib/supabase';
import { formatPrice, getStockLabel } from '@/lib/utils';
import OrderButton     from './OrderButton';
import Header          from '@/components/Header';
import QRDownload      from './QRDownload';
import ReviewForm      from './ReviewForm';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

// ── Generate static metadata per SKU ─────────────────────────
export async function generateMetadata(
  { params }: { params: { sku: string } }
): Promise<Metadata> {
  const { data } = await supabase
    .from('products')
    .select('name, description, image_url')
    .eq('sku', params.sku)
    .single();

  if (!data) return { title: 'Product Not Found — AST3R Fashion' };

  return {
    title:       `${data.name} — AST3R Fashion`,
    description: data.description?.slice(0, 155),
    openGraph: {
      images: [{ url: data.image_url }],
      title:  `${data.name} — AST3R Fashion`,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────
export default async function ProductPage({
  params,
}: {
  params: { sku: string };
}) {
  const { sku } = params;

  // Fetch product first — notFound early if missing
  const { data: product, error } = await supabase
    .rpc('get_product_with_stock', { p_sku: sku })
    .single() as { data: Record<string, any> | null; error: any };

  if (error || !product) notFound();

  // Safe cast after notFound guard
  const prod = product!;

  // Fetch all related data in parallel
  const [priceRes, sizeRes, relatedRes, reviewsRes] = await Promise.all([
    supabase.from('products').select('compare_price').eq('sku', sku).single(),
    supabase.from('size_inventory').select('size, quantity').eq('sku', sku).order('size'),
    supabase.from('products').select('sku, name, price, compare_price, image_url, category')
      .eq('status', 'active').eq('category', (prod as any).category).neq('sku', sku).limit(4),
    supabase.from('reviews').select('customer_name, rating, comment, created_at')
      .eq('sku', sku).eq('verified', true).order('created_at', { ascending: false }),
  ]);

  const comparePrice: number | null  = priceRes.data?.compare_price ?? null;
  const sizeInventory                = sizeRes.data || [];
  const relatedProducts              = relatedRes.data || [];
  const reviews                      = reviewsRes.data || [];

  const avgRating = reviews.length
    ? (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  // Track QR scan (non-blocking)
  supabase.rpc('track_qr_scan', { p_sku: sku }).then(() => {});

  const hasSizes     = sizeInventory.length > 0;
  const totalSizeQty = hasSizes ? sizeInventory.reduce((sum: number, s: any) => sum + s.quantity, 0) : ((prod as any).quantity ?? 0);
  const { label: stockLabel, color: stockColor } = getStockLabel(totalSizeQty);
  const inStock = totalSizeQty > 0;

  return (
    <>
      <Header />

      <main className="min-h-screen pt-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-4rem)]">

            {/* ── LEFT: Product Image ──────────────────────── */}
            <div className="relative bg-brand-cream overflow-hidden" style={{ minHeight: '60vw', maxHeight: '90vh' }}>
              {(prod as any).image_url ? (
                <Image
                  src={(prod as any).image_url}
                  alt={(prod as any).name}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-serif text-4xl text-brand-light">AST3R</span>
                </div>
              )}

              {/* Category tag */}
              <div className="absolute top-6 left-6">
                <span className="bg-brand-white/90 backdrop-blur-sm px-3 py-1 text-xs tracking-widest uppercase font-medium text-brand-gray">
                  {(prod as any).category}
                </span>
              </div>

              {/* SKU tag */}
              <div className="absolute bottom-6 right-6">
                <span className="bg-brand-black/80 backdrop-blur-sm px-3 py-1 text-xs tracking-widest text-brand-white font-mono">
                  {(prod as any).sku}
                </span>
              </div>
            </div>

            {/* ── RIGHT: Product Info ──────────────────────── */}
            <div className="flex flex-col justify-center px-8 py-16 lg:px-16 xl:px-24 page-enter">

              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-8">
                <span className="accent-line" />
                <span className="text-xs tracking-widest uppercase text-brand-gray font-medium">
                  {(prod as any).category}
                </span>
              </div>

              {/* Product Name */}
              <h1 className="display-lg text-brand-black mb-6 leading-tight">
                {(prod as any).name}
              </h1>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-3 flex-wrap">
                  {comparePrice && comparePrice < (prod as any).price ? (
                    <>
                      {/* Sale price — big and prominent */}
                      <span className="font-serif text-3xl font-medium text-red-600">
                        {formatPrice(comparePrice, (prod as any).currency)}
                      </span>
                      {/* Original price — crossed out */}
                      <span className="font-serif text-xl text-brand-gray line-through">
                        {formatPrice((prod as any).price, (prod as any).currency)}
                      </span>
                      <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 tracking-wide">
                        {Math.round((1 - comparePrice / (prod as any).price) * 100)}% OFF
                      </span>
                    </>
                  ) : (
                    <span className="font-serif text-3xl font-medium text-brand-black">
                      {formatPrice((prod as any).price, (prod as any).currency)}
                    </span>
                  )}
                </div>
                {comparePrice && comparePrice < (prod as any).price && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    You save {formatPrice((prod as any).price - comparePrice)}
                  </p>
                )}
              </div>

              {/* Stock Status */}
              <div className="flex items-center gap-2 mb-6">
                <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-sm font-medium ${stockColor}`}>{stockLabel}</span>
              </div>

              {/* Size selector with per-size stock */}
              {hasSizes && sizeInventory && sizeInventory.length > 0 && (
                <div className="mb-8">
                  <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Select Size</p>
                  <div className="flex flex-wrap gap-2">
                    {sizeInventory.map(({ size, quantity }) => (
                      <div key={size} className={`
                        flex flex-col items-center px-4 py-2 border text-sm font-medium min-w-[56px]
                        ${quantity <= 0
                          ? 'border-brand-light text-brand-light cursor-not-allowed line-through'
                          : 'border-brand-black text-brand-black hover:bg-brand-black hover:text-white cursor-pointer transition-colors'
                        }
                      `}>
                        <span>{size}</span>
                        <span className={`text-xs mt-0.5 font-normal ${
                          quantity <= 0 ? 'text-brand-light' :
                          quantity <= 3 ? 'text-orange-500' : 'text-brand-gray'
                        }`}>
                          {quantity <= 0 ? 'sold out' : `${quantity} left`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="divider" />

              {/* Description */}
              <p className="text-brand-gray text-sm leading-relaxed mb-10 max-w-md">
                {(prod as any).description}
              </p>

              {/* CTA */}
              <OrderButton
                sku={(prod as any).sku}
                name={(prod as any).name}
                price={(prod as any).price}
                salePrice={comparePrice}
                imageUrl={(prod as any).image_url}
                inStock={inStock}
              />

              {/* Info bullets */}
              <div className="mt-10 space-y-3 border-t border-brand-light pt-8">
                {[
                  '🚚 Nationwide delivery via LBC / J&T',
                  '📦 Worldwide shipping available',
                  '💬 Questions? inquiry@ast3r.store',
                  '📍 Walk-in: AST3R Boutique, Tagaytay City',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-xs text-brand-gray">
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* QR Download (admin use) */}
              <QRDownload sku={(prod as any).sku} productName={(prod as any).name} />

              {/* Share buttons */}
              <div className="mt-8 pt-8 border-t border-brand-light">
                <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Share</p>
                <div className="flex gap-2 flex-wrap">
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(APP_URL + '/p/' + (prod as any).sku)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs border border-brand-light px-3 py-2 text-brand-gray hover:border-brand-black transition-all">
                    📘 Facebook
                  </a>
                  <a href="https://instagram.com/ast3r.ph" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs border border-brand-light px-3 py-2 text-brand-gray hover:border-brand-black transition-all">
                    📷 @ast3r.ph
                  </a>
                  <ShareButton url={`${APP_URL}/p/${(prod as any).sku}`} />
                </div>
              </div>

              {/* Size Guide */}
              <details className="mt-6 border border-brand-light">
                <summary className="px-4 py-3 text-xs font-medium tracking-widest uppercase cursor-pointer hover:bg-brand-cream transition-colors flex items-center justify-between">
                  <span>📏 Size Guide</span>
                  <span className="text-brand-gray">+</span>
                </summary>
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-xs mt-3 border-collapse">
                    <thead>
                      <tr className="bg-brand-cream">
                        {['Size','Bust (in)','Waist (in)','Hip (in)','Height'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['XS','30–32 in','24–26 in','33–35 in','5'0–5'2"'],
                        ['S', '33–34 in','26–28 in','35–37 in','5'2–5'4"'],
                        ['M', '35–36 in','28–30 in','37–39 in','5'4–5'6"'],
                        ['L', '37–39 in','31–33 in','40–42 in','5'6–5'8"'],
                        ['XL','40–42 in','34–36 in','43–45 in','5'8–5'10"'],
                        ['XXL','43–46 in','37–40 in','46–49 in','5'10–6'0"'],
                        ['Free Size','Fits S–L','—','—','5'2–5'7"'],
                      ].map(row => (
                        <tr key={row[0]} className="hover:bg-brand-cream">
                          {row.map((cell, i) => (
                            <td key={i} className={`px-3 py-2 border border-brand-light ${i===0 ? 'font-bold' : ''}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-brand-gray mt-3">💡 AST3R follows Asian sizing. When in doubt, size up.</p>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* ── Reviews ─────────────────────────────────── */}
        <div className="border-t border-brand-light py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="accent-line mb-3" />
                <h2 className="display-md text-brand-black">
                  Customer Reviews
                  {avgRating && <span className="ml-3 font-serif text-2xl text-brand-orange">★ {avgRating}</span>}
                </h2>
              </div>
              <span className="text-xs text-brand-gray">{reviews?.length || 0} review{reviews?.length !== 1 ? 's' : ''}</span>
            </div>

            {reviews && reviews.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {reviews.map((r: any, i: number) => (
                  <div key={i} className="border border-brand-light p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-brand-orange text-sm">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    <p className="text-sm text-brand-black leading-relaxed mb-3">"{r.comment}"</p>
                    <p className="text-xs text-brand-gray font-medium">{r.customer_name}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-brand-gray text-sm mb-8">No reviews yet. Be the first!</p>
            )}

            {/* Leave a review form */}
            <ReviewForm sku={(prod as any).sku} />
          </div>
        </div>

        {/* ── Related Products ─────────────────────────── */}
        {relatedProducts && relatedProducts.length > 0 && (
          <div className="border-t border-brand-light py-16 px-4 bg-brand-cream">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <span className="accent-line mb-3" />
                <h2 className="display-md text-brand-black">You Might Also Like</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {relatedProducts.map(rp => (
                  <a key={rp.sku} href={`/p/${rp.sku}`} className="group block">
                    <div className="relative aspect-[3/4] bg-white overflow-hidden mb-3">
                      {rp.image_url
                        ? <img src={rp.image_url} alt={rp.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        : <div className="w-full h-full flex items-center justify-center text-brand-light">AST3R</div>
                      }
                    </div>
                    <p className="text-xs text-brand-gray">{rp.category}</p>
                    <p className="text-sm font-medium text-brand-black group-hover:text-brand-orange transition-colors">{rp.name}</p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      {rp.compare_price && rp.compare_price < rp.price ? (
                        <>
                          <span className="text-sm font-medium text-red-600">{formatPrice(rp.compare_price)}</span>
                          <span className="text-xs text-brand-gray line-through">{formatPrice(rp.price)}</span>
                        </>
                      ) : (
                        <span className="text-sm font-medium">{formatPrice(rp.price)}</span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-light bg-brand-cream py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <span className="font-serif text-xl tracking-widest text-brand-black">AST3R</span>
          <p className="text-xs text-brand-gray mt-2 tracking-wide">
            Trendy · High-Quality · Comfort
          </p>
        </div>
      </footer>
    </>
  );
}
