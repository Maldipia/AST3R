// src/app/p/[sku]/page.tsx
import { notFound }    from 'next/navigation';
import { Metadata }    from 'next';
import Image           from 'next/image';
import { supabase }    from '@/lib/supabase';
import { formatPrice, getStockLabel } from '@/lib/utils';
import OrderButton     from './OrderButton';
import Header          from '@/components/Header';
import QRDownload      from './QRDownload';

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

  // Single optimized query using the DB function
  const { data: product, error } = await supabase
    .rpc('get_product_with_stock', { p_sku: sku })
    .single();

  if (error || !product) notFound();

  // Track QR scan (non-blocking)
  supabase.rpc('track_qr_scan', { p_sku: sku }).then(() => {});

  const { label: stockLabel, color: stockColor } = getStockLabel(product.quantity ?? 0);
  const inStock = (product.quantity ?? 0) > 0;

  return (
    <>
      <Header />

      <main className="min-h-screen pt-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-4rem)]">

            {/* ── LEFT: Product Image ──────────────────────── */}
            <div className="relative bg-brand-cream overflow-hidden" style={{ minHeight: '60vw', maxHeight: '90vh' }}>
              {product.image_url ? (
                <Image
                  src={product.image_url}
                  alt={product.name}
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
                  {product.category}
                </span>
              </div>

              {/* SKU tag */}
              <div className="absolute bottom-6 right-6">
                <span className="bg-brand-black/80 backdrop-blur-sm px-3 py-1 text-xs tracking-widest text-brand-white font-mono">
                  {product.sku}
                </span>
              </div>
            </div>

            {/* ── RIGHT: Product Info ──────────────────────── */}
            <div className="flex flex-col justify-center px-8 py-16 lg:px-16 xl:px-24 page-enter">

              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-8">
                <span className="accent-line" />
                <span className="text-xs tracking-widest uppercase text-brand-gray font-medium">
                  {product.category}
                </span>
              </div>

              {/* Product Name */}
              <h1 className="display-lg text-brand-black mb-6 leading-tight">
                {product.name}
              </h1>

              {/* Price */}
              <div className="flex items-baseline gap-3 mb-6">
                <span className="font-serif text-3xl font-medium text-brand-black">
                  {formatPrice(product.price, product.currency)}
                </span>
                <span className="text-sm text-brand-gray tracking-wide">
                  {product.currency}
                </span>
              </div>

              {/* Stock Status */}
              <div className="flex items-center gap-2 mb-8">
                <span className={`w-2 h-2 rounded-full ${inStock ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className={`text-sm font-medium ${stockColor}`}>{stockLabel}</span>
              </div>

              {/* Divider */}
              <div className="divider" />

              {/* Description */}
              <p className="text-brand-gray text-sm leading-relaxed mb-10 max-w-md">
                {product.description}
              </p>

              {/* CTA */}
              <OrderButton
                sku={product.sku}
                name={product.name}
                price={product.price}
                imageUrl={product.image_url}
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
              <QRDownload sku={product.sku} productName={product.name} />
            </div>
          </div>
        </div>
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
