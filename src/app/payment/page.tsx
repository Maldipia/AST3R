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
  const [paymentQR, setPaymentQR] = useState<string | null>(null);
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

    // Load single QR from payment_settings
    supabase.from('payment_settings').select('qr_image_url').eq('is_active', true).limit(1)
      .then(({ data, error }) => {
        if (!error && data && data[0]?.qr_image_url) setPaymentQR(data[0].qr_image_url);
      });
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
          method: { type: 'gcash', label: 'GCash / QR Payment' }, proofUrl,
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
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-5 pt-5 pb-3">
                    <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-widest">Payment Details</h2>
                    <p className="text-xs text-gray-400 mt-1">Scan the QR code or send to the number shown, then upload your proof below</p>
                  </div>
                  {/* Full-width QR image from payment_settings */}
                  {paymentQR ? (
                    <img
                      src={paymentQR}
                      alt="Payment QR Code"
                      className="w-full object-contain max-h-[420px] bg-white"
                    />
                  ) : (
                    <div className="mx-5 mb-5 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center py-12 text-gray-300">
                      <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.243m-4.243 0l-.001.01M12 12H8M6 20h4m0 0h4m-4 0v-4m0 0H8" />
                      </svg>
                      <p className="text-xs text-center px-4">Payment QR not yet uploaded. Ask admin to upload.</p>
                    </div>
                  )}
                  <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-gray-500">Amount to pay</span>
                    <span className="font-bold text-xl text-gray-900">{formatPrice(total)}</span>
                  </div>
                </div>

              {/* Proof of Payment Upload */}
              
              
