// src/app/payment/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter }    from 'next/navigation';
import Image            from 'next/image';
import Link             from 'next/link';
import toast            from 'react-hot-toast';
import { supabase }     from '@/lib/supabase';
import { formatPrice, generateOrderCode } from '@/lib/utils';

export default function PaymentPage() {
  const router = useRouter();
  const [cart,      setCart]      = useState<any[]>([]);
  const [orderForm, setOrderForm] = useState<any>(null);
  const [paymentQR,  setPaymentQR]  = useState<string|null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPrev, setProofPrev] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoData, setPromoData] = useState<any>(null);
  const [promoErr,  setPromoErr]  = useState('');
  const [giftWrap,  setGiftWrap]  = useState(false);
  const [giftMsg,   setGiftMsg]   = useState('');
  const [loading,    setLoading]    = useState(false);
  const [showPolicy,   setShowPolicy]   = useState(false);
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cartRaw = sessionStorage.getItem('ast3r_cart');
    const formRaw = sessionStorage.getItem('ast3r_order_form');
    if (!cartRaw || !formRaw) { toast.error('Session expired.'); router.push('/'); return; }
    setCart(JSON.parse(cartRaw));
    setOrderForm(JSON.parse(formRaw));

    // Load single payment QR from payment_settings
    supabase.from('payment_settings').select('qr_image_url').eq('is_active', true).limit(1)
      .then(({ data, error }: any) => {
        if (!error && data?.[0]?.qr_image_url) setPaymentQR(data[0].qr_image_url);
      });
  }, [router]);

  const subtotal        = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const codShippingFee  = orderForm?.cod_shipping_fee ?? (
    orderForm?.total_items ? 199 + Math.max(0, (orderForm.total_items - 1)) * 99 : 199
  );
  const shippingFee     = orderForm?.shipping_fee ?? 0;
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


  const validate = (): boolean => {
    if (!proofFile) { toast.error('Please upload your proof of payment screenshot'); return false; }
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
          method: { type: 'gcash', label: 'QR Payment' }, proofUrl,
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

    if (!cart.length) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
    </div>
  );

  // Guard: wait for session data to load before rendering
  if (!orderForm || !cart) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-brand-black border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-brand-gray tracking-widest uppercase">Loading order details...</p>
        </div>
      </div>
    );
  }

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
                            {/* ── SINGLE QR PAYMENT ── */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <h2 className="font-semibold text-gray-900 text-sm tracking-wide">Payment</h2>
                  <p className="text-xs text-gray-400 mt-1">Scan the QR code below, send the exact amount, then upload your screenshot proof</p>
                </div>
                {paymentQR ? (
                  <img src={paymentQR} alt="Payment QR Code" className="w-full block bg-white" style={{display:"block",width:"100%"}} />
                ) : (
                  <div className="mx-5 mb-5 mt-2 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center py-12 text-gray-300">
                    <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.243m-4.243 0l-.001.01M12 12H8M6 20h4m0 0h4m-4 0v-4m0 0H8" />
                    </svg>
                    <p className="text-xs text-center px-4">Payment QR not yet uploaded.<br/>Go to Admin → Settings → Payment QR</p>
                  </div>
                )}
                <div className="px-5 py-4 bg-orange-50 border-t border-orange-100 flex items-center justify-between">
                  <span className="text-sm text-gray-600 font-medium">Amount to pay</span>
                  <span className="font-bold text-2xl text-orange-500">{formatPrice(total)}</span>
                </div>
              </div>

              {/* ── PROOF OF PAYMENT UPLOAD ── */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Upload Proof of Payment</h3>
                  <p className="text-xs text-gray-400">Screenshot of your payment confirmation (GCash, bank transfer, etc.)</p>
                </div>

                {/* Drop zone */}
                <div
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleProofFile(f); }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    proofFile ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                  }`}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProofFile(f); }}
                  />
                  {proofPrev ? (
                    <div className="space-y-2">
                      <img src={proofPrev} alt="Proof preview" className="max-h-48 mx-auto rounded-lg object-contain border border-orange-200" />
                      <p className="text-xs text-orange-600 font-medium">✓ {proofFile?.name}</p>
                      <p className="text-xs text-gray-400">Click to replace</p>
                    </div>
                  ) : proofFile ? (
                    <div className="space-y-1">
                      <p className="text-2xl">📄</p>
                      <p className="text-sm font-medium text-orange-600">✓ {proofFile.name}</p>
                      <p className="text-xs text-gray-400">Click to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                      </div>
                      <p className="text-sm font-medium text-gray-700">Tap to upload screenshot</p>
                      <p className="text-xs text-gray-400">or drag and drop · JPG, PNG, PDF</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={giftWrap} onChange={e => setGiftWrap(e.target.checked)} className="mt-0.5 accent-orange-500 w-4 h-4" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">🎁 Add Gift Wrapping <span className="text-orange-500">+P50</span></p>
                    <p className="text-xs text-gray-400 mt-0.5">Premium packaging with AST3R ribbon. Add a personal message below.</p>
                  </div>
                </label>
                {giftWrap && (
                  <div className="mt-3 space-y-2">
                    <textarea value={giftMsg} onChange={e => setGiftMsg(e.target.value)}
                      placeholder="Write your gift message here... (optional)"
                      rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-gray-400" />
                    {/* Gift card preview */}
                    {giftMsg && (
                      <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-400 to-orange-300" />
                        <p className="text-[10px] tracking-[0.25em] uppercase text-orange-400 mb-2 font-medium">AST3R Gift Message Preview</p>
                        <p className="text-sm text-gray-700 leading-relaxed italic">&ldquo;{giftMsg}&rdquo;</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className="text-orange-400 text-xs">⊛</span>
                          <span className="text-[10px] text-orange-400 tracking-wider">AST3R Fashion · With love</span>
                        </div>
                      </div>
                    )}
                  </div>
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
                <button type="submit" disabled={loading || !proofFile || !policyAgreed}
                  className="w-full bg-gray-900 text-white py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {loading ? 'Placing Order...' : !proofFile ? 'Upload Proof of Payment First' : !policyAgreed ? 'Agree to Policy to Continue' : 'Place Order'}
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
              <p>Customers are strongly advised to <strong className="text-gray-900 font-medium">inspect their order in the presence of the courier</strong> before signing or acknowledging receipt. If you notice visible damage to the packaging or contents at the time of delivery, you may refuse the parcel and contact us immediately at <strong className="text-gray-900 font-medium">inquiry@ast3r.store</strong> or <strong className="text-gray-900 font-medium">0967-4000-040</strong>.</p>
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
                <p><span className="text-gray-400">Phone / Viber:</span> <strong className="text-gray-900">0967-4000-040</strong></p>
                <p><span className="text-gray-400">Instagram:</span> <strong className="text-gray-900">@ast3r.ph</strong></p>
                <p><span className="text-gray-400">Store:</span> <strong className="text-gray-900">SVC Amadeo, Cavite</strong></p>
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
