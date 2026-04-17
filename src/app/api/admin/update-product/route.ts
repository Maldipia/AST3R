export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, sku, ...updates } = body;
    if (!id && !sku) return NextResponse.json({ error: 'id or sku required' }, { status: 400 });
    
    const supabase = createServiceClient();
    const query = supabase.from('products').update(updates);
    const { data, error } = await (id ? query.eq('id', id) : query.eq('sku', sku))
      .select().single();
    
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
