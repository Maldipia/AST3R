// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image         from 'next/image';
import toast         from 'react-hot-toast';
import { supabase }  from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

type Tab = 'products' | 'orders' | 'qr';

type Product = {
  id: string; sku: string; name: string; description: string;
  price: number; currency: string; image_url: string;
  category: string; status: string; sizes: string[];
  inventory: { quantity: number }[];
};

type Order = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; address_full: string;
  total_amount: number; status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

const PAGE_SIZE  = 50;
const CATEGORIES = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets'];
const ALL_SIZES  = ['XS','S','M','L','XL','XXL','Free Size'];
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

// ── Image Upload Cell ──────────────────────────────────────────
function ImageCell({ product, onUploaded }: {
  product: Product;
  onUploaded: (id: string, url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const doUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024)   { toast.error('Max file size is 10MB'); return; }

    setUploading(true);
    const t = toast.loading(`Uploading image…`);

    try {
      // Use timestamp + SKU for unique filename
      const ext      = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${product.sku}-${Date.now()}.${ext}`;

      // Upload to product-images bucket
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert:       true,
          contentType:  file.type,
        });

      if (upErr) throw new Error(`Storage error: ${upErr.message}`);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;

      // Update product record
      const { error: dbErr } = await supabase
        .from('products')
        .update({ image_url: publicUrl })
        .eq('id', product.id);

      if (dbErr) throw new Error(`DB error: ${dbErr.message}`);

      toast.dismiss(t);
      toast.success('Image uploaded! ✅');
      onUploaded(product.id, publicUrl);
    } catch (err: any) {
      toast.dismiss(t);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
  };

  return (
    <div className="relative w-10 h-10 flex-shrink-0 cursor-pointer group/img"
      onClick={() => !uploading && ref.current?.click()}
      title="Click to upload image"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 bg-brand-cream border border-brand-light overflow-hidden relative group-hover/img:border-brand-orange transition-colors">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            sizes="40px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-base">
            {uploading ? '' : '📸'}
          </div>
        )}
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-brand-orange/80 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-bold">{uploading ? '⏳' : '↑'}</span>
        </div>
        {/* Spinner */}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) doUpload(file);
        }}
      />
    </div>
  );
}

// ── CSV Upload Modal ───────────────────────────────────────────
function CSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string) => {
    try {
      const lines = text.trim().split(/\r?\n/);
      if (lines.length < 2) { toast.error('CSV must have headers + at least 1 row'); return; }

      const raw     = lines[0];
      const headers = raw.split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

      const parsed = lines.slice(1)
        .filter(line => line.trim())
        .map((line, i) => {
          // Handle quoted commas
          const vals: string[] = [];
          let cur = '', inQ = false;
          for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
            else { cur += ch; }
          }
          vals.push(cur.trim());

          const row: any = { _line: i + 2 };
          headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
          return row;
        })
        .filter(r => r.sku || r.name);

      setRows(parsed);
      setErrors([]);
      toast.success(`Parsed ${parsed.length} rows ✅`);
    } catch (err: any) {
      toast.error('Parse error: ' + err.message);
    }
  };

  const validate = () => {
    const errs: string[] = [];
    rows.forEach(r => {
      if (!r.sku)  errs.push(`Row ${r._line}: SKU is required`);
      if (!r.name) errs.push(`Row ${r._line}: Name is required`);
      if (r.price && isNaN(parseFloat(r.price))) errs.push(`Row ${r._line}: Invalid price "${r.price}"`);
    });
    return errs;
  };

  const handleImport = async () => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }

    setLoading(true);
    const t = toast.loading(`Importing ${rows.length} products…`);
    let ok = 0, fail = 0;

    for (const r of rows) {
      try {
        const sku = r.sku.trim().toUpperCase();
        const sizes = r.sizes ? r.sizes.split('/').map((s: string) => s.trim()).filter(Boolean) : [];

        const { error: pe } = await supabase.from('products').upsert({
          sku,
          name:        r.name,
          description: r.description || '',
          price:       parseFloat(r.price) || 0,
          currency:    'PHP',
          image_url:   r.image_url || '',
          category:    r.category  || 'Tops',
          status:      'active',
          sizes,
        }, { onConflict: 'sku' });

        if (pe) { fail++; continue; }

        await supabase.from('inventory').upsert(
          { sku, quantity: parseInt(r.stock) || 0 },
          { onConflict: 'sku' }
        );
        await supabase.from('qr_links').upsert(
          { sku, qr_url: `${APP_URL}/p/${sku}`, scans: 0 },
          { onConflict: 'sku' }
        );
        ok++;
      } catch { fail++; }
    }

    toast.dismiss(t);
    toast.success(`✅ ${ok} imported${fail ? ` · ${fail} failed` : ''}`);
    setLoading(false);
    onDone();
    onClose();
  };

  const downloadTemplate = () => {
    const csv = [
      'sku,name,description,price,stock,image_url,category,sizes',
      'AST-TOP-007,Linen Blazer,Premium blazer description,2500,20,,Tops,S/M/L/XL',
      'AST-DRS-002,Maxi Dress,Elegant maxi dress,1800,15,,Dresses,Free Size',
    ].join('\n');
    const a  = document.createElement('a');
    a.href   = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = 'ast3r-template.csv';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl max-h-[85vh] flex flex-col rounded-none" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-light">
          <h2 className="font-serif text-xl">CSV Bulk Import</h2>
          <button onClick={onClose} className="text-brand-gray hover:text-brand-black text-xl leading-none">✕</button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Template */}
          <div className="bg-brand-cream p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-brand-black mb-1">CSV columns:</p>
              <p className="font-mono text-xs text-brand-gray">sku, name, description, price, stock, image_url, category, sizes</p>
              <p className="text-xs text-brand-gray mt-1">Sizes format: <span className="font-mono">S/M/L/XL</span> — separate with slash</p>
            </div>
            <button onClick={downloadTemplate} className="btn-outline py-2 px-4 text-xs whitespace-nowrap flex-shrink-0">
              ⬇ Template
            </button>
          </div>

          {/* Drop zone */}
          <div>
            <div
              className="border-2 border-dashed border-brand-light p-10 text-center cursor-pointer hover:border-brand-orange transition-all"
              onClick={() => fileRef.current?.click()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) {
                  setFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = ev => parseCSV(ev.target?.result as string);
                  reader.readAsText(file);
                }
              }}
              onDragOver={e => e.preventDefault()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  const reader = new FileReader();
                  reader.onload = ev => parseCSV(ev.target?.result as string);
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
              {fileName ? (
                <div>
                  <p className="text-2xl mb-2">📄</p>
                  <p className="font-medium text-brand-black text-sm">{fileName}</p>
                  <p className="text-brand-gray text-xs mt-1">{rows.length} rows parsed</p>
                  <p className="text-brand-orange text-xs mt-2 underline">Click to change file</p>
                </div>
              ) : (
                <div>
                  <p className="text-3xl mb-3">📄</p>
                  <p className="text-brand-gray text-sm">Click to select CSV or drag & drop here</p>
                  <p className="text-brand-light text-xs mt-1">Supports .csv files</p>
                </div>
              )}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-4">
              <p className="text-red-700 font-medium text-sm mb-2">⚠️ Fix these errors:</p>
              {errors.slice(0, 8).map((e, i) => <p key={i} className="text-red-600 text-xs">• {e}</p>)}
              {errors.length > 8 && <p className="text-red-500 text-xs mt-1">…and {errors.length - 8} more</p>}
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && (
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">
                Preview — {rows.length} products
              </p>
              <div className="overflow-x-auto border border-brand-light">
                <table className="w-full text-xs">
                  <thead className="bg-brand-cream">
                    <tr>{['#','SKU','Name','Price','Stock','Sizes','Category'].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-brand-gray uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-brand-light">
                    {rows.slice(0,15).map((r, i) => (
                      <tr key={i} className={`${!r.sku || !r.name ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-brand-light">{r._line}</td>
                        <td className="px-3 py-2 font-mono font-medium">{r.sku || <span className="text-red-500">MISSING</span>}</td>
                        <td className="px-3 py-2">{r.name || <span className="text-red-500">MISSING</span>}</td>
                        <td className="px-3 py-2">₱{r.price}</td>
                        <td className="px-3 py-2">{r.stock || 0}</td>
                        <td className="px-3 py-2">{r.sizes || '—'}</td>
                        <td className="px-3 py-2">{r.category || 'Tops'}</td>
                      </tr>
                    ))}
                    {rows.length > 15 && (
                      <tr><td colSpan={7} className="px-3 py-2 text-brand-gray italic text-center">…{rows.length - 15} more rows</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-brand-light flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-outline py-3 px-6 text-xs flex-1">Cancel</button>
          <button
            onClick={handleImport}
            disabled={rows.length === 0 || loading}
            className="btn-primary flex-1 text-xs py-3 disabled:opacity-50"
          >
            {loading ? 'Importing…' : `✅ Import ${rows.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Add ──────────────────────────────────────────────────
function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const init = { sku: '', name: '', price: '', stock: '0', category: 'Tops', sizes: [] as string[] };
  const [form,   setForm]   = useState(init);
  const [saving, setSaving] = useState(false);

  const toggleSize = (s: string) => {
    setForm(f => ({
      ...f,
      sizes: f.sizes.includes(s) ? f.sizes.filter(x => x !== s) : [...f.sizes, s]
    }));
  };

  const submit = async () => {
    if (!form.sku)   { toast.error('SKU required'); return; }
    if (!form.name)  { toast.error('Name required'); return; }
    if (!form.price) { toast.error('Price required'); return; }

    setSaving(true);
    try {
      const sku = form.sku.trim().toUpperCase();
      const { error } = await supabase.from('products').insert({
        sku, name: form.name.trim(),
        price: parseFloat(form.price),
        currency: 'PHP', category: form.category,
        status: 'active', description: '',
        image_url: '', sizes: form.sizes,
      });
      if (error) throw error;

      await supabase.from('inventory').insert({ sku, quantity: parseInt(form.stock) || 0 });
      await supabase.from('qr_links').insert({ sku, qr_url: `${APP_URL}/p/${sku}`, scans: 0 });

      toast.success(`${sku} added ✅`);
      setForm(init);
      onAdded();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-brand-cream border border-brand-light p-4">
      <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-3">⚡ Quick Add</p>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
        <input placeholder="SKU *" value={form.sku}
          onChange={e => setForm({ ...form, sku: e.target.value.toUpperCase() })}
          className="input-field text-xs py-2 font-mono" />
        <input placeholder="Product Name *" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          className="input-field text-xs py-2 col-span-2" />
        <input placeholder="Price *" type="number" value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value })}
          className="input-field text-xs py-2" />
        <input placeholder="Stock" type="number" min="0" value={form.stock}
          onChange={e => setForm({ ...form, stock: e.target.value })}
          className="input-field text-xs py-2" />
        <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
          className="input-field text-xs py-2">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Sizes */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-brand-gray">Sizes:</span>
        {ALL_SIZES.map(s => (
          <button key={s} onClick={() => toggleSize(s)}
            className={`text-xs px-2.5 py-1 border transition-all ${
              form.sizes.includes(s)
                ? 'border-brand-black bg-brand-black text-white'
                : 'border-brand-light hover:border-brand-black'
            }`}>
            {s}
          </button>
        ))}
      </div>

      <button onClick={submit} disabled={saving}
        className="bg-brand-orange text-white text-xs font-medium tracking-widest uppercase px-6 py-2.5 hover:bg-orange-600 transition-colors disabled:opacity-50 w-full sm:w-auto">
        {saving ? 'Adding…' : '+ Add Product'}
      </button>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [tab,         setTab]         = useState<Tab>('products');
  const [user,        setUser]        = useState<any>(null);
  const [products,    setProducts]    = useState<Product[]>([]);
  const [orders,      setOrders]      = useState<Order[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(0);
  const [showCSV,     setShowCSV]     = useState(false);
  const [qrSku,       setQrSku]       = useState('');
  const [qrProduct,   setQrProduct]   = useState<Product | null>(null);
  const [genZip,      setGenZip]      = useState(false);
  const [editPrices,  setEditPrices]  = useState<Record<string,string>>({});
  const [editStock,   setEditStock]   = useState<Record<string,string>>({});
  const [stats, setStats] = useState({ orders: 0, revenue: 0, pending: 0, products: 0 });

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }
      const { data: admin } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single();
      if (!admin) { await supabase.auth.signOut(); router.push('/admin/login'); return; }
      setUser(user); loadAll();
    });
  }, []);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadOrders()]);
    setLoading(false);
  };

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products').select('*, inventory(quantity)')
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
      .order('created_at', { ascending: false }).limit(200);
    if (data) {
      setOrders(data as Order[]);
      setStats(s => ({
        ...s, orders: data.length,
        revenue: data.reduce((sum, o) => sum + Number(o.total_amount), 0),
        pending: data.filter(o => o.status === 'pending').length,
      }));
    }
  };

  // Search + pagination
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => setPage(0), [search]);

  // Inline edits
  const savePrice = async (p: Product) => {
    const val = parseFloat(editPrices[p.id]);
    if (isNaN(val)) return;
    await supabase.from('products').update({ price: val }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, price: val } : x));
    setEditPrices(prev => { const n = {...prev}; delete n[p.id]; return n; });
    toast.success('Price saved ✅');
  };

  const saveStock = async (p: Product) => {
    const val = parseInt(editStock[p.sku]);
    if (isNaN(val)) return;
    await supabase.from('inventory').update({ quantity: val }).eq('sku', p.sku);
    setProducts(prev => prev.map(x => x.sku === p.sku ? { ...x, inventory: [{ quantity: val }] } : x));
    setEditStock(prev => { const n = {...prev}; delete n[p.sku]; return n; });
    toast.success('Stock saved ✅');
  };

  const toggleStatus = async (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    await supabase.from('products').update({ status: next }).eq('id', p.id);
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
    toast.success(`${next === 'active' ? '✅' : '⏸'} ${p.sku} ${next}`);
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete ${p.sku} — ${p.name}?\n\nThis cannot be undone.`)) return;
    await supabase.from('products').delete().eq('id', p.id);
    setProducts(prev => prev.filter(x => x.id !== p.id));
    toast.success(`${p.sku} deleted`);
  };

  const handleImageUploaded = (id: string, url: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, image_url: url } : p));
  };

  // Orders
  const updateOrderStatus = async (id: string, status: string) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    toast.success(`Order: ${status}`); loadOrders();
  };
  const verifyPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status: 'verified' }).eq('order_id', orderId);
    await supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
    toast.success('Payment verified ✅'); loadOrders();
  };
  const rejectPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status: 'rejected' }).eq('order_id', orderId);
    toast.success('Payment rejected'); loadOrders();
  };

  // QR
  const searchQR = async () => {
    if (!qrSku.trim()) return;
    const { data } = await supabase.from('products').select('*, inventory(quantity)').eq('sku', qrSku.trim().toUpperCase()).single();
    setQrProduct(data as Product || null);
    if (!data) toast.error('SKU not found');
  };

  const generateAllQR = async () => {
    setGenZip(true);
    const t = toast.loading('Generating ZIP…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip   = new JSZip();
      for (const p of products) {
        const url    = `${APP_URL}/p/${p.sku}`;
        const qrUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20&format=png`;
        const res    = await fetch(qrUrl);
        const blob   = await res.blob();
        zip.file(`${p.sku}.png`, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href  = URL.createObjectURL(content);
      a.download = 'ast3r-qr-codes.zip';
      a.click();
      toast.dismiss(t); toast.success(`✅ ${products.length} QR codes downloaded!`);
    } catch (e: any) { toast.dismiss(t); toast.error('ZIP failed: ' + e.message); }
    finally { setGenZip(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  const badge = (status: string) => {
    const map: Record<string,string> = {
      pending:'badge-pending', paid:'badge-paid', shipped:'badge-shipped',
      cancelled:'badge-cancelled', verified:'badge-verified', rejected:'badge-rejected',
      active:'badge-active', inactive:'badge-inactive',
    };
    return <span className={map[status] || 'badge-pending'}>{status}</span>;
  };

  if (loading) return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center">
      <div className="text-center">
        <span className="font-serif text-3xl tracking-widest text-brand-white">AST3R</span>
        <p className="text-brand-gray text-xs mt-3 animate-pulse">Loading…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F3]">
      {showCSV && <CSVModal onClose={() => setShowCSV(false)} onDone={loadProducts} />}

      {/* Header */}
      <header className="bg-brand-black text-brand-white sticky top-0 z-40 border-b border-[#1A1A1A]">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-serif text-lg tracking-[0.15em]">AST3R</span>
            <span className="text-[#333]">|</span>
            <span className="text-brand-gray text-xs tracking-widest uppercase">Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-brand-gray hidden sm:block">{user?.email}</span>
            <button onClick={signOut} className="text-xs text-brand-gray hover:text-white transition-colors">Sign Out</button>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="bg-white border-b border-brand-light">
        <div className="max-w-screen-xl mx-auto px-4">
          <div className="grid grid-cols-4 divide-x divide-brand-light">
            {[
              { label: 'Products', value: stats.products, fmt: false },
              { label: 'Orders',   value: stats.orders,   fmt: false },
              { label: 'Revenue',  value: stats.revenue,  fmt: true  },
              { label: 'Pending',  value: stats.pending,  fmt: false },
            ].map(({ label, value, fmt }) => (
              <div key={label} className="text-center py-4">
                <p className="font-serif text-xl font-medium">{fmt ? formatPrice(value as number) : value}</p>
                <p className="text-xs text-brand-gray uppercase tracking-widest mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-brand-light sticky top-14 z-30">
        <div className="max-w-screen-xl mx-auto px-4 flex">
          {(['products','orders','qr'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3.5 text-xs font-medium tracking-widest uppercase border-b-2 transition-all whitespace-nowrap
                ${tab === t ? 'border-brand-orange text-brand-black' : 'border-transparent text-brand-gray hover:text-brand-black'}`}>
              {t === 'products' ? `👗 Products (${products.length})`
               : t === 'orders' ? `📋 Orders (${orders.length})`
               : '📲 QR Codes'}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-4 py-6">

        {/* ── PRODUCTS ─────────────────────────────────── */}
        {tab === 'products' && (
          <div className="space-y-4">

            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-56 max-w-sm">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray">🔍</span>
                <input
                  type="text" placeholder="Search SKU or name…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full border border-brand-light pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:border-brand-black bg-white"
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-black text-xs">✕</button>
                )}
              </div>
              <div className="flex gap-2 ml-auto flex-wrap">
                <button onClick={loadProducts} className="border border-brand-light px-4 py-2.5 text-xs bg-white hover:border-brand-black transition-colors">
                  ↻ Refresh
                </button>
                <button onClick={() => setShowCSV(true)}
                  className="border border-brand-black px-4 py-2.5 text-xs font-medium bg-white hover:bg-brand-black hover:text-white transition-colors">
                  📄 CSV Import
                </button>
              </div>
            </div>

            {search && (
              <p className="text-xs text-brand-gray">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "<strong>{search}</strong>"
              </p>
            )}

            {/* Table */}
            <div className="bg-white border border-brand-light overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-brand-cream border-b border-brand-light">
                    <tr>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray w-14">IMG</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">SKU</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Name</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Sizes</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Price</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Stock</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Status</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-light">
                    {paginated.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-16 text-brand-gray">
                          {search ? `No products match "${search}"` : 'No products yet. Use Quick Add below!'}
                        </td>
                      </tr>
                    ) : paginated.map(p => {
                      const stock     = p.inventory?.[0]?.quantity ?? 0;
                      const priceEdit = editPrices[p.id] !== undefined;
                      const stockEdit = editStock[p.sku] !== undefined;
                      const sizes     = Array.isArray(p.sizes) ? p.sizes : [];

                      return (
                        <tr key={p.id} className="hover:bg-[#FAFAF8] transition-colors group">

                          {/* Image */}
                          <td className="px-3 py-2">
                            <ImageCell product={p} onUploaded={handleImageUploaded} />
                          </td>

                          {/* SKU */}
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-brand-gray whitespace-nowrap">{p.sku}</span>
                          </td>

                          {/* Name */}
                          <td className="px-3 py-2">
                            <p className="font-medium text-brand-black text-sm">{p.name}</p>
                            <p className="text-xs text-brand-gray">{p.category}</p>
                          </td>

                          {/* Sizes */}
                          <td className="px-3 py-2">
                            {sizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {sizes.map(s => (
                                  <span key={s} className="text-xs border border-brand-light px-1.5 py-0.5 text-brand-gray">{s}</span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-brand-light">—</span>
                            )}
                          </td>

                          {/* Price — click to edit */}
                          <td className="px-3 py-2">
                            {priceEdit ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  type="number" autoFocus min="0" step="0.01"
                                  value={editPrices[p.id]}
                                  onChange={e => setEditPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter')  savePrice(p);
                                    if (e.key === 'Escape') setEditPrices(prev => { const n={...prev}; delete n[p.id]; return n; });
                                  }}
                                  className="w-24 border border-brand-orange px-2 py-1 text-xs focus:outline-none"
                                />
                                <button onClick={() => savePrice(p)} className="text-xs bg-brand-orange text-white px-2 py-1">✓</button>
                                <button onClick={() => setEditPrices(prev => { const n={...prev}; delete n[p.id]; return n; })} className="text-xs text-brand-gray hover:text-brand-black">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditPrices(prev => ({ ...prev, [p.id]: String(p.price) }))}
                                className="text-sm font-medium text-brand-black hover:text-brand-orange transition-colors"
                                title="Click to edit price"
                              >
                                {formatPrice(p.price)}
                              </button>
                            )}
                          </td>

                          {/* Stock — click to edit */}
                          <td className="px-3 py-2">
                            {stockEdit ? (
                              <div className="flex gap-1 items-center">
                                <input
                                  type="number" autoFocus min="0"
                                  value={editStock[p.sku]}
                                  onChange={e => setEditStock(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter')  saveStock(p);
                                    if (e.key === 'Escape') setEditStock(prev => { const n={...prev}; delete n[p.sku]; return n; });
                                  }}
                                  className="w-20 border border-brand-orange px-2 py-1 text-xs focus:outline-none"
                                />
                                <button onClick={() => saveStock(p)} className="text-xs bg-brand-orange text-white px-2 py-1">✓</button>
                                <button onClick={() => setEditStock(prev => { const n={...prev}; delete n[p.sku]; return n; })} className="text-xs text-brand-gray hover:text-brand-black">✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setEditStock(prev => ({ ...prev, [p.sku]: String(stock) }))}
                                className={`text-xs font-medium hover:underline ${stock <= 0 ? 'text-red-500' : stock <= 5 ? 'text-orange-500' : 'text-green-600'}`}
                                title="Click to edit stock"
                              >
                                {stock} units
                              </button>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2">{badge(p.status)}</td>

                          {/* Actions */}
                          <td className="px-3 py-2">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <a href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer"
                                title="View product page"
                                className="text-xs px-2 py-1 border border-brand-light hover:border-brand-black transition-colors">🔗</a>
                              <button onClick={() => toggleStatus(p)}
                                title={p.status === 'active' ? 'Deactivate' : 'Activate'}
                                className="text-xs px-2 py-1 border border-brand-light hover:border-brand-black transition-colors">
                                {p.status === 'active' ? '⏸' : '▶'}
                              </button>
                              <button onClick={() => deleteProduct(p)}
                                title="Delete product"
                                className="text-xs px-2 py-1 border border-red-200 text-red-500 hover:border-red-500 hover:bg-red-50 transition-colors">🗑</button>
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
                <div className="flex items-center justify-between px-4 py-3 border-t border-brand-light bg-brand-cream text-xs">
                  <span className="text-brand-gray">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
                      className="px-3 py-1 border border-brand-light hover:border-brand-black disabled:opacity-40 transition-colors">← Prev</button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button key={i} onClick={() => setPage(i)}
                        className={`px-3 py-1 border transition-colors ${i === page ? 'border-brand-black bg-brand-black text-white' : 'border-brand-light hover:border-brand-black'}`}>
                        {i + 1}
                      </button>
                    ))}
                    <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page === totalPages-1}
                      className="px-3 py-1 border border-brand-light hover:border-brand-black disabled:opacity-40 transition-colors">Next →</button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Add */}
            <QuickAdd onAdded={loadProducts} />

            <p className="text-xs text-brand-gray text-center">
              💡 Click <strong>thumbnail</strong> to upload image · Click <strong>price</strong> or <strong>stock</strong> to edit inline · Hover row for actions (🔗 ⏸ 🗑)
            </p>
          </div>
        )}

        {/* ── ORDERS ───────────────────────────────────── */}
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
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-mono text-sm font-medium">{order.order_code}</p>
                      {badge(order.status)}
                      {payment && badge(payment.status)}
                    </div>
                    <div className="text-right">
                      <p className="font-serif text-lg font-medium">{formatPrice(order.total_amount)}</p>
                      <p className="text-xs text-brand-gray">{formatDate(order.created_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-4 border-b border-brand-light text-sm">
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
                    <div className="flex gap-1 flex-wrap">
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

        {/* ── QR CODES ─────────────────────────────────── */}
        {tab === 'qr' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Search QR */}
              <div className="bg-white border border-brand-light p-6">
                <h3 className="font-serif text-lg mb-1">Search QR</h3>
                <p className="text-xs text-brand-gray mb-4">Enter a SKU to generate its QR code instantly</p>
                <div className="flex gap-2 mb-5">
                  <input type="text" placeholder="e.g. AST-TOP-001"
                    value={qrSku} onChange={e => setQrSku(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && searchQR()}
                    className="input-field font-mono text-sm flex-1" />
                  <button onClick={searchQR} className="btn-primary py-2 px-5 text-xs">Generate</button>
                </div>
                {qrProduct && (
                  <div className="text-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${APP_URL}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=15`}
                      alt={`QR ${qrProduct.sku}`}
                      className="mx-auto mb-3 w-44 h-44 border border-brand-light"
                    />
                    <p className="font-medium text-sm">{qrProduct.name}</p>
                    <p className="font-mono text-xs text-brand-gray mb-4">{qrProduct.sku}</p>
                    <div className="flex gap-2 justify-center">
                      <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${APP_URL}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=20`}
                        download={`${qrProduct.sku}.png`} target="_blank" rel="noopener noreferrer"
                        className="btn-primary py-2 px-4 text-xs">⬇ PNG</a>
                      <a href={`/p/${qrProduct.sku}`} target="_blank" rel="noopener noreferrer"
                        className="btn-outline py-2 px-4 text-xs">🔗 View</a>
                    </div>
                  </div>
                )}
              </div>

              {/* Bulk ZIP */}
              <div className="bg-white border border-brand-light p-6">
                <h3 className="font-serif text-lg mb-1">Bulk ZIP Download</h3>
                <p className="text-xs text-brand-gray mb-4">All {products.length} QR codes in one ZIP · 600×600px · Print-ready</p>
                <div className="bg-brand-cream p-3 mb-5 font-mono text-xs text-brand-gray space-y-1">
                  {products.slice(0,4).map(p => <p key={p.sku}>{p.sku}.png</p>)}
                  {products.length > 4 && <p className="text-brand-light">…{products.length - 4} more</p>}
                </div>
                <button onClick={generateAllQR} disabled={genZip || products.length === 0}
                  className="btn-primary w-full text-xs py-3 disabled:opacity-50">
                  {genZip ? '⏳ Generating…' : `⬇ Download All ${products.length} QR Codes (ZIP)`}
                </button>
              </div>
            </div>

            {/* Grid */}
            <div>
              <h3 className="font-serif text-lg mb-4">All QR Codes</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map(p => {
                  const url = `${APP_URL}/p/${p.sku}`;
                  return (
                    <div key={p.sku} className="bg-white border border-brand-light p-4 text-center">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}&bgcolor=FAFAF8&color=0A0A0A&margin=8`}
                        alt={p.sku} className="mx-auto mb-2 w-24 h-24" />
                      <p className="font-mono text-xs text-brand-gray truncate">{p.sku}</p>
                      <p className="text-xs truncate mb-2">{p.name}</p>
                      <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                        download={`${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-orange underline">⬇ PNG</a>
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
