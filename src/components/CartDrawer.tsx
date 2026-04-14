// src/components/CartDrawer.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getCart, removeFromCart, updateQty, cartTotal, cartCount, type CartItem } from '@/lib/cart';
import { formatPrice } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function CartDrawer() {
  const router = useRouter();
  const [open,  setOpen]  = useState(false);
  const [cart,  setCart]  = useState<CartItem[]>([]);
  const [count, setCount] = useState(0);

  const refresh = () => {
    const c = getCart();
    setCart(c);
    setCount(cartCount(c));
  };

  useEffect(() => {
    refresh();
    window.addEventListener('cart-updated', refresh);
    return () => window.removeEventListener('cart-updated', refresh);
  }, []);

  const remove = (sku: string, size?: string) => {
    setCart(removeFromCart(sku, size));
    toast.success('Removed from cart');
  };

  const change = (sku: string, size: string | undefined, qty: number) => {
    setCart(updateQty(sku, size, qty));
  };

  const checkout = () => {
    if (cart.length === 0) { toast.error('Cart is empty'); return; }
    setOpen(false);
    router.push('/checkout');
  };

  const total = cartTotal(cart);

  return (
    <>
      {/* Cart button */}
      <button onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 text-brand-black hover:text-brand-orange transition-colors"
        aria-label="Cart">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-2 -right-2 bg-brand-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
        <span className="text-xs hidden sm:block">Cart {count > 0 ? `(${count})` : ''}</span>
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Drawer */}
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">Your Cart</h2>
                <p className="text-xs text-gray-400">{count} item{count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                ✕
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <p className="text-4xl mb-4">🛍️</p>
                  <p className="text-gray-500 font-medium">Your cart is empty</p>
                  <p className="text-gray-400 text-sm mt-1">Browse our collection and add items</p>
                  <button onClick={() => setOpen(false)}
                    className="mt-6 bg-gray-900 text-white px-6 py-2.5 text-sm font-medium hover:bg-gray-700 transition-colors">
                    Shop Now
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map(item => (
                    <div key={item.sku + (item.size || '')} className="flex gap-4">
                      {/* Image */}
                      <div className="relative w-20 h-24 bg-gray-100 flex-shrink-0 overflow-hidden">
                        {item.image_url
                          ? <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="80px" />
                          : <div className="absolute inset-0 flex items-center justify-center text-gray-300 font-serif text-xs">AST3R</div>
                        }
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm leading-tight">{item.name}</p>
                        {item.size && <p className="text-xs text-gray-400 mt-0.5">Size: {item.size}</p>}
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku}</p>
                        <p className="text-sm font-semibold text-gray-900 mt-1">{formatPrice(item.price)}</p>

                        {/* Qty controls */}
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center border border-gray-200">
                            <button onClick={() => change(item.sku, item.size, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors text-sm">
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <button onClick={() => change(item.sku, item.size, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors text-sm">
                              +
                            </button>
                          </div>
                          <button onClick={() => remove(item.sku, item.size)}
                            className="text-xs text-red-400 hover:text-red-600 transition-colors">
                            Remove
                          </button>
                        </div>
                      </div>
                      {/* Item total */}
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatPrice(item.price * item.quantity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-gray-500">Subtotal</span>
                  <span className="font-bold text-lg text-gray-900">{formatPrice(total)}</span>
                </div>
                <p className="text-xs text-gray-400">Shipping calculated at checkout</p>
                <button onClick={checkout}
                  className="w-full bg-gray-900 text-white py-3.5 text-sm font-semibold hover:bg-gray-700 transition-colors">
                  Checkout → {formatPrice(total)}
                </button>
                <button onClick={() => setOpen(false)}
                  className="w-full border border-gray-200 text-gray-600 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                  Continue Shopping
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
