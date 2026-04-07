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

  // Fetch product with stock and size inventory
  const { data: product, error } = await supabase
    .rpc('get_product_with_stock', { p_sku: sku })
    .single() as { data: Record<string, any> | null; error: any };

  // Fetch compare_price (not returned by RPC)
  const { data: priceData } = await supabase
    .from('products')
    .select('compare_price')
    .eq('sku', sku)
    .single();
  const comparePrice: number | null = priceData?.compare_price ?? null;

  // Fetch size inventory separately
  const { data: sizeInventory } = await supabase
    .from('size_inventory')
    .select('size, quantity')
    .eq('sku', sku)
    .order('size');

  if (error || !product) notFound();

  // Track QR scan (non-blocking)
  supabase.rpc('track_qr_scan', { p_sku: sku }).then(() => {});

  const hasSizes    = sizeInventory && sizeInventory.length > 0;
  const totalSizeQty = hasSizes ? sizeInventory!.reduce((sum, s) => sum + s.quantity, 0) : (product.quantity ?? 0);
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
              <div className="mb-6">
                <div className="flex items-baseline gap-3 flex-wrap">
                  {comparePrice && comparePrice < product.price ? (
                    <>
                      {/* Sale price — big and prominent */}
                      <span className="font-serif text-3xl font-medium text-red-600">
                        {formatPrice(comparePrice, product.currency)}
                      </span>
                      {/* Original price — crossed out */}
                      <span className="font-serif text-xl text-brand-gray line-through">
                        {formatPrice(product.price, product.currency)}
                      </span>
                      <span className="text-xs font-bold text-white bg-red-500 px-2 py-1 tracking-wide">
                        {Math.round((1 - comparePrice / product.price) * 100)}% OFF
                      </span>
                    </>
                  ) : (
                    <span className="font-serif text-3xl font-medium text-brand-black">
                      {formatPrice(product.price, product.currency)}
                    </span>
                  )}
                </div>
                {comparePrice && comparePrice < product.price && (
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    You save {formatPrice(product.price - comparePrice)}
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
                {product.description}
              </p>

              {/* CTA */}
              <OrderButton
                sku={product.sku}
                name={product.name}
                price={product.price}
                salePrice={comparePrice}
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
