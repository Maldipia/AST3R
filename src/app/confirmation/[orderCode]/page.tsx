// src/app/confirmation/[orderCode]/page.tsx
import Link        from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

export default async function ConfirmationPage({
  params,
}: {
  params: { orderCode: string };
}) {
  const { orderCode } = params;

  // Fetch order with items and payment
  const { data: order } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        sku, quantity, price,
        products ( name, image_url )
      ),
      payments ( payment_method, status )
    `)
    .eq('order_code', orderCode)
    .single();

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-cream">
        <div className="text-center px-4">
          <h1 className="display-md text-brand-black mb-4">Order Not Found</h1>
          <p className="text-brand-gray text-sm mb-8">
            We couldn&apos;t find this order. Please contact us.
          </p>
          <a href="mailto:inquiry@ast3r.store" className="btn-primary">
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  const payment       = order.payments?.[0];
  const isCOD         = payment?.payment_method === 'COD';

  return (
    <div className="min-h-screen bg-brand-white">

      {/* ── Top Bar ──────────────────────────────────────── */}
      <div className="border-b border-brand-light">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-serif text-xl tracking-[0.15em]">AST3R</Link>
          <div className="flex items-center gap-2 text-xs tracking-wide text-brand-gray">
            <span className="line-through opacity-40">1. Details</span>
            <span className="text-brand-light">—</span>
            <span className="line-through opacity-40">2. Payment</span>
            <span className="text-brand-light">—</span>
            <span className="font-medium text-brand-orange">3. Confirmed</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-16 page-enter">

        {/* ── Success Banner ────────────────────────────── */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-brand-cream border-2 border-brand-black flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <span className="accent-line mx-auto mb-4" />
          <h1 className="display-lg text-brand-black mb-3">Order Received!</h1>
          <p className="text-brand-gray text-sm max-w-sm mx-auto">
            {isCOD
              ? 'Your COD order has been placed. Our team will contact you to confirm delivery.'
              : 'Your payment proof has been submitted. We\'ll verify and process your order shortly.'
            }
          </p>
        </div>

        {/* ── Order Code ────────────────────────────────── */}
        <div className="bg-brand-black text-brand-white p-8 mb-8 text-center">
          <p className="text-xs tracking-widest uppercase text-brand-gray mb-3">Order Code</p>
          <p className="font-mono text-3xl font-medium tracking-widest text-brand-orange">
            {order.order_code}
          </p>
          <p className="text-xs text-brand-gray mt-3">
            Save this code to track your order
          </p>
        </div>

        {/* ── Status Card ───────────────────────────────── */}
        <div className="border border-brand-light p-6 mb-8">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Order Status</p>
              <span className="badge-pending">⏳ Pending Verification</span>
            </div>
            <div>
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Payment</p>
              <p className="text-sm font-medium text-brand-black capitalize">
                {payment?.payment_method === 'bank' ? 'Bank Transfer' : payment?.payment_method}
              </p>
            </div>
            <div>
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Customer</p>
              <p className="text-sm font-medium text-brand-black">{order.customer_name}</p>
            </div>
            <div>
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Total Amount</p>
              <p className="text-sm font-medium text-brand-black">{formatPrice(order.total_amount)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Deliver To</p>
              <p className="text-sm text-brand-black leading-relaxed">{order.address_full}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs tracking-widest uppercase text-brand-gray mb-1">Order Date</p>
              <p className="text-sm text-brand-black">{formatDate(order.created_at)}</p>
            </div>
          </div>
        </div>

        {/* ── Items ─────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-4">
            Items Ordered
          </p>
          <div className="space-y-3">
            {order.order_items?.map((item: any) => (
              <div key={item.sku} className="flex justify-between items-center py-3 border-b border-brand-light">
                <div>
                  <p className="text-sm font-medium text-brand-black">
                    {item.products?.name || item.sku}
                  </p>
                  <p className="text-xs text-brand-gray font-mono mt-0.5">
                    {item.sku} · Qty: {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-medium text-brand-black">
                  {formatPrice(item.price * item.quantity)}
                </p>
              </div>
            ))}
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm font-medium text-brand-black">Total</p>
              <p className="font-serif text-xl font-medium">{formatPrice(order.total_amount)}</p>
            </div>
          </div>
        </div>

        {/* ── What's Next ───────────────────────────────── */}
        <div className="bg-brand-cream p-6 mb-8">
          <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-4">
            What Happens Next
          </p>
          <div className="space-y-3">
            {[
              { step: '01', text: isCOD ? 'Team confirms your order via call/SMS' : 'We verify your payment proof (1–2 hours)' },
              { step: '02', text: 'We prepare and pack your order with care' },
              { step: '03', text: 'Your order is shipped via LBC / J&T Express' },
              { step: '04', text: 'You receive your AST3R pieces!' },
            ].map(({ step, text }) => (
              <div key={step} className="flex gap-4 items-start">
                <span className="text-brand-orange font-mono text-xs font-medium flex-shrink-0 mt-0.5">{step}</span>
                <p className="text-sm text-brand-black">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact ───────────────────────────────────── */}
        <div className="text-center space-y-4 border-t border-brand-light pt-8">
          <p className="text-sm text-brand-gray">
            Questions about your order?
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="mailto:inquiry@ast3r.store"
              className="btn-outline py-3 px-6 text-xs"
            >
              📧 inquiry@ast3r.store
            </a>
            <a
              href="https://instagram.com/ast3r.ph"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline py-3 px-6 text-xs"
            >
              📱 @ast3r.ph
            </a>
          </div>

          <div className="pt-4">
            <Link href="/" className="btn-primary inline-flex">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
