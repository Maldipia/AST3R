// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

// ── Public client (browser) ──────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnon);

// ── Server client with service role (API routes only) ────────
export function createServiceClient() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Types ────────────────────────────────────────────────────
export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  category: string;
  status: 'active' | 'inactive';
  quantity?: number;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  order_code: string;
  customer_name: string;
  contact_number: string;
  email: string;
  address_full: string;
  notes: string;
  total_amount: number;
  status: 'pending' | 'paid' | 'shipped' | 'cancelled';
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  sku: string;
  quantity: number;
  price: number;
};

export type Payment = {
  id: string;
  order_id: string;
  payment_method: 'GCash' | 'bank' | 'COD';
  payment_proof_url?: string;
  status: 'pending' | 'verified' | 'rejected';
  created_at: string;
};

// CartItem type is in lib/cart.ts
export type CartItem = {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  image_url: string;
  size?:     string;
};
