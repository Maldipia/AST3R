// src/app/payment/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import Image                                 from 'next/image';
import Link                                  from 'next/link';
import { useDropzone }                       from 'react-dropzone';
import toast                                 from 'react-hot-toast';
import { supabase }                          from '@/lib/supabase';
import { formatPrice, generateOrderCode, PAYMENT_INSTRUCTIONS } from '@/lib/utils';
import type { CartItem }                     from '@/lib/supabase';

type PaymentMethod = 'GCash' | 'bank' | 'COD';

export default function PaymentPage() {
  const router = useRouter();

  const [cart,      setCart]      = useState<CartItem[]>([]);
  const [orderForm, setOrderForm] = useState<any>(null);
  const [method,    setMethod]    = useState<PaymentMethod>('GCash');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPrev, setProofPrev] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoData, setPromoData] = useState<any>(null);
  const [promoErr,  setPromoErr]  = useState('');
  const [giftWrap,  setGiftWrap]  = useState(false);
  const [giftMsg,   setGiftMsg]   = useState('');

  useEffect(() => {
    const cartRaw = sessionStorage.getItem('ast3r_cart');
    const formRaw = sessionStorage.getItem('ast3r_order_form');
    if (!cartRaw || !formRaw) {
      toast.error('Session expired. Please start again.');
      router.push('/');
      return;
    }
    setCart(JSON.parse(cartRaw));
    setOrderForm(JSON.parse(formRaw));
  }, [router]);

  const subtotal     = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shippingFee  = orderForm?.shipping_fee ?? 0;
  const discount     = promoData
    ? promoData.type === 'percent'       ? Math.round(subtotal * promoData.value / 100)
    : promoData.type === 'fixed'         ? Math.min(promoData.value, subtotal)
    : promoData.type === 'free_shipping' ? shippingFee
    : 0
    : 0;
  const giftWrapFee  = giftWrap ? 50 : 0;
  const total        = subtotal + shippingFee - discount + giftWrapFee;

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoErr('');
    const { data, error } = await (await import('@/lib/supabase')).supabase
      .from('promo_codes')
      .select('*')
      .eq('code', promoCode.trim().toUpperCase())
      .eq('active', true)
      .single();
    if (error || !data) { setPromoErr('Invalid or expired promo code'); setPromoData(null); return; }
    if (data.min_order && subtotal < data.min_order) { setPromoErr(`Minimum order ₱${data.min_order} required`); setPromoData(null); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setPromoErr('This promo code has expired'); setPromoData(null); return; }
    if (data.max_uses && data.uses >= data.max_uses) { setPromoErr('This promo code has reached its limit'); setPromoData(null); return; }
    setPromoData(data);
    toast.success(`Promo applied! ${data.type === 'percent' ? data.value + '% off' : data.type === 'free_shipping' ? 'Free shipping' : '₱' + data.value + ' off'}`);
  };

  // ── Dropzone ──────────────────────────────────────────────
  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB.');
      return;
    }
    setProofFile(file);
    setProofPrev(URL.createObjectURL(file));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 1,
  });

  // ── Submit Order ──────────────────────────────────────────
  const handleSubmit = async () => {
    // Validation
    if (method !== 'COD' && !proofFile) {
      toast.error('Please upload your payment proof.');
      return;
    }

    setLoading(true);
    const loadToast = toast.loading('Placing your order…');

    try {
      const orderCode = generateOrderCode();

      // 1. Upload payment proof (if not COD)
      let proofUrl: string | null = null;
      if (proofFile && method !== 'COD') {
        const ext      = proofFile.name.split('.').pop();
        const fileName = `${orderCode}-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-proofs')
          .upload(fileName, proofFile, { cacheControl: '3600', upsert: false });

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage
          .from('payment-proofs')
          .getPublicUrl(fileName);
        proofUrl = urlData.publicUrl;
      }

      // 2. Insert order
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          order_code:     orderCode,
          customer_name:  orderForm.customer_name,
          contact_number: orderForm.contact_number,
          email:          orderForm.email || null,
          address_full:   `${orderForm.address_full}, ${orderForm.city}`.trim(),
          notes:          orderForm.notes || null,
          total_amount:   total,
          subtotal:       subtotal,
          shipping_fee:   shippingFee,
          discount:       discount,
          promo_code:     promoData?.code || null,
          gift_wrap:      giftWrap,
          gift_message:   giftMsg || null,
          region:         orderForm.region_label || orderForm.region_id || null,
          courier:        orderForm.courier || null,
          status:         'pending',
        })
        .select('id')
        .single();

      if (orderErr) throw new Error(orderErr.message);

      // 3. Insert order items
      const items = cart.map((item) => ({
        order_id: order.id,
        sku:      item.sku,
        quantity: item.quantity,
        price:    item.price,
      }));

      const { error: itemsErr } = await supabase
        .from('order_items')
        .insert(items);

      if (itemsErr) throw new Error(itemsErr.message);

      // 4. Insert payment record
      const { error: payErr } = await supabase
        .from('payments')
        .insert({
          order_id:          order.id,
          payment_method:    method,
          payment_proof_url: proofUrl,
          status:            'pending',
        });

      if (payErr) throw new Error(payErr.message);

      // 5. Decrement inventory
      for (const item of cart) {
        await supabase.rpc('decrement_inventory', {
          p_sku: item.sku,
          p_qty: item.quantity,
        });
      }

      // 6. Update promo code usage
      if (promoData?.code) {
        await supabase.from('promo_codes').update({ uses: (promoData.uses || 0) + 1 }).eq('code', promoData.code);
      }

      // 7. Send emails (non-blocking)
      fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'confirmation', order_code: orderCode }),
      }).catch(() => {});

      // 8. Clear session
      sessionStorage.removeItem('ast3r_cart');
      sessionStorage.removeItem('ast3r_order_form');

      toast.dismiss(loadToast);
      toast.success('Order placed successfully!');
      router.push(`/confirmation/${orderCode}`);

    } catch (err: any) {
      toast.dismiss(loadToast);
      toast.error(err.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  if (!orderForm) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <p className="text-brand-gray text-sm">Loading…</p>
      </div>
    );
  }

  const instructions = PAYMENT_INSTRUCTIONS[method];

  return (
    <div className="min-h-screen bg-brand-white">

      {/* ── Top Bar ──────────────────────────────────────── */}
      <div className="border-b border-brand-light bg-brand-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-serif text-xl tracking-[0.15em]">AST3R</Link>
          <div className="flex items-center gap-2 text-xs tracking-wide text-brand-gray">
            <span className="line-through opacity-50">1. Details</span>
            <span className="text-brand-light">—</span>
            <span className="font-medium text-brand-orange">2. Payment</span>
            <span className="text-brand-light">—</span>
            <span>3. Confirmation</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">

          {/* ── LEFT: Payment ────────────────────────────── */}
          <div className="lg:col-span-3 page-enter">
            <div className="mb-8">
              <span className="accent-line mb-3" />
              <h1 className="display-md text-brand-black">Payment</h1>
              <p className="text-brand-gray text-sm mt-2">
                Choose your payment method and complete your order.
              </p>
            </div>

            {/* ── Method Selection ──────────────────────── */}
            <div className="mb-8">
              <p className="input-label mb-4">Payment Method</p>
              <div className="grid grid-cols-3 gap-3">
                {(['GCash', 'bank', 'COD'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMethod(m); setProofFile(null); setProofPrev(null); }}
                    className={`
                      border py-4 px-3 text-sm font-medium tracking-wide transition-all duration-200
                      ${method === m
                        ? 'border-brand-black bg-brand-black text-brand-white'
                        : 'border-brand-light text-brand-gray hover:border-brand-black hover:text-brand-black'
                      }
                    `}
                  >
                    {m === 'GCash' && '💚 '}
                    {m === 'bank'  && '🏦 '}
                    {m === 'COD'   && '💵 '}
                    {m === 'bank' ? 'Bank Transfer' : m}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Instructions ──────────────────────────── */}
            <div className="bg-brand-cream p-6 mb-8">
              <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-4">
                {instructions.title}
              </p>
              <ol className="space-y-2">
                {instructions.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-brand-black">
                    <span className="text-brand-orange font-medium flex-shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* ── Proof Upload (GCash / Bank) ───────────── */}
            {method !== 'COD' && (
              <div className="mb-8">
                <p className="input-label mb-3">Upload Payment Proof *</p>

                <div
                  {...getRootProps()}
                  className={`
                    border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200
                    ${isDragActive
                      ? 'border-brand-orange bg-orange-50'
                      : 'border-brand-light hover:border-brand-black'
                    }
                  `}
                >
                  <input {...getInputProps()} />
                  {proofPrev ? (
                    <div className="relative">
                      <img
                        src={proofPrev}
                        alt="Payment proof"
                        className="max-h-48 mx-auto object-contain"
                      />
                      <p className="text-xs text-brand-gray mt-3">
                        Click or drag to replace
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="text-3xl mb-3">📎</div>
                      <p className="text-sm text-brand-gray">
                        {isDragActive
                          ? 'Drop your screenshot here…'
                          : 'Drag & drop or click to upload'}
                      </p>
                      <p className="text-xs text-brand-light mt-2">
                        JPG, PNG, WEBP — Max 5MB
                      </p>
                    </>
                  )}
                </div>

                {proofFile && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <span>✓</span> {proofFile.name} ready to upload
                  </p>
                )}
              </div>
            )}

            {/* ── COD Note ─────────────────────────────── */}
            {method === 'COD' && (
              <div className="border border-yellow-200 bg-yellow-50 p-4 mb-8">
                <p className="text-sm text-yellow-800 font-medium mb-1">⚠️ COD Notice</p>
                <p className="text-xs text-yellow-700">
                  COD may have limited availability depending on your location. Our team will confirm
                  via your contact number before processing.
                </p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading
                ? 'Placing Order…'
                : method === 'COD'
                ? 'Place Order (COD)'
                : 'Submit Payment & Place Order'
              }
            </button>

            <p className="text-xs text-center text-brand-gray mt-4">
              By placing your order, you agree to our return and privacy policy.
            </p>
          </div>

          {/* ── RIGHT: Summary ───────────────────────────── */}
          <div className="lg:col-span-2">
            <div className="bg-brand-cream p-8 sticky top-24">
              <h2 className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-6">
                Order Summary
              </h2>

              {/* Items */}
              <div className="space-y-4 mb-6">
                {cart.map((item) => (
                  <div key={item.sku} className="flex gap-4">
                    <div className="relative w-14 h-18 bg-brand-light flex-shrink-0 overflow-hidden" style={{ height: 72 }}>
                      {item.image_url && (
                        <Image
                          src={item.image_url}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-brand-black">{item.name}</p>
                      <p className="text-xs text-brand-gray font-mono">{item.sku}</p>
                      <p className="text-sm font-medium text-brand-black mt-1">
                        {formatPrice(item.price)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Customer details */}
              <div className="border-t border-brand-light pt-4 mb-4 space-y-1.5">
                <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">Deliver To</p>
                <p className="text-sm font-medium text-brand-black">{orderForm.customer_name}</p>
                <p className="text-xs text-brand-gray">{orderForm.contact_number}</p>
                <p className="text-xs text-brand-gray leading-relaxed">{orderForm.address_full}</p>
              </div>

              {/* Pricing breakdown */}
              <div className="border-t border-brand-light pt-3 space-y-2 mb-3">
                <div className="flex justify-between text-xs text-brand-gray">
                  <span>Subtotal</span><span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-brand-gray">
                  <span>Shipping ({orderForm?.region_label || 'Standard'})</span>
                  <span>{formatPrice(shippingFee)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-green-600 font-medium">
                    <span>Discount {promoData?.code && `(${promoData.code})`}</span>
                    <span>-{formatPrice(discount)}</span>
                  </div>
                )}
                {giftWrap && (
                  <div className="flex justify-between text-xs text-brand-gray">
                    <span>🎁 Gift Wrap</span><span>+₱50</span>
                  </div>
                )}
              </div>
              {/* Total */}
              <div className="border-t border-brand-black pt-3 flex justify-between">
                <span className="font-medium text-sm">Total</span>
                <span className="font-serif text-xl font-medium">{formatPrice(total)}</span>
              </div>

              <div className="mt-4 text-center">
                <Link href="/checkout" className="text-xs text-brand-gray underline underline-offset-4 hover:text-brand-black">
                  ← Edit details
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
