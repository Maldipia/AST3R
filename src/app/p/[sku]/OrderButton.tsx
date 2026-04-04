// src/app/p/[sku]/OrderButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import toast         from 'react-hot-toast';

interface OrderButtonProps {
  sku:      string;
  name:     string;
  price:    number;
  imageUrl: string;
  inStock:  boolean;
}

export default function OrderButton({ sku, name, price, imageUrl, inStock }: OrderButtonProps) {
  const router = useRouter();

  const handleOrder = () => {
    if (!inStock) {
      toast.error('This item is currently out of stock.');
      return;
    }

    // Store cart item in sessionStorage
    const cartItem = { sku, name, price, quantity: 1, image_url: imageUrl };
    sessionStorage.setItem('ast3r_cart', JSON.stringify([cartItem]));

    toast.success('Proceeding to checkout…');
    router.push('/checkout');
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleOrder}
        disabled={!inStock}
        className="btn-primary w-full"
      >
        {inStock ? 'Order Now' : 'Out of Stock'}
        {inStock && (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
        )}
      </button>

      {inStock && (
        <p className="text-xs text-center text-brand-gray tracking-wide">
          Free cancellation within 24 hours of ordering
        </p>
      )}
    </div>
  );
}
