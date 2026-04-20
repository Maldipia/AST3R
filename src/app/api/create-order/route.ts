export const dynamic = 'force-dynamic';

// src/app/api/create-order/route.ts
// Uses service role key — bypasses RLS entirely
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createServiceClient();

    const {
      orderCode, orderForm, cart,
      total, subtotal, shippingFee, discount,
      promoData, giftWrap, giftMsg,
      method, proofUrl,
    } = body;

    // 1. Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        order_code:          orderCode,
        customer_name:       orderForm.customer_name,
        contact_number:      orderForm.contact_number,
        email:               orderForm.email || null,
        address_full:        orderForm.address_full,
        barangay:            orderForm.barangay || null,
        notes:               orderForm.special_req || orderForm.notes || null,
        special_req:         orderForm.special_req || null,
        total_amount:        total,
        subtotal:            subtotal,
        shipping_fee:        shippingFee,
        discount:            discount || 0,
        promo_code:          promoData?.code || null,
        gift_wrap:           giftWrap || false,
        gift_message:        giftMsg || null,
        region:              orderForm.region_label || orderForm.region_id || null,
        courier:             orderForm.courier || null,
        payment_method_type: method?.type || null,
        payment_due_date:    method?.type === 'later'
          ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
          : null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (orderErr) throw new Error(orderErr.message);

    // 2. Insert order items
    const items = cart.map((i: any) => ({
      order_id: order.id,
      sku:      i.sku,
      quantity: i.quantity,
      price:    i.price,
    }));
    const { error: itemErr } = await supabase.from('order_items').insert(items);
    if (itemErr) throw new Error(itemErr.message);

    // 3. Decrement inventory (non-blocking)
    for (const item of cart) {
      try {
        await supabase.rpc('decrement_inventory', { p_sku: item.sku, p_qty: item.quantity });
      } catch {}
    }

    // 4. Insert payment record
    const { error: payErr } = await supabase.from('payments').insert({
      order_id:          order.id,
      payment_method:    method?.type || 'unknown',
      amount:            total,
      status:            'pending',
      payment_proof_url: proofUrl || null,
    });
    if (payErr) throw new Error(payErr.message);

    // 5. Update promo usage
    if (promoData?.code) {
      await supabase.from('promo_codes')
        .update({ uses: (promoData.uses || 0) + 1 })
        .eq('code', promoData.code);
    }

    return NextResponse.json({ ok: true, order_code: orderCode });
  } catch (err: any) {
    console.error('create-order error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
