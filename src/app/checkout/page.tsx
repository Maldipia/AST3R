// src/app/checkout/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter }           from 'next/navigation';
import Image                   from 'next/image';
import Link                    from 'next/link';
import toast                   from 'react-hot-toast';
import { formatPrice }         from '@/lib/utils';
import { REGIONS, guessRegionFromAddress, type RegionId } from '@/lib/shipping';
import type { CartItem }       from '@/lib/cart';
import { supabase }            from '@/lib/supabase';

// ── COD shipping fee logic ─────────────────────────────────────
// 1 item = ₱199, each additional item +₱99
function calcCODShipping(itemCount: number): number {
  if (itemCount <= 0) return 0;
  return 199 + Math.max(0, itemCount - 1) * 99;
}

interface FormData {
  customer_name:  string;
  contact_number: string;
  email:          string;
  address_full:   string;
  barangay:       string;
  city:           string;
  province:       string;
  region_id:      RegionId | '';
  courier:        string;
  special_req:    string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [cart,    setCart]    = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [payMethod, setPayMethod] = useState<string>('');
  const [related, setRelated] = useState<any[]>([]); // from session if coming back
  const [form,    setForm]    = useState<FormData>({
    customer_name:  '',
    contact_number: '',
    email:          '',
    address_full:   '',
    barangay:       '',
    city:           '',
    province:       '',
    region_id:      '',
    courier:        '',
    special_req:    '',
  });

  useEffect(() => {
    const raw = sessionStorage.getItem('ast3r_cart');
    if (!raw) { toast.error('No items in cart.'); router.push('/'); return; }
    const cartData = JSON.parse(raw);
    setCart(cartData);

    // Restore form if returning from payment page
    const savedForm = sessionStorage.getItem('ast3r_order_form');
    if (savedForm) {
      try { setForm(JSON.parse(savedForm)); } catch {}
    }

    // Load related products (exclude cart items)
    const skus = cartData.map((i: CartItem) => i.sku);
    const cats = [...new Set(cartData.map((i: CartItem) => i.sku.split('-').slice(0,2).join('-')))];
    supabase.from('products')
      .select('sku, name, price, compare_price, image_url, category')
      .eq('status', 'active')
      .not('sku', 'in', `(${skus.join(',')})`)
      .limit(4)
      .then(({ data }) => { if (data) setRelated(data); });
  }, [router]);

  // Auto-detect region
  useEffect(() => {
    if (!form.city && !form.province) return;
    const combined = `${form.city} ${form.province}`;
    const guessed  = guessRegionFromAddress(combined);
    if (guessed && !form.region_id) {
      setForm(f => ({ ...f, region_id: guessed, courier: '' }));
    }
  }, [form.city, form.province]);

  const totalItems   = cart.reduce((sum, i) => sum + i.quantity, 0);
  const selectedRegion = REGIONS.find(r => r.id === form.region_id);

  // Shipping fee: COD uses special tiered rate, others use region rate
  // We don't know COD vs not here — just show region fee; COD adjustment happens on payment page
  const shippingFee  = selectedRegion ? selectedRegion.fee : 0;
  const subtotal     = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const total        = subtotal + shippingFee;

  // COD preview fee
  const codFee       = calcCODShipping(totalItems);

  const set = (k: keyof FormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    if (!form.customer_name.trim())  { toast.error('Full name is required'); return false; }
    if (!form.contact_number.trim()) { toast.error('Contact number is required'); return false; }
    const phone = form.contact_number.replace(/[\s-]/g, '');
    if (!/^(09|\+639)\d{9}$/.test(phone)) {
      toast.error('Enter a valid PH mobile number (09XXXXXXXXX)'); return false;
    }
    if (!form.address_full.trim())   { toast.error('Street address is required'); return false; }
    if (!form.city.trim())           { toast.error('City / Municipality is required'); return false; }
    if (!form.province.trim())       { toast.error('Province is required'); return false; }
    if (!form.region_id)             { toast.error('Please select your region'); return false; }
    if (!form.courier)               { toast.error('Please choose a courier'); return false; }
    if (!form.email.trim()) { toast.error('Email address is required for order updates'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Enter a valid email address'); return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);

    const fullAddress = [
      form.address_full,
      form.barangay,
      form.city,
      form.province,
    ].filter(Boolean).join(', ');

    sessionStorage.setItem('ast3r_order_form', JSON.stringify({
      ...form,
      address_full:    fullAddress,
      shipping_fee:    shippingFee,
      cod_shipping_fee: codFee,
      total_items:     totalItems,
      subtotal,
      total,
      region_label:    selectedRegion?.label,
    }));
    toast.success('Details saved!');
    setTimeout(() => { setLoading(false); router.push('/payment'); }, 300);
  };

  if (!cart.length) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm animate-pulse">Loading cart...</p>
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="font-serif text-lg tracking-[0.15em] text-gray-900">AST3R</Link>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="font-semibold text-gray-900">1. Details</span>
            <span className="mx-1 text-gray-300">—</span>
            <span>2. Payment</span>
            <span className="mx-1 text-gray-300">—</span>
            <span>3. Confirm</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* ── LEFT: Form ── */}
            <div className="lg:col-span-3 space-y-5">

              {/* Personal Info */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h2 className="font-semibold text-gray-900">Personal Information</h2>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Full Name *</label>
                  <input type="text" value={form.customer_name}
                    onChange={e => set('customer_name', e.target.value)}
                    placeholder="e.g. Maria Santos"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" required />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Contact Number *</label>
                    <input type="tel" value={form.contact_number}
                      onChange={e => set('contact_number', e.target.value)}
                      placeholder="09XX XXX XXXX"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Email Address *</label>
                    <input type="email" value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="yourname@email.com"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" />
                    <p className="text-xs text-gray-400 mt-1">Required — we'll send your order updates here</p>
                  </div>
                </div>
              </div>

              {/* Delivery Address */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <h2 className="font-semibold text-gray-900">Delivery Address</h2>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">House / Unit No. & Street *</label>
                  <input type="text" value={form.address_full}
                    onChange={e => set('address_full', e.target.value)}
                    placeholder="e.g. 123 Rizal Street"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" required />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Barangay</label>
                  <input type="text" value={form.barangay}
                    onChange={e => set('barangay', e.target.value)}
                    placeholder="e.g. Barangay San Jose"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">City / Municipality *</label>
                    <input type="text" value={form.city}
                      onChange={e => set('city', e.target.value)}
                      placeholder="e.g. Tagaytay City"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Province *</label>
                    <input type="text" value={form.province}
                      onChange={e => set('province', e.target.value)}
                      placeholder="e.g. Cavite"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" required />
                  </div>
                </div>

                {/* Region + courier */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Region / Island Group *</label>
                  <select value={form.region_id}
                    onChange={e => { set('region_id', e.target.value as RegionId); set('courier', ''); }}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 bg-white transition-all" required>
                    <option value="">— Select your region —</option>
                    {REGIONS.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.label} — Standard: {formatPrice(r.fee)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Courier */}
                {selectedRegion && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Preferred Courier *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedRegion.couriers.map(c => (
                        <button key={c} type="button" onClick={() => set('courier', c)}
                          className={`py-2.5 px-3 text-sm border rounded-lg text-left transition-all flex items-center gap-2 ${
                            form.courier === c
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}>
                          <span className="text-base">🚚</span> {c}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Shipping fee display */}
                {selectedRegion && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Estimated Shipping</p>
                        <p className="text-xs text-gray-400 mt-0.5">{selectedRegion.days}</p>
                      </div>
                      <p className="font-bold text-gray-900 text-lg">{formatPrice(shippingFee)}</p>
                    </div>

                    {/* COD note */}
                    <div className="border-t border-gray-200 pt-2.5">
                      <div className="flex items-start gap-2">
                        <span className="text-base mt-0.5">💵</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-700">Cash on Delivery (COD) shipping fee:</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            1st item: <strong>₱199</strong> · Each additional item: <strong>+₱99</strong>
                          </p>
                          <p className="text-sm font-bold text-orange-500 mt-1">
                            Your order ({totalItems} item{totalItems !== 1 ? 's' : ''}): <strong>{formatPrice(codFee)}</strong> if COD
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Special Requests */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-900 mb-1">Special Requests</h2>
                <p className="text-xs text-gray-400 mb-3">Preferred delivery time, landmarks, instructions for the courier, gift messages, etc.</p>
                <textarea value={form.special_req}
                  onChange={e => set('special_req', e.target.value)}
                  placeholder="e.g. Leave at the guard house. Call before delivery. Handle with care."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-gray-900 transition-all" />
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-gray-900 text-white py-4 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Saving...' : (
                  <>Proceed to Payment <span>→</span></>
                )}
              </button>
            </div>

            {/* ── RIGHT: Order Summary ── */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-20 space-y-4">
                <h2 className="font-semibold text-gray-900">Order Summary</h2>

                {/* Items */}
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.sku + (item.size || '')} className="flex gap-3">
                      <div className="relative w-14 h-16 bg-gray-100 flex-shrink-0 rounded-lg overflow-hidden">
                        {item.image_url && (
                          <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="flex gap-2 mt-0.5">
                          <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                          {item.size && <p className="text-xs text-gray-500 font-medium">· {item.size}</p>}
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                          <p className="text-sm font-semibold text-gray-900">{formatPrice(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pricing */}
                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal ({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Shipping</span>
                    {selectedRegion ? (
                      <span className="font-medium text-gray-900">{formatPrice(shippingFee)}</span>
                    ) : (
                      <span className="italic text-xs">Select region</span>
                    )}
                  </div>
                  {form.courier && (
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Courier</span><span>{form.courier}</span>
                    </div>
                  )}
                </div>

                {/* Total */}
                <div className="border-t border-gray-200 pt-3 flex justify-between items-baseline">
                  <span className="font-semibold text-gray-900">Total</span>
                  <div className="text-right">
                    <p className="font-bold text-xl text-gray-900">{formatPrice(total)}</p>
                    {selectedRegion && <p className="text-xs text-gray-400">incl. {formatPrice(shippingFee)} shipping</p>}
                  </div>
                </div>

                {/* COD fee callout */}
                {selectedRegion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                    <p className="font-semibold text-amber-800 mb-1">💵 Choosing COD?</p>
                    <p className="text-amber-700">
                      Shipping fee will be <strong>{formatPrice(codFee)}</strong> for {totalItems} item{totalItems !== 1 ? 's' : ''}<br/>
                      (₱199 first item + ₱99 per additional)
                    </p>
                  </div>
                )}

                {!selectedRegion && (
                  <p className="text-xs text-orange-500 text-center bg-orange-50 border border-orange-200 rounded-lg p-2">
                    Select your region to see shipping fee
                  </p>
                )}
              </div>
            </div>

          </div>
        </form>
      </div>
    </div>

    {/* You might also like */}
    {related.length > 0 && (
      <div className="max-w-5xl mx-auto px-4 pb-12">
        <div className="border-t border-gray-100 pt-8">
          <p className="text-xs font-medium tracking-[0.2em] uppercase text-gray-400 mb-4">You Might Also Like</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {related.map(p => {
              const onSale = p.compare_price && p.compare_price < p.price;
              return (
                <a key={p.sku} href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer"
                  className="group block bg-white border border-gray-100 hover:border-gray-300 transition-colors p-2">
                  <div className="relative aspect-[3/4] bg-gray-50 overflow-hidden mb-2">
                    {p.image_url
                      ? <Image src={p.image_url} alt={p.name} fill className="object-cover object-top group-hover:scale-105 transition-transform duration-500" sizes="150px"/>
                      : <div className="absolute inset-0 flex items-center justify-center text-gray-200 font-serif text-xs">AST3R</div>}
                  </div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">{p.category}</p>
                  <p className="text-xs font-medium text-gray-900 line-clamp-1 group-hover:text-orange-500 transition-colors">{p.name}</p>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    {onSale
                      ? <><span className="text-xs text-orange-500 font-medium">{formatPrice(p.compare_price)}</span>
                          <span className="text-[10px] text-gray-400 line-through">{formatPrice(p.price)}</span></>
                      : <span className="text-xs font-medium">{formatPrice(p.price)}</span>}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
