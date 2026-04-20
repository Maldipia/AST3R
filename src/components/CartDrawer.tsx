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
    toast.success('Item removed');
  };

  const change = (sku: string, size: string | undefined, qty: number) => {
    setCart(updateQty(sku, size, qty));
  };

  const checkout = () => {
    if (cart.length === 0) { toast.error('Your cart is empty'); return; }
    const missingSizes = cart.filter(i => !i.size);
    if (missingSizes.length > 0) {
      toast.error(
        missingSizes.length === 1
          ? `Please select a size for "${missingSizes[0].name}" before checking out.`
          : `${missingSizes.length} items are missing a size. Remove them and re-add with a size selected.`,
        { duration: 4000 }
      );
      return;
    }
    setOpen(false);
    router.push('/checkout');
  };

  const total = cartTotal(cart);

  return (
    <>
      {/* Cart icon button */}
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
          <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E6E2]">
              <div>
                <h2 className="font-medium text-brand-black tracking-tight">Your Cart</h2>
                <p className="text-[11px] text-brand-gray mt-0.5 tracking-wide">{count} item{count !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-brand-gray hover:text-brand-black transition-colors text-lg">
                ✕
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <div className="w-14 h-14 border border-[#E8E6E2] flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-brand-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                    </svg>
                  </div>
                  <p className="text-brand-black font-medium text-sm">Your cart is empty</p>
                  <p className="text-brand-gray text-xs mt-1 leading-relaxed">Browse our collection and add items to your cart.</p>
                  <button onClick={() => setOpen(false)}
                    className="mt-5 bg-brand-black text-white px-6 py-2.5 text-xs tracking-[0.2em] uppercase font-medium hover:bg-brand-orange transition-colors">
                    Shop Now
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[#F0EEE8]">
                  {cart.map(item => (
                    <div key={item.sku + (item.size || '')} className="px-5 py-4 flex gap-3">

                      {/* Image */}
                      <div className="relative w-[72px] h-[90px] bg-brand-cream flex-shrink-0 overflow-hidden">
                        {item.image_url
                          ? <Image src={item.image_url} alt={item.name} fill className="object-cover object-top" sizes="72px" />
                          : <div className="absolute inset-0 flex items-center justify-center font-serif text-xs text-brand-gray">AST3R</div>
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Name + Remove */}
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-brand-black text-sm leading-snug">{item.name}</p>
                          <button onClick={() => remove(item.sku, item.size)}
                            className="text-brand-gray hover:text-red-500 transition-colors flex-shrink-0 mt-0.5" title="Remove">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>

                        {/* SKU */}
                        <p className="text-[10px] text-brand-gray font-mono mt-0.5 tracking-wide">{item.sku}</p>

                        {/* Size badge — prominent */}
                        {item.size ? (
                          <div className="mt-1.5 inline-flex items-center gap-1">
                            <span className="text-[10px] text-brand-gray tracking-[0.15em] uppercase">Size</span>
                            <span className="bg-brand-black text-white text-[10px] font-medium px-2 py-0.5 tracking-wide">
                              {item.size}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1.5 inline-flex items-center gap-1">
                            <span className="bg-brand-orange/10 text-brand-orange text-[10px] px-2 py-0.5 tracking-wide border border-brand-orange/30">
                              No size selected
                            </span>
                          </div>
                        )}

                        {/* Price + Qty row */}
                        <div className="flex items-center justify-between mt-2.5">
                          <p className="font-serif text-sm font-medium text-brand-black">
                            {formatPrice(item.price)}
                            {item.quantity > 1 && (
                              <span className="text-brand-gray text-xs font-sans ml-1">× {item.quantity}</span>
                            )}
                          </p>

                          {/* Qty controls */}
                          <div className="flex items-center border border-[#D4D4CF]">
                            <button
                              onClick={() => change(item.sku, item.size, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center text-brand-gray hover:text-brand-black hover:bg-brand-cream transition-colors text-base leading-none">
                              −
                            </button>
                            <span className="w-7 text-center text-xs font-medium text-brand-black">{item.quantity}</span>
                            <button
                              onClick={() => change(item.sku, item.size, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center text-brand-gray hover:text-brand-black hover:bg-brand-cream transition-colors text-base leading-none">
                              +
                            </button>
                          </div>
                        </div>

                        {/* Line total — only show when qty > 1 */}
                        {item.quantity > 1 && (
                          <p className="text-right text-xs text-brand-gray mt-1">
                            Total: <span className="text-brand-black font-medium">{formatPrice(item.price * item.quantity)}</span>
                          </p>
                        )}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="border-t border-[#E8E6E2] px-5 py-4 space-y-3 bg-[#FAFAF8]">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-brand-gray tracking-[0.15em] uppercase">Subtotal</span>
                  <span className="font-serif text-lg text-brand-black">{formatPrice(total)}</span>
                </div>
                <p className="text-[11px] text-brand-gray">Shipping calculated at checkout</p>
                {(() => {
                  const missingSizes = cart.filter(i => !i.size);
                  const hasIssue = missingSizes.length > 0;
                  return (
                    <>
                      {hasIssue && (
                        <div className="flex items-start gap-2 bg-[#FFF8F5] border border-brand-orange/30 px-3 py-2.5 rounded-sm">
                          <span className="text-brand-orange text-xs mt-0.5 flex-shrink-0">!</span>
                          <p className="text-xs text-brand-orange leading-relaxed">
                            {missingSizes.length === 1
                              ? `"${missingSizes[0].name}" has no size selected. Remove it and re-add with a size.`
                              : `${missingSizes.length} items are missing sizes — remove and re-add them.`}
                          </p>
                        </div>
                      )}
                      <button onClick={checkout}
                        className={`w-full py-3.5 text-xs tracking-[0.2em] uppercase font-medium transition-colors flex items-center justify-center gap-2 ${
                          hasIssue
                            ? 'bg-brand-gray/30 text-brand-gray cursor-not-allowed'
                            : 'bg-brand-black text-white hover:bg-brand-orange'
                        }`}>
                        {hasIssue ? 'Select Sizes to Continue' : 'Checkout'}
                        {!hasIssue && <span className="font-serif text-sm normal-case tracking-normal">{formatPrice(total)}</span>}
                        {!hasIssue && (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                          </svg>
                        )}
                      </button>
                    </>
                  );
                })()}
                <button onClick={() => setOpen(false)}
                  className="w-full border border-[#D4D4CF] text-brand-gray py-2.5 text-xs tracking-[0.2em] uppercase font-medium hover:text-brand-black hover:border-brand-black transition-colors">
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
