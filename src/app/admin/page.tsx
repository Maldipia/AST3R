// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter }                         from 'next/navigation';
import Image                                 from 'next/image';
import toast                                 from 'react-hot-toast';
import { supabase }                          from '@/lib/supabase';
import { formatPrice, formatDate }           from '@/lib/utils';

type Tab = 'orders' | 'products' | 'inventory' | 'qr';

type OrderRow = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; email: string; address_full: string;
  total_amount: number; status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

type ProductRow = {
  id: string; sku: string; name: string; price: number;
  category: string; status: string; image_url: string;
  inventory: { quantity: number }[];
};

export default function AdminPage() {
  const router = useRouter();
  const [tab,      setTab]      = useState<Tab>('orders');
  const [user,     setUser]     = useState<any>(null);
  const [orders,   setOrders]   = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [stats,    setStats]    = useState({ orders: 0, revenue: 0, pending: 0, products: 0 });

  // ── Auth gate ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }

      const { data: admin } = await supabase
        .from('admin_profiles').select('role').eq('id', user.id).single();
      if (!admin) { await supabase.auth.signOut(); router.push('/admin/login'); return; }

      setUser(user);
      loadData();
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrders(), loadProducts()]);
    setLoading(false);
  }, []);

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select(`*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      setOrders(data as OrderRow[]);
      setStats(s => ({
        ...s,
        orders:  data.length,
        revenue: data.reduce((sum, o) => sum + Number(o.total_amount), 0),
        pending: data.filter(o => o.status === 'pending').length,
      }));
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select(`*, inventory(quantity)`)
      .order('created_at', { ascending: false });

    if (data) {
      setProducts(data as ProductRow[]);
      setStats(s => ({ ...s, products: data.length }));
    }
  };

  // ── Order status update ───────────────────────────────────
  const updateOrderStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from('orders').update({ status }).eq('id', orderId);
    if (error) { toast.error('Failed to update status.'); return; }
    toast.success(`Order marked as ${status}`);
    loadOrders();
  };

  // ── Payment verification ──────────────────────────────────
  const updatePaymentStatus = async (orderId: string, status: string) => {
    const { error } = await supabase
      .from('payments').update({ status }).eq('order_id', orderId);
    if (error) { toast.error('Failed to update payment.'); return; }
    if (status === 'verified') {
      await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
    }
    toast.success(`Payment ${status}`);
    loadOrders();
  };

  // ── Product price update ──────────────────────────────────
  const updatePrice = async (productId: string, newPrice: string) => {
    const price = parseFloat(newPrice);
    if (isNaN(price) || price <= 0) { toast.error('Invalid price.'); return; }
    const { error } = await supabase
      .from('products').update({ price }).eq('id', productId);
    if (error) { toast.error('Failed to update price.'); return; }
    toast.success('Price updated!');
    loadProducts();
  };

  // ── Product status toggle ─────────────────────────────────
  const toggleProductStatus = async (productId: string, current: string) => {
    const next = current === 'active' ? 'inactive' : 'active';
    await supabase.from('products').update({ status: next }).eq('id', productId);
    toast.success(`Product ${next}`);
    loadProducts();
  };

  // ── Inventory update ──────────────────────────────────────
  const updateInventory = async (sku: string, qty: string) => {
    const quantity = parseInt(qty);
    if (isNaN(quantity) || quantity < 0) { toast.error('Invalid quantity.'); return; }
    const { error } = await supabase
      .from('inventory').update({ quantity }).eq('sku', sku);
    if (error) { toast.error('Failed to update inventory.'); return; }
    toast.success(`Stock updated for ${sku}`);
    loadProducts();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push('/admin/login');
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending:   'badge-pending',
      paid:      'badge-paid',
      shipped:   'badge-shipped',
      cancelled: 'badge-cancelled',
      verified:  'badge-verified',
      rejected:  'badge-rejected',
      active:    'badge-active',
      inactive:  'badge-inactive',
    };
    return <span className={map[status] || 'badge-pending'}>{status}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-black flex items-center justify-center">
        <div className="text-center">
          <span className="font-serif text-3xl tracking-widest text-brand-white">AST3R</span>
          <p className="text-brand-gray text-xs mt-3 tracking-widest animate-pulse">Loading admin…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream">

      {/* ── Admin Header ─────────────────────────────────── */}
      <header className="bg-brand-black text-brand-white border-b border-[#1A1A1A] sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-serif text-lg tracking-[0.15em]">AST3R</span>
            <span className="text-[#333] text-xs">|</span>
            <span className="text-brand-gray text-xs tracking-widest uppercase">Admin</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs text-brand-gray hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-brand-gray hover:text-brand-white transition-colors tracking-wide">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats Row ────────────────────────────────────── */}
      <div className="bg-brand-white border-b border-brand-light">
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Orders',   value: stats.orders,              format: false },
              { label: 'Total Revenue',  value: stats.revenue,             format: true  },
              { label: 'Pending Orders', value: stats.pending,             format: false },
              { label: 'Products',       value: stats.products,            format: false },
            ].map(({ label, value, format }) => (
              <div key={label} className="text-center py-4">
                <p className="font-serif text-2xl font-medium text-brand-black">
                  {format ? formatPrice(value as number) : value}
                </p>
                <p className="text-xs text-brand-gray tracking-widest uppercase mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ───────────────────────────────── */}
      <div className="bg-brand-white border-b border-brand-light sticky top-14 z-40">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {(['orders', 'products', 'inventory', 'qr'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`
                  px-6 py-4 text-xs font-medium tracking-widest uppercase transition-all border-b-2 whitespace-nowrap
                  ${tab === t
                    ? 'border-brand-orange text-brand-black'
                    : 'border-transparent text-brand-gray hover:text-brand-black'
                  }
                `}
              >
                {t === 'orders'    && '📋 '}
                {t === 'products'  && '👗 '}
                {t === 'inventory' && '📦 '}
                {t === 'qr'        && '📲 '}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 py-8">

        {/* ══ ORDERS TAB ════════════════════════════════════ */}
        {tab === 'orders' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="display-md text-brand-black">Orders</h2>
              <button onClick={loadOrders} className="btn-ghost text-xs">↻ Refresh</button>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-20 bg-brand-white border border-brand-light">
                <p className="text-brand-gray text-sm">No orders yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const payment = order.payments?.[0];
                  return (
                    <div key={order.id} className="bg-brand-white border border-brand-light p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <p className="font-mono text-sm font-medium text-brand-black">{order.order_code}</p>
                            {statusBadge(order.status)}
                          </div>
                          <p className="text-xs text-brand-gray">{formatDate(order.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-serif text-xl font-medium">{formatPrice(order.total_amount)}</p>
                          <p className="text-xs text-brand-gray">{payment?.payment_method}</p>
                        </div>
                      </div>

                      {/* Customer info */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-brand-light text-sm">
                        <div>
                          <p className="text-xs text-brand-gray mb-0.5">Customer</p>
                          <p className="font-medium">{order.customer_name}</p>
                          <p className="text-xs text-brand-gray">{order.contact_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-brand-gray mb-0.5">Address</p>
                          <p className="text-xs text-brand-black leading-relaxed">{order.address_full}</p>
                        </div>
                        <div>
                          <p className="text-xs text-brand-gray mb-0.5">Payment Status</p>
                          {statusBadge(payment?.status || 'pending')}
                          {payment?.payment_proof_url && (
                            <a
                              href={payment.payment_proof_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-brand-orange underline mt-1 hover:opacity-80"
                            >
                              View Proof →
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="mt-4 mb-4">
                        <p className="text-xs text-brand-gray mb-2">Items</p>
                        <div className="flex flex-wrap gap-2">
                          {order.order_items?.map((item, i) => (
                            <span key={i} className="text-xs bg-brand-cream px-2 py-1 font-mono">
                              {item.sku} × {item.quantity}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-light">
                        {/* Order status */}
                        <select
                          defaultValue={order.status}
                          onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                          className="text-xs border border-brand-light px-3 py-2 bg-brand-white focus:outline-none focus:border-brand-black"
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="shipped">Shipped</option>
                          <option value="cancelled">Cancelled</option>
                        </select>

                        {/* Payment verification */}
                        {payment?.status === 'pending' && payment?.payment_method !== 'COD' && (
                          <>
                            <button
                              onClick={() => updatePaymentStatus(order.id, 'verified')}
                              className="text-xs px-4 py-2 bg-green-600 text-white hover:bg-green-700 transition-colors"
                            >
                              ✓ Verify Payment
                            </button>
                            <button
                              onClick={() => updatePaymentStatus(order.id, 'rejected')}
                              className="text-xs px-4 py-2 bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ PRODUCTS TAB ════════════════════════════════ */}
        {tab === 'products' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="display-md text-brand-black">Products</h2>
              <button onClick={loadProducts} className="btn-ghost text-xs">↻ Refresh</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => {
                const stock = product.inventory?.[0]?.quantity ?? 0;
                return (
                  <div key={product.id} className="bg-brand-white border border-brand-light overflow-hidden">
                    {/* Image */}
                    <div className="relative h-48 bg-brand-cream">
                      {product.image_url && (
                        <Image
                          src={product.image_url}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, 33vw"
                        />
                      )}
                      <div className="absolute top-3 right-3">
                        {statusBadge(product.status)}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-5">
                      <p className="font-mono text-xs text-brand-gray mb-1">{product.sku}</p>
                      <p className="font-medium text-brand-black mb-1">{product.name}</p>
                      <p className="text-xs text-brand-gray mb-4">{product.category}</p>

                      {/* Price edit */}
                      <div className="mb-3">
                        <p className="text-xs text-brand-gray mb-1">Price (PHP)</p>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            defaultValue={product.price}
                            min="0"
                            step="0.01"
                            className="input-field text-sm py-2"
                            id={`price-${product.id}`}
                          />
                          <button
                            onClick={() => updatePrice(
                              product.id,
                              (document.getElementById(`price-${product.id}`) as HTMLInputElement)?.value
                            )}
                            className="px-3 py-2 bg-brand-black text-white text-xs hover:bg-brand-orange transition-colors whitespace-nowrap"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      {/* Stock */}
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}>
                          Stock: {stock} units
                        </span>
                        <button
                          onClick={() => toggleProductStatus(product.id, product.status)}
                          className="text-xs underline text-brand-gray hover:text-brand-black"
                        >
                          {product.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══ INVENTORY TAB ════════════════════════════════ */}
        {tab === 'inventory' && (
          <div className="space-y-6">
            <h2 className="display-md text-brand-black">Inventory Management</h2>

            <div className="bg-brand-white border border-brand-light overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-cream border-b border-brand-light">
                  <tr>
                    {['SKU', 'Product', 'Category', 'Stock', 'Status', 'Update Stock'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-light">
                  {products.map((product) => {
                    const stock = product.inventory?.[0]?.quantity ?? 0;
                    return (
                      <tr key={product.sku} className="hover:bg-brand-cream transition-colors">
                        <td className="px-4 py-4 font-mono text-xs text-brand-gray">{product.sku}</td>
                        <td className="px-4 py-4 font-medium text-brand-black">{product.name}</td>
                        <td className="px-4 py-4 text-brand-gray text-xs">{product.category}</td>
                        <td className={`px-4 py-4 font-medium text-sm ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}>
                          {stock} units
                        </td>
                        <td className="px-4 py-4">{statusBadge(product.status)}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              defaultValue={stock}
                              className="w-24 border border-brand-light px-2 py-1 text-xs focus:outline-none focus:border-brand-black"
                              id={`inv-${product.sku}`}
                            />
                            <button
                              onClick={() => updateInventory(
                                product.sku,
                                (document.getElementById(`inv-${product.sku}`) as HTMLInputElement)?.value
                              )}
                              className="px-3 py-1 bg-brand-black text-white text-xs hover:bg-brand-orange transition-colors"
                            >
                              Update
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ QR CODES TAB ════════════════════════════════ */}
        {tab === 'qr' && (
          <div className="space-y-6">
            <h2 className="display-md text-brand-black">QR Codes</h2>
            <p className="text-brand-gray text-sm">
              Each product&apos;s QR code links directly to its product page. Print and attach to physical tags.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => {
                const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/p/${product.sku}`;
                return (
                  <div key={product.sku} className="bg-brand-white border border-brand-light p-6 text-center">
                    {/* QR rendered via external service for simplicity */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=FAFAF8&color=0A0A0A&margin=10`}
                      alt={`QR for ${product.sku}`}
                      className="mx-auto mb-4 w-40 h-40"
                    />
                    <p className="font-medium text-sm text-brand-black mb-0.5">{product.name}</p>
                    <p className="font-mono text-xs text-brand-gray mb-3">{product.sku}</p>
                    <p className="text-xs text-brand-light break-all mb-4">{url}</p>
                    <a
                      href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                      download={`QR-${product.sku}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-outline py-2 px-5 text-xs inline-block"
                    >
                      Download QR
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
