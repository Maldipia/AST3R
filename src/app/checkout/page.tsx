// src/app/checkout/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Image                   from 'next/image';
import Link                    from 'next/link';
import toast                   from 'react-hot-toast';
import { formatPrice }         from '@/lib/utils';
import { REGIONS, guessRegionFromAddress, getShippingFee, type RegionId } from '@/lib/shipping';
import type { CartItem }       from '@/lib/supabase';

interface FormData {
  customer_name:  string;
  contact_number: string;
  email:          string;
  address_full:   string;
  city:           string;
  region_id:      RegionId | '';
  courier:        string;
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
    city:           '',
    region_id:      '',
    courier:        '',
    notes:          '',
  });

  useEffect(() => {
    const raw = sessionStorage.getItem('ast3r_cart');
    if (!raw) { toast.error('No items in cart.'); router.push('/'); return; }
    setCart(JSON.parse(raw));
  }, [router]);

  // Auto-detect region from address
  useEffect(() => {
    if (!form.address_full && !form.city) return;
    const combined = `${form.address_full} ${form.city}`;
    const guessed  = guessRegionFromAddress(combined);
    if (guessed && !form.region_id) {
      setForm(f => ({ ...f, region_id: guessed, courier: '' }));
    }
  }, [form.address_full, form.city]);

  const selectedRegion  = REGIONS.find(r => r.id === form.region_id);
  const shippingFee     = selectedRegion ? selectedRegion.fee : 0;
  const subtotal        = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total           = subtotal + shippingFee;

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    if (!form.customer_name.trim())  { toast.error('Full name is required'); return false; }
    if (!form.contact_number.trim()) { toast.error('Contact number is required'); return false; }
    if (!/^09\d{9}$/.test(form.contact_number.replace(/[\s-]/g, ''))) {
      toast.error('Enter a valid PH mobile number (09XXXXXXXXX)'); return false;
    }
    if (!form.address_full.trim()) { toast.error('Street address is required'); return false; }
    if (!form.city.trim())         { toast.error('City/Municipality is required'); return false; }
    if (!form.region_id)           { toast.error('Please select your region for shipping'); return false; }
    if (!form.courier)             { toast.error('Please choose a courier'); return false; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Enter a valid email address'); return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    sessionStorage.setItem('ast3r_order_form', JSON.stringify({
      ...form,
      shipping_fee: shippingFee,
      subtotal,
      total,
      region_label: selectedRegion?.label,
    }));
    toast.success('Details saved!');
    setTimeout(() => { setLoading(false); router.push('/payment'); }, 400);
  };

  if (!cart.length) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream">
      <p className="text-brand-gray text-sm animate-pulse">Loading cart…</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-white">

      {/* Top Bar */}
      <div className="border-b border-brand-light bg-brand-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-serif text-xl tracking-[0.15em]">AST3R</Link>
          <div className="flex items-center gap-2 text-xs tracking-wide text-brand-gray">
            <span className="font-medium text-brand-orange">1. Details</span>
            <span className="text-brand-light mx-1">—</span>
            <span>2. Payment</span>
            <span className="text-brand-light mx-1">—</span>
            <span>3. Confirm</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* ── LEFT: Form ── */}
          <div className="lg:col-span-3 page-enter">
            <div className="mb-8">
              <span className="accent-line mb-3" />
              <h1 className="display-md text-brand-black">Delivery Details</h1>
              <p className="text-brand-gray text-sm mt-2">Fill in your complete details for delivery.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Name */}
              <div>
                <label className="input-label">Full Name *</label>
                <input type="text" value={form.customer_name}
                  onChange={e => set('customer_name', e.target.value)}
                  placeholder="e.g. Maria Santos" className="input-field" required />
              </div>

              {/* Contact + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="input-label">Contact Number *</label>
                  <input type="tel" value={form.contact_number}
                    onChange={e => set('contact_number', e.target.value)}
                    placeholder="09XX XXX XXXX" className="input-field" required />
                </div>
                <div>
                  <label className="input-label">Email Address</label>
                  <input type="email" value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="yourname@email.com" className="input-field" />
                  <p className="text-xs text-brand-gray mt-1">For order updates</p>
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label className="input-label">Street Address *</label>
                <textarea value={form.address_full}
                  onChange={e => set('address_full', e.target.value)}
                  placeholder="House/Unit No., Street Name, Barangay"
                  rows={2} className="input-field resize-none" required />
              </div>

              {/* City + Region */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="input-label">City / Municipality *</label>
                  <input type="text" value={form.city}
                    onChange={e => set('city', e.target.value)}
                    placeholder="e.g. Tagaytay City" className="input-field" required />
                </div>
                <div>
                  <label className="input-label">Province / Region *</label>
                  <select value={form.region_id}
                    onChange={e => set('region_id', e.target.value as RegionId)}
                    className="input-field" required>
                    <option value="">— Select your region —</option>
                    {REGIONS.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.label} — ₱{r.fee}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Region info + courier selector */}
              {selectedRegion && (
                <div className="border border-brand-light bg-brand-cream p-5 space-y-4 animate-fade-in">
                  {/* Shipping details */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-1">
                        Shipping to {selectedRegion.label}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="font-serif text-2xl font-medium text-brand-black">
                          {formatPrice(selectedRegion.fee)}
                        </span>
                        <span className="text-xs text-brand-gray">{selectedRegion.days}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-brand-gray">Order Total</p>
                      <p className="font-serif text-xl font-medium text-brand-orange">{formatPrice(total)}</p>
                    </div>
                  </div>

                  {/* Courier selection */}
                  <div>
                    <label className="input-label">Choose Courier *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedRegion.couriers.map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => set('courier', c)}
                          className={`
                            py-3 px-4 text-sm font-medium border transition-all text-left
                            ${form.courier === c
                              ? 'border-brand-black bg-brand-black text-white'
                              : 'border-brand-light text-brand-gray hover:border-brand-black hover:text-brand-black'
                            }
                          `}
                        >
                          🚚 {c}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="input-label">Order Notes (Optional)</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Special instructions, preferred delivery time, landmarks, etc."
                  rows={2} className="input-field resize-none" />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Saving…' : 'Proceed to Payment'}
                {!loading && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                )}
              </button>
            </form>
          </div>

          {/* ── RIGHT: Order Summary ── */}
          <div className="lg:col-span-2">
            <div className="bg-brand-cream p-8 sticky top-24">
              <h2 className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-6">Order Summary</h2>

              {/* Items */}
              <div className="space-y-4 mb-6">
                {cart.map(item => (
                  <div key={item.sku} className="flex gap-4">
                    <div className="relative w-16 h-20 bg-brand-light flex-shrink-0 overflow-hidden">
                      {item.image_url && (
                        <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="64px" />
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

              {/* Pricing breakdown */}
              <div className="border-t border-brand-light pt-4 space-y-2.5">
                <div className="flex justify-between text-sm text-brand-gray">
                  <span>Subtotal</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-gray">Shipping</span>
                  {selectedRegion ? (
                    <div className="text-right">
                      <span className="font-medium text-brand-black">{formatPrice(shippingFee)}</span>
                      <p className="text-xs text-brand-gray">{selectedRegion.label}</p>
                    </div>
                  ) : (
                    <span className="text-brand-gray italic text-xs">Select region</span>
                  )}
                </div>
                {form.courier && (
                  <div className="flex justify-between text-xs text-brand-gray">
                    <span>Courier</span>
                    <span>{form.courier}</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="border-t border-brand-black mt-4 pt-4 flex justify-between items-baseline">
                <span className="font-medium text-sm tracking-wide">Total</span>
                <div className="text-right">
                  <p className="font-serif text-2xl font-medium text-brand-black">{formatPrice(total)}</p>
                  {selectedRegion && (
                    <p className="text-xs text-brand-gray">incl. {formatPrice(shippingFee)} shipping</p>
                  )}
                </div>
              </div>

              {/* Shipping note */}
              {!selectedRegion && (
                <p className="text-xs text-brand-orange text-center mt-4 border border-brand-orange/30 bg-orange-50 p-2">
                  ⚠️ Select your region to see shipping fee
                </p>
              )}

              {/* Delivery estimate */}
              {selectedRegion && (
                <div className="mt-4 text-center bg-brand-white border border-brand-light p-3">
                  <p className="text-xs text-brand-gray">
                    📦 Estimated delivery: <strong>{selectedRegion.days}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
