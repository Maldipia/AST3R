// src/app/api/paymongo-link/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { amount, orderCode, description } = await req.json();
    if (!amount || !orderCode) {
      return NextResponse.json({ error: 'Missing amount or orderCode' }, { status: 400 });
    }

    const SK = process.env.PAYMONGO_SECRET_KEY;
    if (!SK) return NextResponse.json({ error: 'PayMongo not configured' }, { status: 500 });

    const auth = Buffer.from(`${SK}:`).toString('base64');
    const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

    const body = {
      data: {
        attributes: {
          amount: Math.round(amount * 100), // centavos
          description: description || `AST3R Order ${orderCode}`,
          remarks: orderCode,
          redirect: {
            success: `${APP_URL}/confirmation/${orderCode}?payment=success`,
            failed:  `${APP_URL}/payment?order=${orderCode}&payment=failed`,
          },
        },
      },
    };

    const pmRes = await fetch('https://api.paymongo.com/v1/links', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      console.error('PayMongo error:', pmData);
      return NextResponse.json({ error: pmData?.errors?.[0]?.detail || 'PayMongo error' }, { status: 400 });
    }

    const link = pmData.data?.attributes;
    return NextResponse.json({
      ok: true,
      checkoutUrl: link?.checkout_url,
      linkId: pmData.data?.id,
      referenceNumber: link?.reference_number,
    });

  } catch (err: any) {
    console.error('paymongo-link error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
