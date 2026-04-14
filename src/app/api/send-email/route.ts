// src/app/api/send-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendOrderConfirmation, sendAdminOrderAlert, sendShippingUpdate } from '@/lib/email';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, order_code } = body;

    const supabase = createServiceClient();

    // Fetch full order
    const { data: order, error } = await supabase
      .from('orders')
      .select(`*, order_items(sku, quantity, price, products(name))`)
      .eq('order_code', order_code)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const items = (order.order_items || []).map((i: any) => ({
      name:     i.products?.name || i.sku,
      sku:      i.sku,
      quantity: i.quantity,
      price:    i.price,
    }));

    if (type === 'confirmation') {
      const payment = await supabase
        .from('payments').select('payment_method').eq('order_id', order.id).single();

      await sendOrderConfirmation({
        order_code:     order.order_code,
        customer_name:  order.customer_name,
        email:          order.email,
        items,
        subtotal:       order.subtotal || order.total_amount,
        shipping_fee:   order.shipping_fee || 0,
        total_amount:   order.total_amount,
        region:         order.region || '',
        courier:        order.courier || '',
        address_full:   order.address_full,
        payment_method: payment.data?.payment_method || 'Unknown',
      });

      await sendAdminOrderAlert({
        order_code:     order.order_code,
        customer_name:  order.customer_name,
        contact_number: order.contact_number,
        email:          order.email,
        total_amount:   order.total_amount,
        payment_method: payment.data?.payment_method || 'Unknown',
        region:         order.region || '',
        items:          items.map((i: any) => ({ sku: i.sku, quantity: i.quantity })),
      });
    }

    if (type === 'status_update') {
      await sendShippingUpdate({
        order_code:      order.order_code,
        customer_name:   order.customer_name,
        email:           order.email,
        courier:         order.courier || '',
        tracking_number: body.tracking_number,
        status:          order.status,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Email API error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
