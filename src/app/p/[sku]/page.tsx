// src/app/p/[sku]/page.tsx
import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { formatPrice, getStockLabel } from '@/lib/utils';
import OrderButton from './OrderButton';
import Header from '@/components/Header';
import QRDownload from './QRDownload';
import ReviewForm from './ReviewForm';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

export async function generateMetadata(
  props: { params: { sku: string } }
): Promise<Metadata> {
  const { data } = await supabase
    .from('products')
    .select('name, description, image_url')
    .eq('sku', props.params.sku)
    .single();
  if (!data) return { title: 'Product Not Found  -  AST3R Fashion' };
  return {
    title: data.name + '  -  AST3R Fashion',
    description: data.description ? data.description.slice(0, 155) : '',
    openGraph: {
      images: [{ url: data.image_url }],
      title: data.name + '  -  AST3R Fashion',
    },
  };
}

export default async function ProductPage(
  props: { params: { sku: string } }
) {
  const sku = props.params.sku;

  const { data: product, error } = await supabase
    .rpc('get_product_with_stock', { p_sku: sku })
    .single() as { data: any; error: any };

  if (error || !product) {
    notFound();
  }

  const [sizeRes, relatedRes, reviewsRes] = await Promise.all([
    supabase.from('size_inventory').select('size, quantity').eq('sku', sku).order('size'),
    supabase.from('products')
      .select('sku, name, price, compare_price, image_url, category')
      .eq('status', 'active')
      .eq('category', product.category)
      .neq('sku', sku)
      .limit(4),
    supabase.from('reviews')
      .select('customer_name, rating, comment, created_at')
      .eq('sku', sku)
      .eq('verified', true)
      .order('created_at', { ascending: false }),
  ]);

  // compare_price now comes from the RPC directly (no extra query needed)
  const comparePrice = (product.compare_price as number) || null;
  const sizeInventory = sizeRes.data || [];
  const relatedProducts = relatedRes.data || [];
  const reviews = reviewsRes.data || [];

  const avgRating = reviews.length > 0
    ? (reviews.reduce(function(s: number, r: any) { return s + r.rating; }, 0) / reviews.length).toFixed(1)
    : null;

  supabase.rpc('track_qr_scan', { p_sku: sku }).then(function() {});

  const hasSizes = sizeInventory.length > 0;
  const totalSizeQty = hasSizes
    ? sizeInventory.reduce(function(sum: number, s: any) { return sum + s.quantity; }, 0)
    : (product.quantity || 0);
  const { label: stockLabel, color: stockColor } = getStockLabel(totalSizeQty);
  const inStock = totalSizeQty > 0;
  const isOnSale = comparePrice && comparePrice < product.price;
  const discountPct = isOnSale ? Math.round((1 - comparePrice / product.price) * 100) : 0;
  const productUrl = APP_URL + '/p/' + product.sku;
  const shareUrl = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(productUrl);

  return (
    <>
      <Header />
      <main className="min-h-screen pt-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-4rem)]">

            {/* Left: Image */}
            <div
              className="relative bg-brand-cream overflow-hidden"
              style={{ minHeight: '60vw', maxHeight: '90vh' }}
            >
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
              <div className="absolute top-6 left-6">
                <span className="bg-brand-white/90 backdrop-blur-sm px-3 py-1 text-xs tracking-widest uppercase font-medium text-brand-gray">
                  {product.category}
                </span>
              </div>
              {isOnSale && (
                <div className="absolute top-6 right-6">
                  <span className="bg-red-500 text-white px-3 py-1 text-xs font-bold">
                    -{discountPct}% OFF
                  </span>
                </div>
              )}
              <div className="absolute bottom-6 right-6">
                <span className="bg-brand-black/80 backdrop-blur-sm px-3 py-1 text-xs tracking-widest text-brand-white font-mono">
                  {product.sku}
                </span>
              </div>
            </div>

            {/* Right: Info */}
            <div className="flex flex-col justify-center px-8 py-16 lg:px-16 xl:px-24 page-enter">

              <div className="flex items-center gap-2 mb-8">
                <span className="accent-line" />
                <span className="text-xs tracking-widest uppercase text-brand-gray font-medium">
                  {product.category}
                </span>
              </div>

              <h1 className="display-lg text-brand-black mb-6 leading-tight">
                {product.name}
              </h1>

              {/* Price */}
              <div className="mb-6">
                {isOnSale ? (
                  <div>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="font-serif text-3xl font-medium text-red-600">
                        {formatPrice(comparePrice, product.currency)}
                      </span>
                      <span className="font-serif text-xl text-brand-gray line-through">
                        {formatPrice(product.price, product.currency)}
                      </span>
                    </div>
                    <p className="text-xs text-green-600 mt-1 font-medium">
                      You save {formatPrice(product.price - comparePrice)}
                    </p>
                  </div>
                ) : (
                  <span className="font-serif text-3xl font-medium text-brand-black">
                    {formatPrice(product.price, product.currency)}
                  </span>
                )}
              </div>

              {/* Stock */}
              <div className="flex items-center gap-2 mb-6">
                <span className={inStock ? 'w-2 h-2 rounded-full bg-green-500' : 'w-2 h-2 rounded-full bg-red-500'} />
                <span className={'text-sm font-medium ' + stockColor}>{stockLabel}</span>
              </div>

              {/* Sizes */}
              {hasSizes && (
                <div className="mb-8">
                  <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">
                    Select Size
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sizeInventory.map(function(si: any) {
                      return (
                        <div
                          key={si.size}
                          className={si.quantity <= 0
                            ? 'flex flex-col items-center px-4 py-2 border text-sm font-medium min-w-[56px] border-brand-light text-brand-light cursor-not-allowed line-through'
                            : 'flex flex-col items-center px-4 py-2 border text-sm font-medium min-w-[56px] border-brand-black text-brand-black hover:bg-brand-black hover:text-white cursor-pointer transition-colors'
                          }
                        >
                          <span>{si.size}</span>
                          <span className={'text-xs mt-0.5 font-normal ' + (
                            si.quantity <= 0 ? 'text-brand-light' :
                            si.quantity <= 3 ? 'text-orange-500' : 'text-brand-gray'
                          )}>
                            {si.quantity <= 0 ? 'sold out' : si.quantity + ' left'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="divider" />

              <p className="text-brand-gray text-sm leading-relaxed mb-10 max-w-md">
                {product.description}
              </p>

              <OrderButton
                sku={product.sku}
                name={product.name}
                price={product.price}
                salePrice={comparePrice}
                imageUrl={product.image_url}
                inStock={inStock}
              />

              {/* Info */}
              <div className="mt-10 space-y-3 border-t border-brand-light pt-8">
                <div className="text-xs text-brand-gray">🚚 Nationwide delivery via LBC / J&T</div>
                <div className="text-xs text-brand-gray">📦 Worldwide shipping available</div>
                <div className="text-xs text-brand-gray">💬 Questions? inquiry@ast3r.store</div>
                <div className="text-xs text-brand-gray">📍 Walk-in: AST3R Boutique, Tagaytay City</div>
              </div>

              {/* Share */}
              <div className="mt-8 pt-8 border-t border-brand-light">
                <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Share</p>
                <div className="flex gap-2">
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs border border-brand-light px-3 py-2 text-brand-gray hover:border-brand-black transition-all"
                  >
                    📘 Facebook
                  </a>
                </div>
              </div>

              {/* Size Guide */}
              <details className="mt-6 border border-brand-light">
                <summary className="px-4 py-3 text-xs font-medium tracking-widest uppercase cursor-pointer hover:bg-brand-cream transition-colors">
                  📏 Size Guide
                </summary>
                <div className="px-4 pb-4 overflow-x-auto">
                  <table className="w-full text-xs mt-3 border-collapse">
                    <thead>
                      <tr className="bg-brand-cream">
                        <th className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">Size</th>
                        <th className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">Bust</th>
                        <th className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">Waist</th>
                        <th className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">Hip</th>
                        <th className="px-3 py-2 text-left font-medium text-brand-gray border border-brand-light">Height</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">XS</td><td className="px-3 py-2 border border-brand-light">30-32"</td><td className="px-3 py-2 border border-brand-light">24-26"</td><td className="px-3 py-2 border border-brand-light">33-35"</td><td className="px-3 py-2 border border-brand-light">5'0-5'2"</td></tr>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">S</td><td className="px-3 py-2 border border-brand-light">33-34"</td><td className="px-3 py-2 border border-brand-light">26-28"</td><td className="px-3 py-2 border border-brand-light">35-37"</td><td className="px-3 py-2 border border-brand-light">5'2-5'4"</td></tr>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">M</td><td className="px-3 py-2 border border-brand-light">35-36"</td><td className="px-3 py-2 border border-brand-light">28-30"</td><td className="px-3 py-2 border border-brand-light">37-39"</td><td className="px-3 py-2 border border-brand-light">5'4-5'6"</td></tr>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">L</td><td className="px-3 py-2 border border-brand-light">37-39"</td><td className="px-3 py-2 border border-brand-light">31-33"</td><td className="px-3 py-2 border border-brand-light">40-42"</td><td className="px-3 py-2 border border-brand-light">5'6-5'8"</td></tr>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">XL</td><td className="px-3 py-2 border border-brand-light">40-42"</td><td className="px-3 py-2 border border-brand-light">34-36"</td><td className="px-3 py-2 border border-brand-light">43-45"</td><td className="px-3 py-2 border border-brand-light">5'8-5'10"</td></tr>
                      <tr><td className="px-3 py-2 border border-brand-light font-bold">Free Size</td><td className="px-3 py-2 border border-brand-light">Fits S-L</td><td className="px-3 py-2 border border-brand-light">-</td><td className="px-3 py-2 border border-brand-light">-</td><td className="px-3 py-2 border border-brand-light">5'2-5'7"</td></tr>
                    </tbody>
                  </table>
                  <p className="text-xs text-brand-gray mt-3">AST3R follows Asian sizing. When in doubt, size up.</p>
                </div>
              </details>

              <QRDownload sku={product.sku} productName={product.name} />
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="border-t border-brand-light py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="accent-line mb-3" />
                <h2 className="display-md text-brand-black">
                  Customer Reviews
                  {avgRating && (
                    <span className="ml-3 font-serif text-2xl text-brand-orange">
                      {String.fromCharCode(9733)} {avgRating}
                    </span>
                  )}
                </h2>
              </div>
              <span className="text-xs text-brand-gray">
                {reviews.length} review{reviews.length !== 1 ? 's' : ''}
              </span>
            </div>

            {reviews.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                {reviews.map(function(r: any, i: number) {
                  return (
                    <div key={i} className="border border-brand-light p-5">
                      <div className="text-brand-orange text-sm mb-3">
                        {Array(r.rating).fill('★').join('')}{Array(5 - r.rating).fill('☆').join('')}
                      </div>
                      <p className="text-sm text-brand-black leading-relaxed mb-3">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                      <p className="text-xs text-brand-gray font-medium">{r.customer_name}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-brand-gray text-sm mb-8">No reviews yet. Be the first!</p>
            )}

            <ReviewForm sku={product.sku} />
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="border-t border-brand-light py-16 px-4 bg-brand-cream">
            <div className="max-w-7xl mx-auto">
              <div className="mb-8">
                <span className="accent-line mb-3" />
                <h2 className="display-md text-brand-black">You Might Also Like</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {relatedProducts.map(function(rp: any) {
                  const rpOnSale = rp.compare_price && rp.compare_price < rp.price;
                  return (
                    <a key={rp.sku} href={'/p/' + rp.sku} className="group block">
                      <div className="relative aspect-[3/4] bg-white overflow-hidden mb-3">
                        {rp.image_url ? (
                          <img
                            src={rp.image_url}
                            alt={rp.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-brand-light font-serif">
                            AST3R
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-brand-gray">{rp.category}</p>
                      <p className="text-sm font-medium text-brand-black group-hover:text-brand-orange transition-colors">
                        {rp.name}
                      </p>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        {rpOnSale ? (
                          <>
                            <span className="text-sm font-medium text-red-600">
                              {formatPrice(rp.compare_price)}
                            </span>
                            <span className="text-xs text-brand-gray line-through">
                              {formatPrice(rp.price)}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm font-medium">{formatPrice(rp.price)}</span>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-brand-light bg-brand-cream py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <span className="font-serif text-xl tracking-widest text-brand-black">AST3R</span>
          <p className="text-xs text-brand-gray mt-2 tracking-wide">Trendy · High-Quality · Comfort</p>
        </div>
      </footer>
    </>
  );
}
