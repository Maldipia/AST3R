// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image         from 'next/image';
import toast         from 'react-hot-toast';
import { supabase }  from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
type Tab = 'orders' | 'products' | 'qr';

type Product = {
  id: string; sku: string; name: string; description: string;
  price: number; currency: string; image_url: string;
  category: string; status: string; created_at: string;
  inventory: { quantity: number }[];
};

type Order = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; address_full: string;
  total_amount: number; status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

const PAGE_SIZE = 50;

// ── Inline Image Upload Cell ───────────────────────────────────
function ImageCell({ product, onUploaded }: { product: Product; onUploaded: (id: string, url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    const t = toast.loading(`Uploading…`);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fn  = `${product.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      onUploaded(product.id, publicUrl);
      toast.dismiss(t); toast.success('Image saved ✅');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Thumbnail */}
      <div className="w-10 h-10 bg-brand-cream flex-shrink-0 overflow-hidden relative cursor-pointer border border-brand-light hover:border-brand-orange transition-colors"
        onClick={() => ref.current?.click()} title="Click to upload image">
        {product.image_url
          ? <Image src={product.image_url} alt="" fill className="object-cover" sizes="40px" />
          : <span className="absolute inset-0 flex items-center justify-center text-lg">{uploading ? '⏳' : '📸'}</span>
        }
        {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
    </div>
  );
}

// ── CSV Bulk Upload ────────────────────────────────────────────
function CSVUploadModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string) => {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const parsed = lines.slice(1).map((line, i) => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      return row;
    }).filter(r => r.sku);
    setRows(parsed);
    setErrors([]);
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    rows.forEach((r, i) => {
      if (!r.sku)  errs.push(`Row ${i+2}: SKU missing`);
      if (!r.name) errs.push(`Row ${i+2}: Name missing`);
      if (isNaN(parseFloat(r.price))) errs.push(`Row ${i+2}: Invalid price "${r.price}"`);
    });
    return errs;
  };

  const handleImport = async () => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setLoading(true);
    const t = toast.loading(`Importing ${rows.length} products…`);
    let success = 0, fail = 0;
    try {
      for (const r of rows) {
        const sku = r.sku.trim().toUpperCase();
        const { error: pe } = await supabase.from('products').upsert({
          sku, name: r.name, description: r.description || '',
          price: parseFloat(r.price), currency: 'PHP',
          image_url: r.image_url || '', category: r.category || 'Tops', status: 'active',
        }, { onConflict: 'sku' });
        if (pe) { fail++; continue; }
        await supabase.from('inventory').upsert({ sku, quantity: parseInt(r.stock) || 0 }, { onConflict: 'sku' });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';
        await supabase.from('qr_links').upsert({ sku, qr_url: `${appUrl}/p/${sku}`, scans: 0 }, { onConflict: 'sku' });
        success++;
      }
      toast.dismiss(t);
      toast.success(`✅ Imported ${success} products${fail ? `, ${fail} failed` : ''}`);
      onDone(); onClose();
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setLoading(false); }
  };

  const downloadTemplate = () => {
    const csv = 'sku,name,description,price,stock,image_url,category\nAST-TOP-007,Sample Top,Description here,1200,25,,Tops';
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = 'ast3r-products-template.csv';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-brand-white w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-light flex-shrink-0">
          <h2 className="font-serif text-xl">Bulk CSV Import</h2>
          <button onClick={onClose} className="text-brand-gray hover:text-brand-black text-xl">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Template download */}
          <div className="bg-brand-cream p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-brand-black">Required columns:</p>
              <p className="font-mono text-xs text-brand-gray mt-1">sku, name, description, price, stock, image_url, category</p>
            </div>
            <button onClick={downloadTemplate} className="btn-outline py-2 px-4 text-xs whitespace-nowrap">⬇ Template</button>
          </div>

          {/* File upload */}
          <div>
            <label className="input-label">Upload CSV File</label>
            <div className="border-2 border-dashed border-brand-light p-6 text-center cursor-pointer hover:border-brand-orange transition-all"
              onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = ev => parseCSV(ev.target?.result as string);
                  r.readAsText(f);
                }} />
              <p className="text-brand-gray text-sm">📄 Click to upload CSV file</p>
              <p className="text-brand-light text-xs mt-1">Max 1000 rows recommended</p>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4">
              <p className="text-red-700 font-medium text-sm mb-2">⚠️ Fix these errors first:</p>
              {errors.slice(0, 10).map((e, i) => <p key={i} className="text-red-600 text-xs">{e}</p>)}
              {errors.length > 10 && <p className="text-red-500 text-xs mt-1">…and {errors.length - 10} more</p>}
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">
                Preview — {rows.length} products to import
              </p>
              <div className="overflow-x-auto border border-brand-light">
                <table className="w-full text-xs">
                  <thead className="bg-brand-cream">
                    <tr>{['SKU','Name','Price','Stock','Category'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-brand-gray uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-brand-light">
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="hover:bg-brand-cream">
                        <td className="px-3 py-2 font-mono">{r.sku}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">₱{r.price}</td>
                        <td className="px-3 py-2">{r.stock || 0}</td>
                        <td className="px-3 py-2">{r.category || 'Tops'}</td>
                      </tr>
                    ))}
                    {rows.length > 20 && (
                      <tr><td colSpan={5} className="px-3 py-2 text-brand-gray italic">…and {rows.length - 20} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-brand-light flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-outline py-3 px-6 text-xs flex-1">Cancel</button>
          <button onClick={handleImport} disabled={rows.length === 0 || loading}
            className="btn-primary flex-1 text-xs py-3">
            {loading ? 'Importing…' : `Import ${rows.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Add Form ─────────────────────────────────────────────
function QuickAddRow({ onAdded }: { onAdded: () => void }) {
  const [form, setForm]   = useState({ sku: '', name: '', price: '', stock: '0', category: 'Tops' });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.sku || !form.name || !form.price) { toast.error('SKU, Name and Price required'); return; }
    setSaving(true);
    try {
      const sku = form.sku.trim().toUpperCase();
      const { error } = await supabase.from('products').insert({
        sku, name: form.name.trim(), price: parseFloat(form.price),
        currency: 'PHP', category: form.category, status: 'active', description: '', image_url: '',
      });
      if (error) throw error;
      await supabase.from('inventory').insert({ sku, quantity: parseInt(form.stock) || 0 });
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';
      await supabase.from('qr_links').insert({ sku, qr_url: `${appUrl}/p/${sku}`, scans: 0 });
      toast.success(`${sku} added ✅`);
      setForm({ sku: '', name: '', price: '', stock: '0', category: 'Tops' });
      onAdded();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-brand-cream border border-brand-light p-4">
      <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">⚡ Quick Add</p>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <input placeholder="SKU*" value={form.sku}
          onChange={e => setForm({ ...form, sku: e.target.value.toUpperCase() })}
          className="input-field text-xs py-2 font-mono col-span-1" />
        <input placeholder="Name*" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="input-field text-xs py-2 col-span-2" />
        <input placeholder="Price*" type="number" value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
          className="input-field text-xs py-2" />
        <input placeholder="Stock" type="number" value={form.stock}
          onChange={e => setForm({ ...form, stock: e.target.value })}
          className="input-field text-xs py-2" />
        <button onClick={submit} disabled={saving}
          className="bg-brand-orange text-white text-xs font-medium tracking-widest uppercase px-4 py-2 hover:bg-orange-600 transition-colors disabled:opacity-50">
          {saving ? '…' : '+ Add'}
        </button>
      </div>
    </div>
  );
}

// ── Main Admin ─────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab,        setTab]        = useState<Tab>('products');
  const [user,       setUser]       = useState<any>(null);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const [showCSV,    setShowCSV]    = useState(false);
  const [qrSku,      setQrSku]      = useState('');
  const [qrProduct,  setQrProduct]  = useState<Product | null>(null);
  const [genZip,     setGenZip]     = useState(false);
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [editStock,  setEditStock]  = useState<Record<string, string>>({});
  const [stats, setStats] = useState({ orders: 0, revenue: 0, pending: 0, products: 0 });

  // ── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }
      const { data: admin } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single();
      if (!admin) { await supabase.auth.signOut(); router.push('/admin/login'); return; }
      setUser(user);
      loadAll();
    });
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadOrders()]);
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, inventory(quantity)')
      .order('created_at', { ascending: false });
    if (data) {
      setProducts(data as Product[]);
      setStats(s => ({ ...s, products: data.length }));
    }
  };

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) {
      setOrders(data as Order[]);
      setStats(s => ({
        ...s,
        orders:  data.length,
        revenue: data.reduce((sum, o) => sum + Number(o.total_amount), 0),
        pending: data.filter(o => o.status === 'pending').length,
      }));
    }
  };

  // ── Search + Pagination ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [products, search]);

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search]);

  // ── Inline edits ────────────────────────────────────────────
  const savePrice = async (product: Product) => {
    const val = editPrices[product.id];
    if (!val || isNaN(parseFloat(val))) return;
    await supabase.from('products').update({ price: parseFloat(val) }).eq('id', product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, price: parseFloat(val) } : p));
    setEditPrices(prev => { const n = { ...prev }; delete n[product.id]; return n; });
    toast.success('Price updated ✅');
  };

  const saveStock = async (product: Product) => {
    const val = editStock[product.sku];
    if (!val || isNaN(parseInt(val))) return;
    await supabase.from('inventory').update({ quantity: parseInt(val) }).eq('sku', product.sku);
    setProducts(prev => prev.map(p => p.sku === product.sku
      ? { ...p, inventory: [{ quantity: parseInt(val) }] } : p));
    setEditStock(prev => { const n = { ...prev }; delete n[product.sku]; return n; });
    toast.success('Stock updated ✅');
  };

  const toggleStatus = async (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    await supabase.from('products').update({ status: next }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete ${p.sku} — ${p.name}? This cannot be undone.`)) return;
    await supabase.from('products').delete().eq('id', p.id);
    setProducts(prev => prev.filter(x => x.id !== p.id));
    toast.success(`${p.sku} deleted`);
  };

  // ── Image update callback ────────────────────────────────────
  const handleImageUploaded = (id: string, url: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, image_url: url } : p));
  };

  // ── Order actions ────────────────────────────────────────────
  const updateOrderStatus   = async (id: string, status: string) => { await supabase.from('orders').update({ status }).eq('id', id); toast.success(`Order: ${status}`); loadOrders(); };
  const verifyPayment       = async (orderId: string) => { await supabase.from('payments').update({ status: 'verified' }).eq('order_id', orderId); await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId); toast.success('Payment verified ✅'); loadOrders(); };
  const rejectPayment       = async (orderId: string) => { await supabase.from('payments').update({ status: 'rejected' }).eq('order_id', orderId); toast.success('Payment rejected'); loadOrders(); };

  // ── QR search ───────────────────────────────────────────────
  const searchQR = async () => {
    if (!qrSku.trim()) return;
    const { data } = await supabase
      .from('products').select('*, inventory(quantity)').eq('sku', qrSku.trim().toUpperCase()).single();
    setQrProduct(data as Product || null);
    if (!data) toast.error('SKU not found');
  };

  // ── Bulk QR ZIP ──────────────────────────────────────────────
  const generateAllQR = async () => {
    setGenZip(true);
    const t = toast.loading('Generating QR codes…');
    try {
      // Dynamically import JSZip
      const JSZip = (await import('jszip')).default;
      const zip   = new JSZip();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

      for (const p of products) {
        const url = `${appUrl}/p/${p.sku}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20&format=png`;
        const res  = await fetch(qrUrl);
        const blob = await res.blob();
        zip.file(`${p.sku}.png`, blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = 'ast3r-qr-codes.zip';
      a.click();
      toast.dismiss(t); toast.success(`✅ ${products.length} QR codes downloaded!`);
    } catch (e: any) { toast.dismiss(t); toast.error('ZIP generation failed: ' + e.message); }
    finally { setGenZip(false); }
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
    <div className="min-h-screen bg-[#F5F5F3]">
      {showCSV && <CSVUploadModal onClose={() => setShowCSV(false)} onDone={loadProducts} />}

      {/* ── Header ────────────────────────────────────── */}
      <header className="bg-brand-black text-brand-white sticky top-0 z-40 border-b border-[#1A1A1A]">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-serif text-lg tracking-[0.15em]">AST3R</span>
            <span className="text-[#333]">|</span>
            <span className="text-brand-gray text-xs tracking-widest uppercase">Admin</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs text-brand-gray hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-brand-gray hover:text-white transition-colors">Sign Out</button>
          </div>
        </div>
      </header>

      {/* ── Stats ─────────────────────────────────────── */}
      <div className="bg-brand-white border-b border-brand-light">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="grid grid-cols-4 divide-x divide-brand-light">
            {[
              { label: 'Products', value: stats.products, fmt: false },
              { label: 'Orders',   value: stats.orders,   fmt: false },
              { label: 'Revenue',  value: stats.revenue,  fmt: true  },
              { label: 'Pending',  value: stats.pending,  fmt: false },
            ].map(({ label, value, fmt }) => (
              <div key={label} className="text-center py-4 px-2">
                <p className="font-serif text-xl font-medium">{fmt ? formatPrice(value as number) : value}</p>
                <p className="text-xs text-brand-gray uppercase tracking-widest mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div className="bg-brand-white border-b border-brand-light sticky top-14 z-30">
        <div className="max-w-screen-xl mx-auto px-4 flex">
          {(['products', 'orders', 'qr'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3.5 text-xs font-medium tracking-widest uppercase border-b-2 transition-all
                ${tab === t ? 'border-brand-orange text-brand-black' : 'border-transparent text-brand-gray hover:text-brand-black'}`}>
              {t === 'products' ? `👗 Products (${products.length})` : t === 'orders' ? `📋 Orders (${orders.length})` : '📲 QR Codes'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-4 py-6">

        {/* ══ PRODUCTS ══════════════════════════════════ */}
        {tab === 'products' && (
          <div className="space-y-4">

            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center justify-between">
              {/* Search */}
              <div className="relative flex-1 min-w-64 max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Search SKU or name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full border border-brand-light pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-brand-black bg-white"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-black">✕</button>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => loadProducts()} className="border border-brand-light px-4 py-2.5 text-xs hover:border-brand-black transition-colors bg-white">
                  ↻ Refresh
                </button>
                <button onClick={() => setShowCSV(true)}
                  className="border border-brand-black px-4 py-2.5 text-xs font-medium hover:bg-brand-black hover:text-white transition-colors bg-white">
                  📄 CSV Import
                </button>
                <button onClick={() => {
                  const modal = document.getElementById('quick-add-section');
                  modal?.scrollIntoView({ behavior: 'smooth' });
                }} className="btn-primary py-2.5 px-5 text-xs">
                  + Quick Add
                </button>
              </div>
            </div>

            {/* Result count */}
            {search && (
              <p className="text-xs text-brand-gray">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "<strong>{search}</strong>"
              </p>
            )}

            {/* ── Product Table ───────────────────────── */}
            <div className="bg-white border border-brand-light overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-cream border-b border-brand-light">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray w-12">IMG</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">SKU</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Cat</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Price</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Stock</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-light">
                    {paginated.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-12 text-brand-gray text-sm">
                        {search ? 'No products match your search.' : 'No products yet. Add one below!'}
                      </td></tr>
                    ) : paginated.map(product => {
                      const stock = product.inventory?.[0]?.quantity ?? 0;
                      const priceEdit = editPrices[product.id] !== undefined;
                      const stockEdit = editStock[product.sku] !== undefined;

                      return (
                        <tr key={product.id} className="hover:bg-[#FAFAF8] transition-colors group">
                          {/* Image */}
                          <td className="px-4 py-3">
                            <ImageCell product={product} onUploaded={handleImageUploaded} />
                          </td>

                          {/* SKU */}
                          <td className="px-4 py-3 font-mono text-xs text-brand-gray whitespace-nowrap">{product.sku}</td>

                          {/* Name */}
                          <td className="px-4 py-3">
                            <p className="font-medium text-brand-black">{product.name}</p>
                          </td>

                          {/* Category */}
                          <td className="px-4 py-3 text-xs text-brand-gray">{product.category}</td>

                          {/* Price — inline edit */}
                          <td className="px-4 py-3">
                            {priceEdit ? (
                              <div className="flex gap-1">
                                <input type="number" value={editPrices[product.id]} autoFocus
                                  onChange={e => setEditPrices(prev => ({ ...prev, [product.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') savePrice(product); if (e.key === 'Escape') setEditPrices(prev => { const n={...prev}; delete n[product.id]; return n; }); }}
                                  className="w-24 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                <button onClick={() => savePrice(product)} className="text-xs bg-brand-orange text-white px-2 py-1 hover:bg-orange-600">✓</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditPrices(prev => ({ ...prev, [product.id]: String(product.price) }))}
                                className="text-sm font-medium text-brand-black hover:text-brand-orange transition-colors cursor-pointer">
                                {formatPrice(product.price)}
                              </button>
                            )}
                          </td>

                          {/* Stock — inline edit */}
                          <td className="px-4 py-3">
                            {stockEdit ? (
                              <div className="flex gap-1">
                                <input type="number" value={editStock[product.sku]} autoFocus min="0"
                                  onChange={e => setEditStock(prev => ({ ...prev, [product.sku]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveStock(product); if (e.key === 'Escape') setEditStock(prev => { const n={...prev}; delete n[product.sku]; return n; }); }}
                                  className="w-20 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                <button onClick={() => saveStock(product)} className="text-xs bg-brand-orange text-white px-2 py-1 hover:bg-orange-600">✓</button>
                              </div>
                            ) : (
                              <button onClick={() => setEditStock(prev => ({ ...prev, [product.sku]: String(stock) }))}
                                className={`text-xs font-medium cursor-pointer hover:underline ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}>
                                {stock} units
                              </button>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">{badge(product.status)}</td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={`/p/${product.sku}`} target="_blank" rel="noopener noreferrer"
                                className="text-xs px-2 py-1 border border-brand-light hover:border-brand-black transition-colors" title="View page">
                                🔗
                              </a>
                              <button onClick={() => toggleStatus(product)}
                                className="text-xs px-2 py-1 border border-brand-light hover:border-brand-black transition-colors"
                                title={product.status === 'active' ? 'Deactivate' : 'Activate'}>
                                {product.status === 'active' ? '⏸' : '▶'}
                              </button>
                              <button onClick={() => deleteProduct(product)}
                                className="text-xs px-2 py-1 border border-red-200 text-red-500 hover:border-red-500 hover:bg-red-50 transition-colors" title="Delete">
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-brand-light bg-brand-cream">
                  <p className="text-xs text-brand-gray">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="text-xs px-3 py-1.5 border border-brand-light hover:border-brand-black disabled:opacity-40 transition-colors">
                      ← Prev
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button key={i} onClick={() => setPage(i)}
                        className={`text-xs px-3 py-1.5 border transition-colors ${i === page ? 'border-brand-black bg-brand-black text-white' : 'border-brand-light hover:border-brand-black'}`}>
                        {i + 1}
                      </button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}
                      className="text-xs px-3 py-1.5 border border-brand-light hover:border-brand-black disabled:opacity-40 transition-colors">
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Quick Add ─────────────────────────────── */}
            <div id="quick-add-section">
              <QuickAddRow onAdded={loadProducts} />
            </div>

            {/* Help text */}
            <p className="text-xs text-brand-gray text-center">
              💡 Click any <strong>price</strong> or <strong>stock</strong> to edit inline · Click thumbnail to upload image · Hover row for actions
            </p>
          </div>
        )}

        {/* ══ ORDERS ════════════════════════════════════ */}
        {tab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="display-md">Orders</h2>
              <button onClick={loadOrders} className="btn-ghost text-xs">↻ Refresh</button>
            </div>
            {orders.length === 0 ? (
              <div className="text-center py-20 bg-white border border-brand-light">
                <p className="text-brand-gray">No orders yet.</p>
              </div>
            ) : orders.map(order => {
              const payment = order.payments?.[0];
              return (
                <div key={order.id} className="bg-white border border-brand-light p-5">
                  <div className="flex flex-wrap justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <p className="font-mono text-sm font-medium">{order.order_code}</p>
                      {badge(order.status)}
                      {payment && badge(payment.status)}
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-lg font-medium">{formatPrice(order.total_amount)}</p>
                      <p className="text-xs text-brand-gray">{formatDate(order.created_at)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm pb-4 border-b border-brand-light">
                    <div>
                      <p className="text-xs text-brand-gray">Customer</p>
                      <p className="font-medium">{order.customer_name}</p>
                      <p className="text-xs text-brand-gray">{order.contact_number}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-brand-gray">Address</p>
                      <p className="text-xs">{order.address_full}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4 items-center">
                    <div className="flex gap-1 flex-wrap mr-2">
                      {order.order_items?.map((item, i) => (
                        <span key={i} className="text-xs bg-brand-cream px-2 py-0.5 font-mono">{item.sku} ×{item.quantity}</span>
                      ))}
                    </div>
                    {payment?.payment_proof_url && (
                      <a href={payment.payment_proof_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-orange underline">View Proof</a>
                    )}
                    <div className="ml-auto flex gap-2 flex-wrap">
                      <select defaultValue={order.status}
                        onChange={e => updateOrderStatus(order.id, e.target.value)}
                        className="text-xs border border-brand-light px-3 py-1.5 bg-white focus:outline-none">
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="shipped">Shipped</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                      {payment?.status === 'pending' && payment?.payment_method !== 'COD' && <>
                        <button onClick={() => verifyPayment(order.id)} className="text-xs px-3 py-1.5 bg-green-600 text-white hover:bg-green-700">✓ Verify</button>
                        <button onClick={() => rejectPayment(order.id)} className="text-xs px-3 py-1.5 bg-red-600 text-white hover:bg-red-700">✗ Reject</button>
                      </>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ══ QR CODES ══════════════════════════════════ */}
        {tab === 'qr' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Search-based QR */}
              <div className="bg-white border border-brand-light p-6">
                <h3 className="font-serif text-lg mb-1">Search QR</h3>
                <p className="text-xs text-brand-gray mb-5">Enter a SKU to generate its QR code</p>
                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    placeholder="e.g. AST-TOP-001"
                    value={qrSku}
                    onChange={e => setQrSku(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && searchQR()}
                    className="input-field font-mono text-sm flex-1"
                  />
                  <button onClick={searchQR} className="btn-primary py-2 px-5 text-xs">Generate</button>
                </div>

                {qrProduct && (
                  <div className="text-center animate-fade-in">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store'}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=15`}
                      alt={`QR ${qrProduct.sku}`}
                      className="mx-auto mb-4 w-48 h-48 border border-brand-light"
                    />
                    <p className="font-medium text-brand-black">{qrProduct.name}</p>
                    <p className="font-mono text-xs text-brand-gray mb-4">{qrProduct.sku}</p>
                    <div className="flex gap-2 justify-center">
                      <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store'}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=20`}
                        download={`QR-${qrProduct.sku}.png`} target="_blank" rel="noopener noreferrer"
                        className="btn-primary py-2 px-5 text-xs">
                        ⬇ Download PNG
                      </a>
                      <a href={`/p/${qrProduct.sku}`} target="_blank" rel="noopener noreferrer"
                        className="btn-outline py-2 px-5 text-xs">
                        🔗 View Page
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Bulk QR ZIP */}
              <div className="bg-white border border-brand-light p-6">
                <h3 className="font-serif text-lg mb-1">Bulk QR Download</h3>
                <p className="text-xs text-brand-gray mb-5">Generate QR codes for all {products.length} products in one ZIP file</p>

                <div className="bg-brand-cream p-4 mb-6">
                  <p className="text-xs text-brand-gray mb-2">Each file will be named:</p>
                  <p className="font-mono text-xs text-brand-black">AST-TOP-001.png, AST-DRS-001.png…</p>
                  <p className="text-xs text-brand-gray mt-2">600×600px · Print-ready quality</p>
                </div>

                <div className="space-y-3 mb-6">
                  {products.slice(0, 5).map(p => (
                    <div key={p.sku} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-brand-gray">{p.sku}.png</span>
                      <span className="text-brand-gray">{p.name}</span>
                    </div>
                  ))}
                  {products.length > 5 && <p className="text-xs text-brand-gray italic">…and {products.length - 5} more</p>}
                </div>

                <button onClick={generateAllQR} disabled={genZip || products.length === 0}
                  className="btn-primary w-full text-xs py-3 disabled:opacity-50">
                  {genZip ? '⏳ Generating ZIP…' : `⬇ Download All ${products.length} QR Codes (ZIP)`}
                </button>
                {genZip && <p className="text-xs text-brand-gray text-center mt-2">This may take a moment…</p>}
              </div>
            </div>

            {/* All QR grid */}
            <div>
              <h3 className="font-serif text-lg mb-4">All QR Codes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map(p => {
                  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store'}/p/${p.sku}`;
                  return (
                    <div key={p.sku} className="bg-white border border-brand-light p-4 text-center">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}&bgcolor=FAFAF8&color=0A0A0A&margin=8`}
                        alt={p.sku} className="mx-auto mb-2 w-24 h-24" />
                      <p className="font-mono text-xs text-brand-gray truncate">{p.sku}</p>
                      <p className="text-xs text-brand-black truncate mb-2">{p.name}</p>
                      <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                        download={`${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-orange underline hover:opacity-80">⬇ PNG</a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
