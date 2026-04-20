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
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [count, setCount] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = () => { const c = getCart(); setCart(c); setCount(cartCount(c)); };

  useEffect(() => {
    refresh();
    window.addEventListener('cart-updated', refresh);
    return () => window.removeEventListener('cart-updated', refresh);
  }, []);

  // Auto-open on add
  useEffect(() => {
    const onAdd = () => { refresh(); setOpen(true); };
    window.addEventListener('cart-updated', onAdd);
    return () => window.removeEventListener('cart-updated', onAdd);
  }, []);

  const remove = (sku: string, size?: string) => {
    const key = sku + (size || '');
    setRemoving(key);
    setTimeout(() => {
      setCart(removeFromCart(sku, size));
      setRemoving(null);
    }, 250);
  };

  const change = (sku: string, size: string | undefined, qty: number) => {
    setCart(updateQty(sku, size, qty));
  };

  const checkout = () => {
    if (cart.length === 0) { toast.error('Your cart is empty'); return; }
    setOpen(false);
    router.push('/checkout');
  };

  const total = cartTotal(cart);

  return (
    <>
      {/* Cart icon */}
      <button onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 text-brand-black hover:text-brand-orange transition-colors"
        aria-label="Open cart">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
        </svg>
        {count > 0 && (
          <span className="absolute -top-2 -right-2 bg-brand-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
        <span className="text-xs hidden sm:block">Cart{count > 0 ? ` (${count})` : ''}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />

          {/* Drawer */}
          <div className="relative w-full max-w-sm bg-white h-full flex flex-col shadow-2xl">

            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECEAE6]">
              <div className="flex items-baseline gap-2">
                <h2 className="font-medium text-[15px] text-brand-black">Cart</h2>
                <span className="text-[11px] text-brand-gray">{count} item{count !== 1 ? 's' : ''}</span>
              </div>
              <button onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center text-brand-gray hover:text-brand-black hover:bg-[#F5F3EF] rounded transition-colors"
                aria-label="Close cart">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* ── Items ── */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-4">
                  <div className="w-16 h-16 bg-[#F5F3EF] rounded-full flex items-center justify-center">
                    <svg className="w-7 h-7 text-brand-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-brand-black text-sm">Your cart is empty</p>
                    <p className="text-brand-gray text-xs mt-1">Browse our collection and add items</p>
                  </div>
                  <button onClick={() => setOpen(false)}
                    className="mt-1 bg-brand-black text-white px-6 py-2.5 text-xs tracking-[0.2em] uppercase font-medium hover:bg-brand-orange transition-colors">
                    Browse Collection
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-[#F0EEE8]">
                  {cart.map(item => {
                    const key = item.sku + (item.size || '');
                    const fading = removing === key;
                    return (
                      <li key={key}
                        className={`flex gap-3 px-5 py-4 transition-all duration-250 ${fading ? 'opacity-0 scale-95' : 'opacity-100'}`}>

                        {/* Thumbnail */}
                        <a href={`/p/${item.sku}`} onClick={() => setOpen(false)}
                          className="relative w-[68px] h-[88px] bg-brand-cream flex-shrink-0 overflow-hidden rounded-sm hover:opacity-80 transition-opacity">
                          {item.image_url
                            ? <Image src={item.image_url} alt={item.name} fill className="object-cover object-top" sizes="68px"/>
                            : <div className="absolute inset-0 flex items-center justify-center font-serif text-xs text-brand-gray">AST3R</div>}
                        </a>

                        {/* Details */}
                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <a href={`/p/${item.sku}`} onClick={() => setOpen(false)}
                                className="font-medium text-brand-black text-[13px] leading-snug hover:text-brand-orange transition-colors line-clamp-2 block">
                                {item.name}
                              </a>
                              <p className="text-[10px] text-brand-gray font-mono mt-0.5">{item.sku}</p>
                              {/* Size badge */}
                              {item.size && (
                                <span className="inline-block mt-1.5 bg-brand-black text-white text-[10px] font-medium px-2 py-0.5 tracking-wide">
                                  {item.size}
                                </span>
                              )}
                            </div>

                            {/* X Remove button — prominent */}
                            <button
                              onClick={() => remove(item.sku, item.size)}
                              className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-[#F5F3EF] hover:bg-red-50 hover:text-red-500 text-brand-gray transition-colors"
                              aria-label={`Remove ${item.name}`}>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </div>

                          {/* Price + Qty */}
                          <div className="flex items-center justify-between mt-2">
                            <p className="font-serif text-[14px] text-brand-black">
                              {formatPrice(item.price * item.quantity)}
                            </p>
                            {/* Qty stepper */}
                            <div className="flex items-center border border-[#D4D4CF]">
                              <button
                                onClick={() => change(item.sku, item.size, item.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center text-brand-gray hover:text-brand-black hover:bg-[#F5F3EF] transition-colors text-lg leading-none"
                                aria-label="Decrease quantity">
                                −
                              </button>
                              <span className="w-7 text-center text-[12px] font-medium text-brand-black select-none">{item.quantity}</span>
                              <button
                                onClick={() => change(item.sku, item.size, item.quantity + 1)}
                                className="w-7 h-7 flex items-center justify-center text-brand-gray hover:text-brand-black hover:bg-[#F5F3EF] transition-colors text-lg leading-none"
                                aria-label="Increase quantity">
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ── Footer ── */}
            {cart.length > 0 && (
              <div className="border-t border-[#ECEAE6] px-5 pt-4 pb-6 bg-[#FAFAF8] space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-brand-gray tracking-[0.2em] uppercase">Subtotal</span>
                  <span className="font-serif text-[18px] text-brand-black">{formatPrice(total)}</span>
                </div>
                <p className="text-[11px] text-brand-gray leading-relaxed">
                  Shipping & COD fees calculated at checkout
                </p>
                <button onClick={checkout}
                  className="w-full bg-brand-black text-white py-3.5 text-xs tracking-[0.2em] uppercase font-medium hover:bg-brand-orange transition-colors flex items-center justify-center gap-2">
                  Checkout
                  <span className="font-serif text-sm normal-case tracking-normal font-normal">{formatPrice(total)}</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                  </svg>
                </button>
                <button onClick={() => setOpen(false)}
                  className="w-full border border-[#D4D4CF] text-brand-gray py-2.5 text-xs tracking-[0.2em] uppercase hover:text-brand-black hover:border-brand-black transition-colors">
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
