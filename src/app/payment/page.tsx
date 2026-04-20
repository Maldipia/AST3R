// src/app/payment/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter }    from 'next/navigation';
import Image            from 'next/image';
import Link             from 'next/link';
import toast            from 'react-hot-toast';
import { supabase }     from '@/lib/supabase';
import { formatPrice, generateOrderCode } from '@/lib/utils';

interface PaymentMethod {
  id: string; type: string; label: string;
  account_name: string | null; account_number: string | null;
  qr_url: string | null; instructions: string | null;
  sort_order: number;
}

export default function PaymentPage() {
  const router = useRouter();
  const [cart,      setCart]      = useState<any[]>([]);
  const [orderForm, setOrderForm] = useState<any>(null);
  const [methods,   setMethods]   = useState<PaymentMethod[]>([]);
  const [method,    setMethod]    = useState<PaymentMethod | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPrev, setProofPrev] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoData, setPromoData] = useState<any>(null);
  const [promoErr,  setPromoErr]  = useState('');
  const [giftWrap,  setGiftWrap]  = useState(false);
  const [giftMsg,   setGiftMsg]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cartRaw = sessionStorage.getItem('ast3r_cart');
    const formRaw = sessionStorage.getItem('ast3r_order_form');
    if (!cartRaw || !formRaw) { toast.error('Session expired.'); router.push('/'); return; }
    setCart(JSON.parse(cartRaw));
    setOrderForm(JSON.parse(formRaw));

    // Load payment methods from DB
    supabase.from('payment_qr_codes').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => { if (data) setMethods(data); });
  }, [router]);

  const subtotal        = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const isCODSelected   = method?.type === 'cod';
  // COD uses tiered fee: ₱199 first item + ₱99 each additional
  const codShippingFee  = orderForm?.cod_shipping_fee ?? (
    orderForm?.total_items ? 199 + Math.max(0, (orderForm.total_items - 1)) * 99 : 199
  );
  const shippingFee     = isCODSelected ? codShippingFee : (orderForm?.shipping_fee ?? 0);
  const discount    = promoData
    ? promoData.type === 'percent'       ? Math.round(subtotal * promoData.value / 100)
    : promoData.type === 'fixed'         ? Math.min(promoData.value, subtotal)
    : promoData.type === 'free_shipping' ? shippingFee : 0
    : 0;
  const giftWrapFee = giftWrap ? 50 : 0;
  const total       = subtotal + shippingFee - discount + giftWrapFee;

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoErr('');
    const { data, error } = await supabase.from('promo_codes')
      .select('*').eq('code', promoCode.trim().toUpperCase()).eq('active', true).single();
    if (error || !data) { setPromoErr('Invalid or expired promo code'); setPromoData(null); return; }
    if (data.min_order && subtotal < data.min_order) { setPromoErr('Minimum order P' + data.min_order + ' required'); setPromoData(null); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setPromoErr('This promo code has expired'); setPromoData(null); return; }
    if (data.max_uses && data.uses >= data.max_uses) { setPromoErr('Promo code limit reached'); setPromoData(null); return; }
    setPromoData(data);
    toast.success('Promo applied! ' + (data.type === 'percent' ? data.value + '% off' : data.type === 'free_shipping' ? 'Free shipping' : 'P' + data.value + ' off'));
  };

  const handleProofFile = (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      toast.error('Please upload an image or PDF'); return;
    }
    setProofFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = e => setProofPrev(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setProofPrev('');
    }
  };

  const isPayLater = method?.type === 'later';
  const isCOD      = method?.type === 'cod';
  const isCOP      = method?.type === 'cop';
  const needsProof = !isPayLater && !isCOD && !isCOP;

  const validate = (): boolean => {
    if (!method) { toast.error('Please select a payment method'); return false; }
    if (needsProof && !proofFile) { toast.error('Please upload your payment screenshot'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!policyAgreed) { setShowPolicy(true); return; }
    setLoading(true);
    const loadToast = toast.loading('Placing your order...');

    try {
      const orderCode = generateOrderCode();

      // Upload payment proof first if provided
      let proofUrl = null;
      if (proofFile) {
        const ext = proofFile.name.split('.').pop() || 'jpg';
        const fn  = 'proof-' + orderCode + '.' + ext;
        const { error: upErr } = await supabase.storage
          .from('payment-proofs').upload(fn, proofFile, { upsert: true });
        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('payment-proofs').getPublicUrl(fn);
          proofUrl = publicUrl;
        }
      }

      // Create order via API route (uses service role — no RLS issues)
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderCode, orderForm, cart,
          total, subtotal, shippingFee, discount,
          promoData, giftWrap, giftMsg,
          method, proofUrl,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to create order');

            // 7. Send confirmation email (non-blocking)
      fetch('/api/send-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'confirmation', order_code: orderCode }),
      }).catch(() => {});

      // 8. Clear session
      sessionStorage.removeItem('ast3r_cart');
      sessionStorage.removeItem('ast3r_order_form');

      toast.dismiss(loadToast);
      toast.success('Order placed!');
      router.push('/confirmation/' + orderCode);
    } catch (err: any) {
      toast.dismiss(loadToast);
      toast.error(err.message || 'Failed to place order. Please try again.');
      setLoading(false);
    }
  };

  const ICONS: Record<string, string> = {
    gcash: '📱', maya: '💙', bdo: '🏦', bpi: '🏦', cod: '💵', cop: '🏪', later: '🕐',
  };

  if (!cart.length) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
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
            <span className="text-gray-400">1. Details</span>
            <span className="mx-1">—</span>
            <span className="font-semibold text-gray-900">2. Payment</span>
            <span className="mx-1">—</span>
            <span>3. Confirm</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

            {/* ── LEFT: Payment Methods ── */}
            <div className="lg:col-span-3 space-y-5">

              {/* Customer info summary */}
              {orderForm && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-gray-900 text-sm">Delivering to</h2>
                    <Link href="/checkout" className="text-xs text-orange-500 underline">Edit</Link>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Name</p>
                      <p className="font-medium text-gray-900">{orderForm.customer_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                      <p className="font-medium text-gray-900">{orderForm.contact_number}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-400 mb-0.5">Address</p>
                      <p className="text-sm text-gray-700">{orderForm.address_full}, {orderForm.city}</p>
                    </div>
                    {orderForm.courier && (
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">Courier</p>
                        <p className="text-sm text-gray-700">{orderForm.courier} · {orderForm.region_label || orderForm.region_id}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Payment method selection */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Choose Payment Method</h2>
                <div className="space-y-2">
                  {methods.map(m => (
                    <button key={m.id} type="button"
                      onClick={() => { setMethod(m); setProofFile(null); setProofPrev(''); }}
                      className={`w-full flex items-center gap-3 p-4 border-2 rounded-xl text-left transition-all ${
                        method?.id === m.id
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-100 bg-gray-50 hover:border-gray-300 text-gray-700'
                      }`}>
                      <span className="text-xl flex-shrink-0">{ICONS[m.type] || '💳'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{m.label}</p>
                        {m.account_number && (
                          <p className={`text-xs mt-0.5 ${method?.id === m.id ? 'text-gray-300' : 'text-gray-400'}`}>
                            {m.account_name} · {m.account_number}
                          </p>
                        )}
                      </div>
                      {method?.id === m.id && <span className="text-white text-sm flex-shrink-0">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment details / QR code */}
              {method && !isCOD && !isCOP && !isPayLater && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-900 mb-4">Payment Details</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* QR Code */}
                    <div className="text-center">
                      {method.qr_url ? (
                        <div>
                          <img src={method.qr_url} alt={method.label + ' QR'} className="mx-auto w-44 h-44 object-contain border border-gray-200 rounded-xl p-2 bg-white" />
                          <p className="text-xs text-gray-400 mt-2">Scan to pay via {method.label}</p>
                        </div>
                      ) : (
                        <div className="w-44 h-44 mx-auto border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-300">
                          <span className="text-3xl">{ICONS[method.type]}</span>
                          <p className="text-xs text-center px-2">QR code will appear here once uploaded by admin</p>
                        </div>
                      )}
                    </div>

                    {/* Account details + instructions */}
                    <div className="space-y-3">
                      {method.account_name && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-1">Account Name</p>
                          <p className="font-semibold text-gray-900 text-sm">{method.account_name}</p>
                        </div>
                      )}
                      {method.account_number && (
                        <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-1">Number / Account</p>
                          <p className="font-bold text-gray-900 text-lg tracking-wider">{method.account_number}</p>
                        </div>
                      )}
                      <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-700 mb-1">Amount to Send</p>
                        <p className="font-bold text-blue-900 text-xl">{formatPrice(total)}</p>
                      </div>
                      {method.instructions && (
                        <p className="text-xs text-gray-500 leading-relaxed">{method.instructions}</p>
                      )}
                    </div>
                  </div>

                  {/* Upload proof */}
                  <div className="mt-5 border-t border-gray-100 pt-5">
                    <p className="text-sm font-semibold text-gray-900 mb-3">Upload Payment Proof *</p>
                    <div
                      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${proofFile ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/30'}`}
                      onClick={() => fileRef.current?.click()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleProofFile(f); }}
                      onDragOver={e => e.preventDefault()}>
                      <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleProofFile(f); e.target.value = ''; }} />
                      {proofPrev ? (
                        <div>
                          <img src={proofPrev} alt="proof" className="mx-auto max-h-40 rounded-lg mb-2 object-contain" />
                          <p className="text-xs text-green-600 font-medium">{proofFile?.name}</p>
                          <p className="text-xs text-gray-400 mt-1">Click to change</p>
                        </div>
                      ) : proofFile ? (
                        <div>
                          <p className="text-2xl mb-2">📄</p>
                          <p className="text-xs text-green-600 font-medium">{proofFile.name}</p>
                          <p className="text-xs text-gray-400 mt-1">Click to change</p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-3xl mb-2">📸</p>
                          <p className="text-sm text-gray-500">Click or drag screenshot here</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, or PDF</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* COD info */}
              {isCOD && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                  <p className="text-2xl mb-3">💵</p>
                  <h3 className="font-semibold text-amber-800 mb-2">Cash on Delivery</h3>
                  {/* COD fee breakdown */}
                  <div className="bg-white border border-amber-200 rounded-lg p-3 mb-4">
                    <p className="text-xs font-semibold text-amber-800 mb-2">COD Shipping Fee Breakdown</p>
                    <div className="space-y-1 text-xs text-amber-700">
                      <div className="flex justify-between"><span>1st item</span><span className="font-medium">₱199</span></div>
                      {(orderForm?.total_items || 1) > 1 && (
                        <div className="flex justify-between">
                          <span>{(orderForm?.total_items || 1) - 1} additional item{(orderForm?.total_items || 1) - 1 > 1 ? 's' : ''} × ₱99</span>
                          <span className="font-medium">₱{((orderForm?.total_items || 1) - 1) * 99}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-amber-200 pt-1 font-bold text-amber-900">
                        <span>Total COD Shipping</span>
                        <span>{formatPrice(codShippingFee)}</span>
                      </div>
                    </div>
                  </div>
                  <ul className="text-sm text-amber-700 space-y-1.5">
                    <li>✅ Pay cash when your order arrives</li>
                    <li>✅ Prepare exact amount: <strong>{formatPrice(total)}</strong></li>
                    <li>✅ Available for Metro Manila and Luzon</li>
                    <li>⚠️ Orders may be cancelled if unreachable</li>
                  </ul>
                </div>
              )}

              {/* COP info */}
              {isCOP && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                  <p className="text-2xl mb-3">🏪</p>
                  <h3 className="font-semibold text-purple-800 mb-2">Cash on Pick-up</h3>
                  <ul className="text-sm text-purple-700 space-y-1.5">
                    <li>✅ Visit our store to pay and pick up</li>
                    <li>✅ Bring exact amount: <strong>{formatPrice(total)}</strong></li>
                    <li>📍 AST3R Boutique, Tagaytay City, Cavite</li>
                    <li>🕐 Monday - Saturday, 9AM - 6PM</li>
                  </ul>
                </div>
              )}

              {/* Pay Later info */}
              {isPayLater && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <p className="text-2xl mb-3">🕐</p>
                  <h3 className="font-semibold text-blue-800 mb-2">Pay Later - 3 Days</h3>
                  <p className="text-sm text-blue-700 mb-3">Your order will be reserved for 3 days. Send payment within that time to avoid cancellation.</p>
                  <ul className="text-sm text-blue-700 space-y-1.5">
                    <li>✅ Order reserved immediately</li>
                    <li>✅ Pay within 3 days via GCash, Maya, or bank</li>
                    <li>✅ Send proof to <strong>inquiry@ast3r.store</strong></li>
                    <li>⚠️ Order cancelled if no payment received after 3 days</li>
                  </ul>
                  <div className="mt-3 bg-blue-100 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-800">Amount Due: {formatPrice(total)}</p>
                    <p className="text-xs text-blue-600 mt-0.5">Due within 3 days of placing order</p>
                  </div>
                </div>
              )}

              {/* Promo code */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-sm font-semibold text-gray-900 mb-3">🏷️ Promo Code</p>
                <div className="flex gap-2">
                  <input type="text" placeholder="Enter code (e.g. WELCOME10)"
                    value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && applyPromo()}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-gray-400"
                    disabled={!!promoData} />
                  {promoData ? (
                    <button type="button" onClick={() => { setPromoData(null); setPromoCode(''); setPromoErr(''); }}
                      className="px-4 py-2 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50">Remove</button>
                  ) : (
                    <button type="button" onClick={applyPromo}
                      className="px-4 py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">Apply</button>
                  )}
                </div>
                {promoErr  && <p className="text-red-500 text-xs mt-2">{promoErr}</p>}
                {promoData && <p className="text-green-600 text-xs mt-2 font-medium">Promo applied: {promoData.type === 'percent' ? promoData.value + '% off' : promoData.type === 'free_shipping' ? 'Free shipping' : 'P' + promoData.value + ' off'}</p>}
              </div>

              {/* Gift wrap */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={giftWrap} onChange={e => setGiftWrap(e.target.checked)} className="mt-0.5 accent-orange-500 w-4 h-4" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">🎁 Add Gift Wrapping <span className="text-orange-500">+P50</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">Premium packaging with AST3R ribbon. Add a personal message below.</p>
                  </div>
                </label>
                {giftWrap && (
                  <textarea value={giftMsg} onChange={e => setGiftMsg(e.target.value)}
                    placeholder="Write your gift message here... (optional)"
                    rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none mt-3 focus:outline-none focus:border-gray-400" />
                )}
              </div>
            </div>

            {/* ── RIGHT: Order Summary ── */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-20 space-y-4">
                <h2 className="font-semibold text-gray-900">Order Summary</h2>

                {/* Items */}
                <div className="space-y-3">
                  {cart.map(item => (
                    <div key={item.sku} className="flex gap-3">
                      <div className="relative w-14 h-16 bg-gray-100 flex-shrink-0 rounded-lg overflow-hidden">
                        {item.image_url && <Image src={item.image_url} alt={item.name} fill className="object-cover" sizes="56px" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{item.sku}</p>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                          <p className="text-sm font-semibold text-gray-900">{formatPrice(item.price * item.quantity)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pricing */}
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Shipping ({orderForm?.region_label || 'Standard'})</span>
                    <span>{formatPrice(shippingFee)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600 font-medium">
                      <span>Discount {promoData?.code && '(' + promoData.code + ')'}</span>
                      <span>-{formatPrice(discount)}</span>
                    </div>
                  )}
                  {giftWrap && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Gift Wrap</span><span>+P50</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200">
                    <span>Total</span>
                    <span className="text-orange-500">{formatPrice(total)}</span>
                  </div>
                </div>

                {/* Policy agreement checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={policyAgreed}
                      onChange={e => setPolicyAgreed(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`w-4 h-4 border transition-all duration-150 flex items-center justify-center ${policyAgreed ? 'bg-gray-900 border-gray-900' : 'border-gray-400 group-hover:border-gray-600'}`}>
                      {policyAgreed && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 leading-relaxed">
                    I have read and agree to AST3R's{' '}
                    <button type="button" onClick={() => setShowPolicy(true)} className="text-gray-900 underline underline-offset-2 hover:text-orange-500 transition-colors font-medium">
                      Purchase & Return Policy
                    </button>
                    , including the no-exchange policy on sale items.
                  </span>
                </label>

                {/* Submit */}
                <button type="submit" disabled={loading || !method || !policyAgreed}
                  className="w-full bg-gray-900 text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading ? 'Placing Order...' : !method ? 'Select Payment Method' : !policyAgreed ? 'Agree to Policy to Continue' : isPayLater ? 'Reserve Order' : 'Place Order'}
                </button>

                <p className="text-[11px] text-gray-400 text-center leading-relaxed">
                  Your order is subject to product availability. AST3R reserves the right to cancel orders due to stock discrepancies.
                </p>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>

    {/* ── POLICY MODAL ────────────────────────────────────── */}
    {showPolicy && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowPolicy(false)}>
        <div className="bg-white w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-400 tracking-[0.25em] uppercase mb-0.5">AST3R Fashion</p>
              <h2 className="text-base font-medium text-gray-900 tracking-tight">Purchase & Return Policy</h2>
            </div>
            <button onClick={() => setShowPolicy(false)} className="text-gray-400 hover:text-gray-900 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6 space-y-6 text-sm text-gray-600 leading-relaxed">

            <section>
              <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-900 mb-2">1. Sale Items — No Exchange</h3>
              <p>All items purchased at a discounted or sale price are considered <strong className="text-gray-900 font-medium">final sale</strong>. These items are not eligible for exchange or replacement of any kind, regardless of reason. Please review your size selection carefully before completing your purchase.</p>
            </section>

            <div className="w-full h-px bg-gray-100" />

            <section>
              <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-900 mb-2">2. No Refund Policy</h3>
              <p>AST3R Fashion does not offer monetary refunds once an order has been placed and payment has been confirmed. All sales are considered final upon order confirmation. In the event of an issue on our end (see Section 4), a replacement item or store credit will be issued instead of a refund.</p>
            </section>

            <div className="w-full h-px bg-gray-100" />

            <section>
              <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-900 mb-2">3. Inspect Your Order Upon Arrival</h3>
              <p>Customers are strongly advised to <strong className="text-gray-900 font-medium">inspect their order in the presence of the courier</strong> before signing or acknowledging receipt. If you notice visible damage to the packaging or contents at the time of delivery, you may refuse the parcel and contact us immediately at <strong className="text-gray-900 font-medium">inquiry@ast3r.store</strong> or <strong className="text-gray-900 font-medium">0966 960 6060</strong>.</p>
              <p className="mt-2">Claims for damaged or missing items will not be entertained if the parcel was accepted without notation at the point of delivery.</p>
            </section>

            <div className="w-full h-px bg-gray-100" />

            <section>
              <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-900 mb-2">4. 7-Day Return — Seller Accountability</h3>
              <p>We accept returns within <strong className="text-gray-900 font-medium">7 calendar days</strong> from the date of delivery, strictly in the following circumstances where the issue is attributable to AST3R Fashion:</p>
              <ul className="mt-2 space-y-1.5 list-none">
                {[
                  'Item received is significantly different from the product listing',
                  'Wrong item or size delivered due to a fulfillment error on our end',
                  'Item arrives with a manufacturing defect that was not disclosed',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5 flex-shrink-0">—</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3">To initiate a return, visit <strong className="text-gray-900 font-medium">ast3r.store/returns</strong> or contact us directly within the 7-day window. Items must be unworn, unwashed, and in original condition with all tags intact. Return shipping costs for eligible claims will be covered by AST3R Fashion.</p>
              <p className="mt-2 text-xs text-gray-400">Returns will not be accepted for items that have been worn, washed, altered, or damaged after delivery, or for change-of-mind purchases.</p>
            </section>

            <div className="w-full h-px bg-gray-100" />

            <section>
              <h3 className="text-xs font-semibold tracking-[0.2em] uppercase text-gray-900 mb-2">5. Contact & Support</h3>
              <p>For any concerns regarding your order, please reach out to our team:</p>
              <div className="mt-2 space-y-1 text-xs">
                <p><span className="text-gray-400">Email:</span> <strong className="text-gray-900">inquiry@ast3r.store</strong></p>
                <p><span className="text-gray-400">Phone / Viber:</span> <strong className="text-gray-900">0966 960 6060</strong></p>
                <p><span className="text-gray-400">Instagram:</span> <strong className="text-gray-900">@ast3r.ph</strong></p>
                <p><span className="text-gray-400">Store:</span> <strong className="text-gray-900">AST3R Boutique, Tagaytay City</strong></p>
              </div>
            </section>

          </div>

          {/* Footer CTA */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex gap-3">
            <button onClick={() => setShowPolicy(false)}
              className="flex-1 border border-gray-200 text-gray-500 py-3 text-xs tracking-[0.2em] uppercase font-medium hover:border-gray-400 hover:text-gray-700 transition-all">
              Close
            </button>
            <button onClick={() => { setPolicyAgreed(true); setShowPolicy(false); }}
              className="flex-1 bg-gray-900 text-white py-3 text-xs tracking-[0.2em] uppercase font-medium hover:bg-orange-500 transition-all">
              I Agree & Continue
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
