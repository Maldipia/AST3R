// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter }  from 'next/navigation';
import Image          from 'next/image';
import toast          from 'react-hot-toast';
import { supabase }   from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

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

// ── Image Uploader ────────────────────────────────────────────
function ImageUploader({ product, onUploaded }: { product: ProductRow; onUploaded: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    if (file.size > 10 * 1024 * 1024)   { toast.error('Max 10MB'); return; }
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    const t = toast.loading('Uploading…');
    try {
      const ext      = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${product.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('product-images').upload(fileName, file, { cacheControl: '3600', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
      const { error: updErr } = await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      if (updErr) throw new Error(updErr.message);
      toast.dismiss(t); toast.success('Image saved! ✅'); onUploaded();
    } catch (err: any) {
      toast.dismiss(t); toast.error(err.message || 'Upload failed'); setPreview(null);
    } finally { setUploading(false); }
  };

  const currentImage = preview || product.image_url;

  return (
    <div className="mt-3">
      {currentImage && (
        <div className="relative w-full h-32 mb-2 overflow-hidden bg-brand-cream">
          <Image src={currentImage} alt={product.name} fill className="object-cover" sizes="300px" />
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
      <div
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !uploading && inputRef.current?.click()}
        className="border-2 border-dashed border-brand-light p-3 text-center cursor-pointer hover:border-brand-orange transition-all"
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <p className="text-xs text-brand-gray">
          {uploading ? 'Uploading…' : '📸 Click or drag to upload image'}
        </p>
      </div>
    </div>
  );
}

// ── Add Product Modal ─────────────────────────────────────────
function AddProductModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ sku: '', name: '', description: '', price: '', category: 'Tops', image_url: '' });
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleImage = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    setImageFile(file); setImagePreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!form.sku.trim())  { toast.error('SKU required'); return; }
    if (!form.name.trim()) { toast.error('Name required'); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { toast.error('Valid price required'); return; }
    setSaving(true);
    const t = toast.loading('Saving product…');
    try {
      let imageUrl = form.image_url;
      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const fn  = `${form.sku.trim().toUpperCase()}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('product-images').upload(fn, imageFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
        imageUrl = publicUrl;
      }
      const sku = form.sku.trim().toUpperCase();
      const { error: prodErr } = await supabase.from('products').insert({
        sku, name: form.name.trim(), description: form.description.trim(),
        price: parseFloat(form.price), category: form.category,
        currency: 'PHP', image_url: imageUrl, status: 'active',
      });
      if (prodErr) throw new Error(prodErr.message);
      await supabase.from('inventory').insert({ sku, quantity: 0 });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';
      await supabase.from('qr_links').insert({ sku, qr_url: `${appUrl}/p/${sku}`, scans: 0 });
      toast.dismiss(t); toast.success('Product added! ✅'); onSaved(); onClose();
    } catch (err: any) {
      toast.dismiss(t); toast.error(err.message || 'Failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-brand-white w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-light">
          <h2 className="font-serif text-xl">Add New Product</h2>
          <button onClick={onClose} className="text-brand-gray hover:text-brand-black text-xl">✕</button>
        </div>
        <div className="p-6 space-y-5">
          {/* Image */}
          <div>
            <label className="input-label">Product Image</label>
            <div onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImage(f); }}
              onDragOver={(e) => e.preventDefault()} onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-brand-light p-6 text-center cursor-pointer hover:border-brand-orange transition-all">
              <input ref={inputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImage(f); }} />
              {imagePreview ? (
                <div className="relative w-full h-48">
                  <Image src={imagePreview} alt="Preview" fill className="object-contain" sizes="400px" />
                </div>
              ) : (
                <><p className="text-3xl mb-2">📸</p><p className="text-sm text-brand-gray">Click or drag image here</p></>
              )}
            </div>
            <input type="text" placeholder="Or paste image URL" value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              className="input-field mt-2 text-xs" />
          </div>
          <div>
            <label className="input-label">SKU *</label>
            <input type="text" placeholder="e.g. AST-TOP-003" value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} className="input-field font-mono" />
          </div>
          <div>
            <label className="input-label">Product Name *</label>
            <input type="text" placeholder="e.g. Linen Blazer" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="input-label">Description</label>
            <textarea rows={3} placeholder="Describe the product…" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Price (PHP) *</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="input-label">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
                {['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories', 'Sets'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving…' : 'Add Product'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin ────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab,         setTab]         = useState<Tab>('orders');
  const [user,        setUser]        = useState<any>(null);
  const [orders,      setOrders]      = useState<OrderRow[]>([]);
  const [products,    setProducts]    = useState<ProductRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showAddProd, setShowAddProd] = useState(false);
  const [stats, setStats] = useState({ orders: 0, revenue: 0, pending: 0, products: 0 });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }
      const { data: admin } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single();
      if (!admin) { await supabase.auth.signOut(); router.push('/admin/login'); return; }
      setUser(user); loadData();
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadOrders(), loadProducts()]);
    setLoading(false);
  }, []);

  const loadOrders = async () => {
    const { data } = await supabase.from('orders')
      .select(`*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)`)
      .order('created_at', { ascending: false }).limit(100);
    if (data) {
      setOrders(data as OrderRow[]);
      setStats(s => ({ ...s, orders: data.length, revenue: data.reduce((sum, o) => sum + Number(o.total_amount), 0), pending: data.filter(o => o.status === 'pending').length }));
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select(`*, inventory(quantity)`).order('created_at', { ascending: false });
    if (data) { setProducts(data as ProductRow[]); setStats(s => ({ ...s, products: data.length })); }
  };

  const updateOrderStatus   = async (id: string, status: string) => { await supabase.from('orders').update({ status }).eq('id', id); toast.success(`Marked as ${status}`); loadOrders(); };
  const updatePaymentStatus = async (orderId: string, status: string) => {
    await supabase.from('payments').update({ status }).eq('order_id', orderId);
    if (status === 'verified') await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
    toast.success(`Payment ${status}`); loadOrders();
  };
  const updatePrice = async (id: string, val: string) => {
    const price = parseFloat(val); if (isNaN(price)) { toast.error('Invalid price'); return; }
    await supabase.from('products').update({ price }).eq('id', id); toast.success('Price updated!'); loadProducts();
  };
  const toggleStatus = async (id: string, current: string) => {
    const next = current === 'active' ? 'inactive' : 'active';
    await supabase.from('products').update({ status: next }).eq('id', id); toast.success(`Product ${next}`); loadProducts();
  };
  const updateInventory = async (sku: string, val: string) => {
    const quantity = parseInt(val); if (isNaN(quantity) || quantity < 0) { toast.error('Invalid qty'); return; }
    await supabase.from('inventory').update({ quantity }).eq('sku', sku); toast.success('Stock updated!'); loadProducts();
  };
  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  const badge = (status: string) => {
    const map: Record<string, string> = { pending: 'badge-pending', paid: 'badge-paid', shipped: 'badge-shipped', cancelled: 'badge-cancelled', verified: 'badge-verified', rejected: 'badge-rejected', active: 'badge-active', inactive: 'badge-inactive' };
    return <span className={map[status] || 'badge-pending'}>{status}</span>;
  };

  if (loading) return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center">
      <div className="text-center">
        <span className="font-serif text-3xl tracking-widest text-brand-white">AST3R</span>
        <p className="text-brand-gray text-xs mt-3 animate-pulse">Loading admin…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-cream">
      {showAddProd && <AddProductModal onClose={() => setShowAddProd(false)} onSaved={loadProducts} />}

      {/* Header */}
      <header className="bg-brand-black text-brand-white sticky top-0 z-40 border-b border-[#1A1A1A]">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-serif text-lg tracking-[0.15em]">AST3R</span>
            <span className="text-[#333] text-xs">|</span>
            <span className="text-brand-gray text-xs tracking-widest uppercase">Admin</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs text-brand-gray hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-brand-gray hover:text-brand-white transition-colors">Sign Out</button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="bg-brand-white border-b border-brand-light">
        <div className="max-w-screen-xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[{ label: 'Total Orders', value: stats.orders, fmt: false }, { label: 'Total Revenue', value: stats.revenue, fmt: true }, { label: 'Pending', value: stats.pending, fmt: false }, { label: 'Products', value: stats.products, fmt: false }].map(({ label, value, fmt }) => (
              <div key={label} className="text-center py-4">
                <p className="font-serif text-2xl font-medium">{fmt ? formatPrice(value as number) : value}</p>
                <p className="text-xs text-brand-gray tracking-widest uppercase mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-brand-white border-b border-brand-light sticky top-14 z-30">
        <div className="max-w-screen-xl mx-auto px-4 flex overflow-x-auto">
          {(['orders', 'products', 'inventory', 'qr'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-4 text-xs font-medium tracking-widest uppercase border-b-2 whitespace-nowrap transition-all
                ${tab === t ? 'border-brand-orange text-brand-black' : 'border-transparent text-brand-gray hover:text-brand-black'}`}>
              {t === 'orders' ? '📋 ' : t === 'products' ? '👗 ' : t === 'inventory' ? '📦 ' : '📲 '}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-4 py-8">

        {/* ORDERS */}
        {tab === 'orders' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="display-md">Orders</h2>
              <button onClick={loadOrders} className="btn-ghost text-xs">↻ Refresh</button>
            </div>
            {orders.length === 0 ? (
              <div className="text-center py-20 bg-brand-white border border-brand-light">
                <p className="text-brand-gray text-sm">No orders yet.</p>
              </div>
            ) : orders.map((order) => {
              const payment = order.payments?.[0];
              return (
                <div key={order.id} className="bg-brand-white border border-brand-light p-6">
                  <div className="flex flex-wrap justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-mono text-sm font-medium">{order.order_code}</p>
                        {badge(order.status)}
                      </div>
                      <p className="text-xs text-brand-gray">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-xl font-medium">{formatPrice(order.total_amount)}</p>
                      <p className="text-xs text-brand-gray">{payment?.payment_method}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-brand-light">
                    <div><p className="text-xs text-brand-gray mb-0.5">Customer</p><p className="font-medium text-sm">{order.customer_name}</p><p className="text-xs text-brand-gray">{order.contact_number}</p></div>
                    <div><p className="text-xs text-brand-gray mb-0.5">Address</p><p className="text-xs leading-relaxed">{order.address_full}</p></div>
                    <div>
                      <p className="text-xs text-brand-gray mb-0.5">Payment</p>
                      {badge(payment?.status || 'pending')}
                      {payment?.payment_proof_url && <a href={payment.payment_proof_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-brand-orange underline mt-1">View Proof →</a>}
                    </div>
                  </div>
                  <div className="my-4 flex flex-wrap gap-2">
                    {order.order_items?.map((item, i) => <span key={i} className="text-xs bg-brand-cream px-2 py-1 font-mono">{item.sku} × {item.quantity}</span>)}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-brand-light">
                    <select defaultValue={order.status} onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                      className="text-xs border border-brand-light px-3 py-2 bg-brand-white focus:outline-none">
                      <option value="pending">Pending</option><option value="paid">Paid</option>
                      <option value="shipped">Shipped</option><option value="cancelled">Cancelled</option>
                    </select>
                    {payment?.status === 'pending' && payment?.payment_method !== 'COD' && <>
                      <button onClick={() => updatePaymentStatus(order.id, 'verified')} className="text-xs px-4 py-2 bg-green-600 text-white hover:bg-green-700">✓ Verify</button>
                      <button onClick={() => updatePaymentStatus(order.id, 'rejected')} className="text-xs px-4 py-2 bg-red-600 text-white hover:bg-red-700">✗ Reject</button>
                    </>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PRODUCTS */}
        {tab === 'products' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="display-md">Products</h2>
              <div className="flex gap-3">
                <button onClick={loadProducts} className="btn-ghost text-xs">↻ Refresh</button>
                <button onClick={() => setShowAddProd(true)} className="btn-primary py-2 px-5 text-xs">+ Add Product</button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => {
                const stock = product.inventory?.[0]?.quantity ?? 0;
                return (
                  <div key={product.id} className="bg-brand-white border border-brand-light overflow-hidden">
                    <div className="relative h-48 bg-brand-cream">
                      {product.image_url ? (
                        <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="33vw" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center"><span className="text-4xl">👗</span></div>
                      )}
                      <div className="absolute top-3 right-3">{badge(product.status)}</div>
                    </div>
                    <div className="p-5">
                      <p className="font-mono text-xs text-brand-gray mb-1">{product.sku}</p>
                      <p className="font-medium text-brand-black mb-0.5">{product.name}</p>
                      <p className="text-xs text-brand-gray mb-2">{product.category}</p>

                      {/* IMAGE UPLOAD */}
                      <ImageUploader product={product} onUploaded={loadProducts} />

                      {/* Price */}
                      <div className="mt-4 mb-3">
                        <p className="text-xs text-brand-gray mb-1">Price (PHP)</p>
                        <div className="flex gap-2">
                          <input type="number" defaultValue={product.price} min="0" step="0.01"
                            className="input-field text-sm py-2" id={`price-${product.id}`} />
                          <button onClick={() => updatePrice(product.id, (document.getElementById(`price-${product.id}`) as HTMLInputElement)?.value)}
                            className="px-3 py-2 bg-brand-black text-white text-xs hover:bg-brand-orange transition-colors whitespace-nowrap">Save</button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}>
                          Stock: {stock} units
                        </span>
                        <button onClick={() => toggleStatus(product.id, product.status)}
                          className="text-xs underline text-brand-gray hover:text-brand-black">
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

        {/* INVENTORY */}
        {tab === 'inventory' && (
          <div className="space-y-6">
            <h2 className="display-md">Inventory</h2>
            <div className="bg-brand-white border border-brand-light overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-brand-cream border-b border-brand-light">
                  <tr>{['SKU', 'Product', 'Category', 'Stock', 'Status', 'Update'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-brand-light">
                  {products.map((p) => {
                    const stock = p.inventory?.[0]?.quantity ?? 0;
                    return (
                      <tr key={p.sku} className="hover:bg-brand-cream transition-colors">
                        <td className="px-4 py-4 font-mono text-xs text-brand-gray">{p.sku}</td>
                        <td className="px-4 py-4 font-medium">{p.name}</td>
                        <td className="px-4 py-4 text-xs text-brand-gray">{p.category}</td>
                        <td className={`px-4 py-4 font-medium text-sm ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}>{stock} units</td>
                        <td className="px-4 py-4">{badge(p.status)}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <input type="number" min="0" defaultValue={stock} id={`inv-${p.sku}`}
                              className="w-24 border border-brand-light px-2 py-1 text-xs focus:outline-none focus:border-brand-black" />
                            <button onClick={() => updateInventory(p.sku, (document.getElementById(`inv-${p.sku}`) as HTMLInputElement)?.value)}
                              className="px-3 py-1 bg-brand-black text-white text-xs hover:bg-brand-orange transition-colors">Update</button>
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

        {/* QR CODES */}
        {tab === 'qr' && (
          <div className="space-y-6">
            <h2 className="display-md">QR Codes</h2>
            <p className="text-brand-gray text-sm">Print and attach to physical tags. Each QR links to the live product page.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((p) => {
                const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store'}/p/${p.sku}`;
                return (
                  <div key={p.sku} className="bg-brand-white border border-brand-light p-6 text-center">
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&bgcolor=FAFAF8&color=0A0A0A&margin=10`}
                      alt={`QR ${p.sku}`} className="mx-auto mb-4 w-40 h-40" />
                    <p className="font-medium text-sm mb-0.5">{p.name}</p>
                    <p className="font-mono text-xs text-brand-gray mb-4">{p.sku}</p>
                    <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                      download={`QR-${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                      className="btn-outline py-2 px-5 text-xs inline-block">Download QR</a>
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
