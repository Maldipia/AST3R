// src/app/checkout/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Image                   from 'next/image';
import Link                    from 'next/link';
import toast                   from 'react-hot-toast';
import { formatPrice }         from '@/lib/utils';
import type { CartItem }       from '@/lib/supabase';

interface FormData {
  customer_name:  string;
  contact_number: string;
  email:          string;
  address_full:   string;
  notes:          string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart,    setCart]    = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form,    setForm]    = useState<FormData>({
    customer_name:  '',
    contact_number: '',
    email:          '',
    address_full:   '',
    notes:          '',
  });

  useEffect(() => {
    const raw = sessionStorage.getItem('ast3r_cart');
    if (!raw) {
      toast.error('No items in cart.');
      router.push('/');
      return;
    }
    setCart(JSON.parse(raw));
  }, [router]);

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validate = (): boolean => {
    if (!form.customer_name.trim())  { toast.error('Full name is required.'); return false; }
    if (!form.contact_number.trim()) { toast.error('Contact number is required.'); return false; }
    if (!/^0[0-9]{10}$/.test(form.contact_number.replace(/\s/g, ''))) {
      toast.error('Enter a valid PH mobile number (e.g. 09XX XXX XXXX).');
      return false;
    }
    if (!form.address_full.trim()) { toast.error('Delivery address is required.'); return false; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Enter a valid email address.');
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    // Store form data in session, proceed to payment
    sessionStorage.setItem('ast3r_order_form', JSON.stringify(form));
    toast.success('Order details saved!');
    setTimeout(() => {
      setLoading(false);
      router.push('/payment');
    }, 500);
  };

  if (!cart.length) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <div className="text-center">
          <div className="skeleton w-32 h-32 mx-auto mb-4" />
          <p className="text-brand-gray text-sm">Loading your cart…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-white">

      {/* ── Top Bar ──────────────────────────────────────── */}
      <div className="border-b border-brand-light bg-brand-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-serif text-xl tracking-[0.15em]">AST3R</Link>
          <div className="flex items-center gap-2 text-xs tracking-wide text-brand-gray">
            <span className="font-medium text-brand-orange">1. Details</span>
            <span className="text-brand-light">—</span>
            <span>2. Payment</span>
            <span className="text-brand-light">—</span>
            <span>3. Confirmation</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* ── LEFT: Form ───────────────────────────────── */}
          <div className="lg:col-span-3 page-enter">
            <div className="mb-8">
              <span className="accent-line mb-3" />
              <h1 className="display-md text-brand-black">Delivery Details</h1>
              <p className="text-brand-gray text-sm mt-2">
                Please fill in your complete details for delivery.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Full Name */}
              <div>
                <label className="input-label">Full Name *</label>
                <input
                  type="text"
                  name="customer_name"
                  value={form.customer_name}
                  onChange={handleChange}
                  placeholder="e.g. Maria Santos"
                  className="input-field"
                  required
                />
              </div>

              {/* Contact + Email (2 col on desktop) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="input-label">Contact Number *</label>
                  <input
                    type="tel"
                    name="contact_number"
                    value={form.contact_number}
                    onChange={handleChange}
                    placeholder="09XX XXX XXXX"
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label className="input-label">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="yourname@email.com"
                    className="input-field"
                  />
                  <p className="text-xs text-brand-gray mt-1">For order updates</p>
                </div>
              </div>

              {/* Full Address */}
              <div>
                <label className="input-label">Complete Delivery Address *</label>
                <textarea
                  name="address_full"
                  value={form.address_full}
                  onChange={handleChange}
                  placeholder="House/Unit No., Street, Barangay, City, Province, Zip Code"
                  rows={3}
                  className="input-field resize-none"
                  required
                />
                <p className="text-xs text-brand-gray mt-1">
                  Please include barangay, city, and province for faster processing.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="input-label">Order Notes (Optional)</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Special instructions, preferred delivery time, etc."
                  rows={2}
                  className="input-field resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Saving…' : 'Proceed to Payment'}
                {!loading && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                )}
              </button>
            </form>
          </div>

          {/* ── RIGHT: Order Summary ──────────────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-brand-cream p-8 sticky top-24">
              <h2 className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-6">
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                {cart.map((item) => (
                  <div key={item.sku} className="flex gap-4">
                    <div className="relative w-16 h-20 bg-brand-light flex-shrink-0 overflow-hidden">
                      {item.image_url && (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-brand-black truncate">{item.name}</p>
                      <p className="text-xs text-brand-gray font-mono mt-0.5">{item.sku}</p>
                      <p className="text-xs text-brand-gray mt-1">Qty: {item.quantity}</p>
                      <p className="text-sm font-medium text-brand-black mt-1">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-brand-light pt-4 space-y-2">
                <div className="flex justify-between text-sm text-brand-gray">
                  <span>Subtotal</span>
                  <span>{formatPrice(total)}</span>
                </div>
                <div className="flex justify-between text-sm text-brand-gray">
                  <span>Shipping</span>
                  <span className="text-brand-orange">Calculated at payment</span>
                </div>
              </div>

              <div className="border-t border-brand-black mt-4 pt-4 flex justify-between">
                <span className="font-medium text-sm tracking-wide">Total</span>
                <span className="font-serif text-xl font-medium">{formatPrice(total)}</span>
              </div>

              <p className="text-xs text-brand-gray text-center mt-4">
                Shipping fee will be added based on your location
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
