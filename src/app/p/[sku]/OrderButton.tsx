// src/app/p/[sku]/OrderButton.tsx
'use client';

import { useState } from 'react';
import { useRouter }  from 'next/navigation';
import toast          from 'react-hot-toast';
import { addToCart }  from '@/lib/cart';

interface Props {
  sku:        string;
  name:       string;
  price:      number;
  salePrice?: number | null;
  imageUrl:   string;
  inStock:    boolean;
  sizes?:     { size: string; quantity: number }[];
}

export default function OrderButton({ sku, name, price, salePrice, imageUrl, inStock, sizes = [] }: Props) {
  const router = useRouter();
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    sizes.length === 1 ? sizes[0].size : undefined
  );
  const checkoutPrice = salePrice && salePrice < price ? salePrice : price;
  const hasSizes      = sizes.length > 0;
  const selectedStock = hasSizes && selectedSize
    ? (sizes.find(s => s.size === selectedSize)?.quantity ?? 0)
    : (inStock ? 99 : 0);
  const canOrder = inStock && (!hasSizes || (!!selectedSize && selectedStock > 0));

  // Meta Pixel tracking
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'ViewContent', {
        content_ids: [sku], content_type: 'product',
        value: checkoutPrice, currency: 'PHP', content_name: name,
      });
    }
  }, []);

  const handleAddToCart = () => {
    if (!inStock) { toast.error('Out of stock'); return; }
    if (hasSizes && !selectedSize) { toast.error('Please select a size first'); return; }
    if (hasSizes && selectedStock <= 0) { toast.error('That size is out of stock'); return; }
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selectedSize });
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'AddToCart', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    }
    toast.success('Added to cart!', { duration: 2000 });
    window.dispatchEvent(new Event('cart-updated'));
  };

  const handleBuyNow = () => {
    if (!canOrder) { toast.error(hasSizes && !selectedSize ? 'Please select a size' : 'Out of stock'); return; }
    addToCart({ sku, name, price: checkoutPrice, image_url: imageUrl, size: selectedSize });
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'InitiateCheckout', { content_ids: [sku], value: checkoutPrice, currency: 'PHP' });
    }
    window.dispatchEvent(new Event('cart-updated'));
    router.push('/checkout');
  };

  if (!inStock) return (
    <button disabled className="w-full bg-gray-200 text-gray-400 py-4 text-sm font-medium cursor-not-allowed">
      Out of Stock
    </button>
  );

  return (
    <div className="space-y-3">
      <button onClick={handleAddToCart} disabled={!canOrder}
        className="w-full border-2 border-gray-900 text-gray-900 py-3.5 text-sm font-semibold hover:bg-gray-900 hover:text-white transition-all disabled:opacity-40">
        {hasSizes && !selectedSize ? 'Select a Size First' : 'Add to Cart'}
      </button>
      <button onClick={handleBuyNow} disabled={!canOrder}
        className="w-full bg-gray-900 text-white py-3.5 text-sm font-semibold hover:bg-gray-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
        ORDER NOW
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
      </button>
      <p className="text-xs text-gray-400 text-center">Free cancellation within 24 hours</p>
    </div>
  );
}
