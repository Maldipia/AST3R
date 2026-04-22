// src/app/api/paymongo-webhook/route.ts
// Listens for PayMongo payment.paid events → auto-verifies the order
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body?.data?.attributes;
    const type  = event?.type;

    if (type !== 'payment.paid' && type !== 'link.payment.paid') {
      return NextResponse.json({ received: true });
    }

    // Extract order code from the payment remarks/description
    const payment = event?.data?.attributes;
    const remarks = payment?.remarks || payment?.description || '';
    const orderCode = remarks.match(/AST3R-[A-Z0-9]+/)?.[0] || remarks;

    if (!orderCode) {
      console.warn('PayMongo webhook: no order code in remarks:', remarks);
      return NextResponse.json({ received: true });
    }

    const supabase = createServiceClient();

    // Find order
    const { data: order, error: oErr } = await supabase
      .from('orders').select('id').eq('order_code', orderCode).single();
    if (oErr || !order) {
      console.warn('PayMongo webhook: order not found:', orderCode);
      return NextResponse.json({ received: true });
    }

    // Mark order as paid + verify payment
    await supabase.from('orders').update({ status: 'paid' }).eq('id', order.id);
    await supabase.from('payments').update({ status: 'verified' }).eq('order_id', order.id);

    console.log(`PayMongo: auto-verified order ${orderCode}`);
    return NextResponse.json({ received: true, verified: orderCode });

  } catch (err: any) {
    console.error('paymongo-webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
