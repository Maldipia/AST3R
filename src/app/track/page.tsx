// src/app/track/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams }     from 'next/navigation';
import Link                    from 'next/link';
import { supabase }            from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';
import Header from '@/components/Header';

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

const STATUS_STEPS = [
  { key: 'pending',  label: 'Order Placed',         icon: '📋', desc: 'Your order is received and pending payment verification.' },
  { key: 'paid',     label: 'Payment Verified',      icon: '✅', desc: 'Payment confirmed! We\'re preparing your items.' },
  { key: 'shipped',  label: 'Shipped',               icon: '🚚', desc: 'Your order is on its way!' },
  { key: 'delivered',label: 'Delivered',             icon: '📦', desc: 'Enjoy your AST3R pieces!' },
];

const STATUS_INDEX: Record<string, number> = {
  pending: 0, paid: 1, shipped: 2, delivered: 3, cancelled: -1,
};

function TrackPageInner() {
  const params    = useSearchParams();
  const [code,    setCode]    = useState(params.get('code') || '');
  const [order,   setOrder]   = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const track = async (orderCode: string) => {
    if (!orderCode.trim()) return;
    setLoading(true); setError(''); setOrder(null);
    const { data, error: err } = await supabase
      .from('orders')
      .select(`*, order_items(sku, quantity, price, products(name, image_url)), payments(payment_method, status)`)
      .eq('order_code', orderCode.trim().toUpperCase())
      .single();
    setLoading(false);
    if (err || !data) { setError('Order not found. Check your order code and try again.'); return; }
    setOrder(data);
  };

  useEffect(() => { if (params.get('code')) track(params.get('code')!); }, []);

  const stepIdx   = order ? (STATUS_INDEX[order.status] ?? 0) : -1;
  const isCancelled = order?.status === 'cancelled';

  return (
    <>
      <Header />
      <main className="min-h-screen pt-16 bg-brand-cream">
        <div className="max-w-2xl mx-auto px-4 py-16">

          {/* Header */}
          <div className="text-center mb-10">
            <span className="accent-line mx-auto mb-4" />
            <h1 className="display-lg text-brand-black">Track Your Order</h1>
            <p className="text-brand-gray text-sm mt-2">Enter your order code to see the latest status.</p>
          </div>

          {/* Search */}
          <div className="bg-white border border-brand-light p-6 mb-8">
            <label className="input-label">Order Code</label>
            <div className="flex gap-3 mt-2">
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && track(code)}
                placeholder="e.g. AST-XXXXXXXX"
                className="input-field font-mono flex-1"
              />
              <button
                onClick={() => track(code)}
                disabled={loading || !code.trim()}
                className="btn-primary py-3 px-6 text-xs disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? 'Searching…' : 'Track'}
              </button>
            </div>
            {error && <p className="text-red-500 text-sm mt-3">❌ {error}</p>}
          </div>

          {/* Order Result */}
          {order && (
            <div className="space-y-6 animate-fade-up">

              {/* Status progress */}
              {!isCancelled ? (
                <div className="bg-white border border-brand-light p-6">
                  <h2 className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-6">Order Status</h2>
                  <div className="relative">
                    {/* Progress line */}
                    <div className="absolute top-5 left-5 right-5 h-0.5 bg-brand-light" />
                    <div
                      className="absolute top-5 left-5 h-0.5 bg-brand-orange transition-all duration-700"
                      style={{ width: `${stepIdx > 0 ? (stepIdx / 3) * 100 : 0}%` }}
                    />
                    <div className="relative flex justify-between">
                      {STATUS_STEPS.map((step, i) => (
                        <div key={step.key} className={`flex flex-col items-center gap-2 flex-1 ${i === 0 ? 'items-start' : i === STATUS_STEPS.length - 1 ? 'items-end' : 'items-center'}`}>
                          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-base z-10 bg-white transition-all ${
                            i < stepIdx ? 'border-brand-orange bg-brand-orange text-white' :
                            i === stepIdx ? 'border-brand-orange bg-brand-orange text-white shadow-md scale-110' :
                            'border-brand-light text-brand-light'
                          }`}>
                            {i < stepIdx ? '✓' : step.icon}
                          </div>
                          <div className={`text-center ${i === 0 ? 'text-left' : i === STATUS_STEPS.length - 1 ? 'text-right' : 'text-center'}`}>
                            <p className={`text-xs font-medium ${i <= stepIdx ? 'text-brand-black' : 'text-brand-light'}`}>{step.label}</p>
                            {i === stepIdx && <p className="text-xs text-brand-gray mt-0.5 max-w-[100px]">{step.desc}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 p-6 text-center">
                  <p className="text-3xl mb-3">❌</p>
                  <h2 className="font-medium text-red-700 text-lg mb-1">Order Cancelled</h2>
                  <p className="text-red-600 text-sm">This order has been cancelled. Contact us if you need help.</p>
                </div>
              )}

              {/* Order details */}
              <div className="bg-white border border-brand-light p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-mono text-lg font-bold text-brand-black">{order.order_code}</p>
                    <p className="text-xs text-brand-gray mt-0.5">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-serif text-xl font-medium">{formatPrice(order.total_amount)}</p>
                    <p className="text-xs text-brand-gray">{order.payments?.[0]?.payment_method}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div>
                    <p className="text-xs text-brand-gray mb-1">Customer</p>
                    <p className="font-medium">{order.customer_name}</p>
                    <p className="text-xs text-brand-gray">{order.contact_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-brand-gray mb-1">Deliver To</p>
                    <p className="text-xs leading-relaxed">{order.address_full}</p>
                  </div>
                  {order.courier && (
                    <div>
                      <p className="text-xs text-brand-gray mb-1">Courier</p>
                      <p className="text-xs font-medium">{order.courier}</p>
                    </div>
                  )}
                  {order.region && (
                    <div>
                      <p className="text-xs text-brand-gray mb-1">Region</p>
                      <p className="text-xs">{order.region}</p>
                    </div>
                  )}
                </div>

                {/* Items */}
                <div className="border-t border-brand-light pt-4">
                  <p className="text-xs text-brand-gray mb-3">Items Ordered</p>
                  <div className="space-y-2">
                    {order.order_items?.map((item: any) => (
                      <div key={item.sku} className="flex justify-between text-sm">
                        <div>
                          <p className="font-medium">{item.products?.name || item.sku}</p>
                          <p className="text-xs text-brand-gray font-mono">{item.sku} × {item.quantity}</p>
                        </div>
                        <p className="font-medium">{formatPrice(item.price * item.quantity)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-brand-light mt-3 pt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-brand-gray">
                      <span>Subtotal</span>
                      <span>{formatPrice(order.subtotal || order.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-brand-gray">
                      <span>Shipping</span>
                      <span>{formatPrice(order.shipping_fee || 0)}</span>
                    </div>
                    {order.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount {order.promo_code && `(${order.promo_code})`}</span>
                        <span>-{formatPrice(order.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-brand-black border-t border-brand-light pt-2">
                      <span>Total</span>
                      <span>{formatPrice(order.total_amount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Help */}
              <div className="text-center space-y-3">
                <p className="text-sm text-brand-gray">Need help with your order?</p>
                <a href="mailto:inquiry@ast3r.store" className="btn-outline inline-flex py-3 px-6 text-xs">
                  📧 inquiry@ast3r.store
                </a>
              </div>
            </div>
          )}

          <div className="text-center mt-12">
            <Link href="/" className="text-xs text-brand-gray underline hover:text-brand-black">
              ← Back to Shop
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <p className="text-brand-gray text-sm animate-pulse">Loading…</p>
      </div>
    }>
      <TrackPageInner />
    </Suspense>
  );
}
