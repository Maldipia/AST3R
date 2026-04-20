// src/lib/email.ts
// Email via Resend (https://resend.com — free 3000/month)
// Set RESEND_API_KEY in Vercel env vars

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'AST3R Fashion <inquiry@ast3r.store>';
const ADMIN_EMAIL    = 'inquiry@ast3r.store';
const BRAND_COLOR    = '#E8571A';
const APP_URL        = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — email skipped');
    return { ok: false };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    console.error('Email error:', e);
    return { ok: false };
  }
}

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: 'DM Sans', Arial, sans-serif; background: #F2F0EC; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; }
  .header { background: #0A0A0A; padding: 32px; text-align: center; }
  .logo { color: #fff; font-size: 28px; letter-spacing: 8px; font-weight: 400; margin: 0; }
  .tagline { color: #888; font-size: 11px; letter-spacing: 3px; margin: 6px 0 0; }
  .body { padding: 32px; }
  .orange { color: ${BRAND_COLOR}; }
  .order-box { background: #0A0A0A; color: #fff; padding: 20px; text-align: center; margin: 24px 0; }
  .order-code { font-size: 22px; letter-spacing: 4px; color: ${BRAND_COLOR}; font-family: monospace; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F0F0ED; font-size: 13px; }
  .label { color: #8A8A8A; }
  .badge { display: inline-block; background: #FEF3C7; color: #92400E; padding: 3px 10px; font-size: 11px; border-radius: 2px; }
  .footer { background: #F5F5F3; padding: 24px; text-align: center; }
  .footer p { color: #8A8A8A; font-size: 11px; margin: 4px 0; }
  .btn { display: inline-block; background: ${BRAND_COLOR}; color: #fff; padding: 12px 28px; text-decoration: none; font-size: 13px; font-weight: 600; letter-spacing: 1px; margin: 16px 0; }
  h2 { color: #0A0A0A; font-size: 20px; font-weight: 400; margin: 0 0 16px; }
  p { color: #444; font-size: 14px; line-height: 1.6; }
</style></head><body>
<div class="wrap">
  <div class="header">
    <p class="logo">AST3R</p>
    <p class="tagline">ELEVATED ESSENTIALS</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>📧 inquiry@ast3r.store &nbsp;|&nbsp; 📞 0967-4000-040</p>
    <p>📍 Amadeo, Cavite, Philippines &nbsp;|&nbsp; 📱 @ast3r.ph</p>
    <p style="margin-top:12px;">© ${new Date().getFullYear()} AST3R Fashion. All rights reserved.</p>
  </div>
</div>
</body></html>`;
}

// ── Customer order confirmation ───────────────────────────────
export async function sendOrderConfirmation(order: {
  order_code: string;
  customer_name: string;
  email: string;
  items: { name: string; sku: string; quantity: number; price: number }[];
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  region: string;
  courier: string;
  address_full: string;
  payment_method: string;
}) {
  if (!order.email) return;

  const itemRows = order.items.map(i => `
    <div class="row">
      <span>${i.name} <span style="color:#aaa; font-size:11px;">(${i.sku})</span> × ${i.quantity}</span>
      <span style="font-weight:600;">₱${(i.price * i.quantity).toLocaleString()}</span>
    </div>`).join('');

  const isCOD = order.payment_method === 'COD';

  const html = baseTemplate(`
    <h2>Thank you, ${order.customer_name}! 🎉</h2>
    <p>Your order has been received and is being processed. ${isCOD ? 'Our team will contact you to confirm delivery.' : 'Our team will review and verify your payment. Once confirmed, we will process and ship your order.'}</p>

    <div class="order-box">
      <p style="color:#aaa; font-size:11px; margin:0 0 8px; letter-spacing:2px;">YOUR ORDER CODE</p>
      <p class="order-code">${order.order_code}</p>
      <p style="color:#aaa; font-size:11px; margin:8px 0 0;">Save this to track your order</p>
    </div>

    <h2 style="font-size:14px; letter-spacing:2px; color:#8A8A8A; text-transform:uppercase;">Order Summary</h2>
    ${itemRows}
    <div class="row"><span class="label">Subtotal</span><span>₱${order.subtotal.toLocaleString()}</span></div>
    <div class="row"><span class="label">Shipping (${order.region})</span><span>₱${order.shipping_fee.toLocaleString()}</span></div>
    <div class="row" style="font-weight:700; font-size:15px; border-bottom:none;">
      <span>Total</span><span class="orange">₱${order.total_amount.toLocaleString()}</span>
    </div>

    <div style="margin-top:24px;">
      <div class="row"><span class="label">Deliver to</span><span style="text-align:right; max-width:300px;">${order.address_full}</span></div>
      <div class="row"><span class="label">Courier</span><span>${order.courier || 'To be assigned'}</span></div>
      <div class="row"><span class="label">Payment</span><span>${order.payment_method}</span></div>
      <div class="row"><span class="label">Status</span><span class="badge">⏳ Pending Verification</span></div>
    </div>

    <div style="text-align:center; margin-top:28px;">
      <a href="${APP_URL}/track?code=${order.order_code}" class="btn">Track Your Order</a>
    </div>

    <p style="font-size:12px; color:#aaa; margin-top:24px; text-align:center;">
      Questions? Reply to this email or message us at <strong>inquiry@ast3r.store</strong>
    </p>
  `);

  return sendEmail(order.email, `Order Confirmed — ${order.order_code} | AST3R Fashion`, html);
}

// ── Admin new order alert ─────────────────────────────────────
export async function sendAdminOrderAlert(order: {
  order_code: string;
  customer_name: string;
  contact_number: string;
  email: string;
  total_amount: number;
  payment_method: string;
  region: string;
  items: { sku: string; quantity: number }[];
}) {
  const itemList = order.items.map(i => `${i.sku} ×${i.quantity}`).join(', ');

  const html = baseTemplate(`
    <h2>🛍️ New Order Received!</h2>
    <div class="order-box">
      <p class="order-code">${order.order_code}</p>
      <p style="color:#aaa; font-size:13px; margin:8px 0 0;">₱${order.total_amount.toLocaleString()} · ${order.payment_method}</p>
    </div>
    <div class="row"><span class="label">Customer</span><span>${order.customer_name}</span></div>
    <div class="row"><span class="label">Contact</span><span>${order.contact_number}</span></div>
    <div class="row"><span class="label">Email</span><span>${order.email || '—'}</span></div>
    <div class="row"><span class="label">Region</span><span>${order.region || '—'}</span></div>
    <div class="row"><span class="label">Items</span><span>${itemList}</span></div>
    <div style="text-align:center; margin-top:24px;">
      <a href="${APP_URL}/admin" class="btn">Open Admin Panel</a>
    </div>
  `);

  return sendEmail(ADMIN_EMAIL, `🛍️ New Order — ${order.order_code} (₱${order.total_amount.toLocaleString()})`, html);
}

// ── Shipping update ───────────────────────────────────────────
export async function sendShippingUpdate(order: {
  order_code: string;
  customer_name: string;
  email: string;
  courier: string;
  tracking_number?: string;
  status: string;
}) {
  if (!order.email) return;

  const statusMessages: Record<string, { title: string; msg: string }> = {
    paid:      { title: 'Payment Verified ✅', msg: 'Your payment has been confirmed. We\'re now preparing your order!' },
    shipped:   { title: 'Your Order is On Its Way! 🚚', msg: `Your order has been shipped via ${order.courier}. ${order.tracking_number ? `Tracking number: <strong>${order.tracking_number}</strong>` : 'You\'ll receive tracking info from the courier.'}` },
    cancelled: { title: 'Order Cancelled', msg: 'Your order has been cancelled. If you paid, a refund will be processed within 3–5 business days (Metro Manila).' },
  };

  const info = statusMessages[order.status];
  if (!info) return;

  const html = baseTemplate(`
    <h2>${info.title}</h2>
    <div class="order-box">
      <p class="order-code">${order.order_code}</p>
    </div>
    <p>${info.msg}</p>
    <div style="text-align:center; margin-top:24px;">
      <a href="${APP_URL}/track?code=${order.order_code}" class="btn">Track Order</a>
    </div>
    <p style="font-size:12px; color:#aaa; text-align:center; margin-top:16px;">
      Questions? <a href="mailto:inquiry@ast3r.store" style="color:${BRAND_COLOR};">inquiry@ast3r.store</a>
    </p>
  `);

  return sendEmail(order.email, `${info.title} — ${order.order_code} | AST3R`, html);
}
