// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { useRouter }  from 'next/navigation';
import Image          from 'next/image';
import toast          from 'react-hot-toast';
import { supabase }   from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────
type Tab = 'dashboard' | 'products' | 'orders' | 'qr' | 'settings';

type SizeStock = { size: string; quantity: number };

type Product = {
  id: string; sku: string; name: string; description: string;
  price: number; compare_price: number | null; currency: string;
  image_url: string; category: string; status: string; sizes: string[];
  inventory: { quantity: number }[];
  size_inventory?: SizeStock[];
};

type Order = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; address_full: string; email: string;
  total_amount: number; subtotal: number; shipping_fee: number;
  region: string; courier: string; status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

const PAGE_SIZE  = 50;
const CATEGORIES = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
const ALL_SIZES  = ['XS','S','M','L','XL','XXL','Free Size'];
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

// ─── Status Badge ─────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
    paid:      'bg-green-50 text-green-700 border-green-200',
    shipped:   'bg-blue-50 text-blue-700 border-blue-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
    verified:  'bg-green-50 text-green-700 border-green-200',
    rejected:  'bg-red-50 text-red-700 border-red-200',
    active:    'bg-brand-black text-white border-brand-black',
    inactive:  'bg-gray-100 text-gray-500 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium border ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}

// ─── Image Upload Cell ─────────────────────────────────────────
function ImageCell({ product, onUploaded }: { product: Product; onUploaded: (id: string, url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const doUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    if (file.size > 10 * 1024 * 1024)   { toast.error('Max 10MB'); return; }
    setUploading(true);
    const t = toast.loading('Uploading…');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fn  = `${product.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('product-images').upload(fn, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      toast.dismiss(t); toast.success('Image saved ✅');
      startTransition(() => onUploaded(product.id, publicUrl));
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setUploading(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div className="relative w-12 h-12 cursor-pointer group/img flex-shrink-0"
      onClick={() => !uploading && ref.current?.click()}
      title="Click to upload photo">
      <div className="w-12 h-12 bg-[#F5F5F3] border border-[#E8E8E5] overflow-hidden">
        {product.image_url
          ? <Image src={product.image_url} alt="" fill className="object-cover" sizes="48px" />
          : <div className="absolute inset-0 flex items-center justify-center text-lg">📷</div>
        }
        <div className="absolute inset-0 bg-brand-orange/80 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-sm font-bold">{uploading ? '⏳' : '↑'}</span>
        </div>
        {uploading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
    </div>
  );
}

// ─── Size Stock Cell ───────────────────────────────────────────
function SizeStockCell({ product, onUpdated }: { product: Product; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [localSizes, setLocalSizes] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    return m;
  });
  const [, startTransition] = useTransition();

  useEffect(() => {
    const m: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    setLocalSizes(m);
  }, [product.size_inventory]);

  const hasSizes   = Object.keys(localSizes).length > 0;
  const totalStock = Object.values(localSizes).reduce((a, b) => a + b, 0);

  const saveSizeQty = async (size: string, qty: number) => {
    startTransition(() => setLocalSizes(prev => ({ ...prev, [size]: qty })));
    try {
      await supabase.from('size_inventory')
        .upsert({ sku: product.sku, size, quantity: qty }, { onConflict: 'sku,size' });
      toast.success(`${size}: ${qty}`, { duration: 1200 });
    } catch (e: any) { toast.error(e.message); }
  };

  const removeSize = async (size: string) => {
    startTransition(() => setLocalSizes(prev => { const n = {...prev}; delete n[size]; return n; }));
    await supabase.from('size_inventory').delete().eq('sku', product.sku).eq('size', size);
  };

  return (
    <div>
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-left w-full group/sz">
        {hasSizes ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(localSizes).map(([s, q]) => (
              <span key={s} className={`text-xs px-1.5 py-0.5 border font-medium ${
                q <= 0 ? 'border-red-200 text-red-500 bg-red-50' :
                q <= 3 ? 'border-orange-200 text-orange-600' : 'border-[#E8E8E5]'
              }`}>{s}:{q}</span>
            ))}
            <span className="text-xs text-brand-gray group-hover/sz:text-brand-orange">{expanded ? '▲' : '▼'}</span>
          </div>
        ) : (
          <span className="text-xs text-brand-orange underline underline-offset-2">+ Add sizes</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 border border-[#E8E8E5] bg-white p-3 space-y-2 shadow-sm">
          <p className="text-xs font-medium text-brand-gray uppercase tracking-widest mb-2">{product.sku}</p>
          {Object.entries(localSizes).map(([size, qty]) => (
            <div key={size} className="flex items-center gap-2">
              <span className="text-xs font-medium w-14 text-brand-black">{size}</span>
              <input type="number" min="0" defaultValue={qty}
                onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== qty) saveSizeQty(size, v); }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) saveSizeQty(size, v); } }}
                className="w-16 border border-[#E8E8E5] px-2 py-1 text-xs focus:outline-none focus:border-brand-orange" />
              <button onClick={() => removeSize(size)}
                className="text-xs text-red-400 hover:text-red-600 ml-auto">✕</button>
            </div>
          ))}
          <div className="pt-2 border-t border-[#E8E8E5]">
            <p className="text-xs text-brand-gray mb-1">Add size:</p>
            <div className="flex flex-wrap gap-1">
              {ALL_SIZES.filter(s => localSizes[s] === undefined).map(s => (
                <button key={s} onClick={() => saveSizeQty(s, 0)}
                  className="text-xs px-2 py-1 border border-dashed border-[#E8E8E5] hover:border-brand-orange hover:text-brand-orange transition-colors">
                  +{s}
                </button>
              ))}
            </div>
          </div>
          {hasSizes && (
            <div className="flex justify-between pt-2 border-t border-[#E8E8E5] text-xs">
              <span className="text-brand-gray">Total</span>
              <span className={`font-bold ${totalStock <= 0 ? 'text-red-500' : 'text-green-600'}`}>{totalStock} units</span>
            </div>
          )}
          <button onClick={() => setExpanded(false)} className="w-full text-xs text-brand-gray hover:text-brand-black pt-1">Close ▲</button>
        </div>
      )}
    </div>
  );
}

// ─── Edit Product Modal ────────────────────────────────────────
function EditModal({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name:          product.name,
    description:   product.description || '',
    price:         String(product.price),
    compare_price: String(product.compare_price || ''),
    category:      product.category,
    status:        product.status,
    stock:         String(product.inventory?.[0]?.quantity ?? 0),
  });
  const [sizeStock, setSizeStock] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    return m;
  });
  const [saving, setSaving]       = useState(false);
  const [imgUploading, setImgUp]  = useState(false);
  const [imgPreview, setImgPrev]  = useState(product.image_url || '');
  const imgRef = useRef<HTMLInputElement>(null);
  const hasSizes = Object.keys(sizeStock).length > 0;
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const salePrice    = parseFloat(form.compare_price);
  const origPrice    = parseFloat(form.price);
  const validDisc    = !isNaN(salePrice) && !isNaN(origPrice) && salePrice > 0 && salePrice < origPrice;
  const discountPct  = validDisc ? Math.round((1 - salePrice / origPrice) * 100) : 0;

  const uploadImg = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image only'); return; }
    setImgUp(true);
    const t = toast.loading('Uploading…');
    try {
      const fn = `${product.sku}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      setImgPrev(publicUrl);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      toast.dismiss(t); toast.success('Image saved ✅');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setImgUp(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price)) { toast.error('Invalid price'); return; }
    setSaving(true);
    const t = toast.loading('Saving…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired — please log in again');
      const saleP = parseFloat(form.compare_price) || null;
      const { data, error } = await supabase.from('products').update({
        name: form.name.trim(), description: form.description.trim(),
        price, compare_price: saleP && saleP < price ? saleP : null,
        category: form.category, status: form.status,
      }).eq('id', product.id).select();
      if (error) throw error;
      if (!data?.length) throw new Error('No rows updated — check admin permissions');
      if (!hasSizes) {
        const qty = parseInt(form.stock) || 0;
        await supabase.from('inventory').update({ quantity: qty }).eq('sku', product.sku);
      }
      for (const [sz, qty] of Object.entries(sizeStock)) {
        await supabase.from('size_inventory').upsert({ sku: product.sku, size: sz, quantity: qty }, { onConflict: 'sku,size' });
      }
      const removed = (product.size_inventory || []).map(si => si.size).filter(s => sizeStock[s] === undefined);
      for (const sz of removed) await supabase.from('size_inventory').delete().eq('sku', product.sku).eq('size', sz);
      toast.dismiss(t); toast.success(`${product.sku} saved ✅`);
      onSaved(); onClose();
    } catch (e: any) { toast.dismiss(t); toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8E5] flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg text-brand-black">Edit Product</h2>
            <p className="font-mono text-xs text-brand-gray">{product.sku}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-brand-gray hover:text-brand-black text-xl">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Image */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-[#F5F5F3] border border-[#E8E8E5] overflow-hidden relative flex-shrink-0">
              {imgPreview
                ? <Image src={imgPreview} alt="" fill className="object-cover" sizes="80px" />
                : <div className="absolute inset-0 flex items-center justify-center text-2xl">📷</div>
              }
              {imgUploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
            </div>
            <div className="flex-1">
              <button onClick={() => imgRef.current?.click()} disabled={imgUploading}
                className="w-full border-2 border-dashed border-brand-orange text-brand-orange py-3 text-sm font-medium hover:bg-brand-orange hover:text-white transition-all disabled:opacity-50">
                {imgUploading ? 'Uploading…' : imgPreview ? '🔄 Change Photo' : '📸 Upload Photo'}
              </button>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); }} />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="input-label">Product Name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)} className="input-field" placeholder="e.g. Linen Blazer" />
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Original Price (₱) *</label>
              <input type="number" value={form.price} min="0" step="0.01"
                onChange={e => f('price', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="input-label"><span className="text-red-500">Sale Price</span> (₱)</label>
              <input type="number" value={form.compare_price} min="0" step="0.01" placeholder="lower = on sale"
                onChange={e => f('compare_price', e.target.value)} className="input-field" />
            </div>
          </div>

          {/* Discount preview */}
          {validDisc && (
            <div className="bg-red-50 border border-red-100 px-4 py-2 flex items-center gap-3">
              <span className="text-xs text-brand-gray line-through">₱{origPrice.toLocaleString()}</span>
              <span className="text-sm font-bold text-red-600">₱{salePrice.toLocaleString()}</span>
              <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5">-{discountPct}% OFF</span>
              <span className="text-xs text-green-600 ml-auto">Save ₱{(origPrice - salePrice).toLocaleString()}</span>
            </div>
          )}
          {!isNaN(salePrice) && salePrice > 0 && salePrice >= origPrice && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-3 py-2">⚠️ Sale price must be lower than original</p>
          )}

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Category</label>
              <select value={form.category} onChange={e => f('category', e.target.value)} className="input-field">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Status</label>
              <div className="grid grid-cols-2 gap-1">
                {['active','inactive'].map(s => (
                  <button key={s} onClick={() => f('status', s)}
                    className={`py-2.5 text-xs font-medium border transition-all ${form.status === s ? (s==='active' ? 'bg-brand-black text-white border-brand-black' : 'bg-red-500 text-white border-red-500') : 'border-[#E8E8E5] text-brand-gray hover:border-brand-black'}`}>
                    {s === 'active' ? '✅ Active' : '⏸ Off'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="input-label">Description</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)}
              rows={2} placeholder="Describe this product…" className="input-field resize-none" />
          </div>

          {/* Sizes */}
          <div>
            <label className="input-label">Sizes & Stock</label>
            <div className="flex flex-wrap gap-1 mb-3">
              {ALL_SIZES.map(sz => (
                <button key={sz} onClick={() => setSizeStock(prev => {
                  const n = {...prev};
                  if (n[sz] !== undefined) delete n[sz]; else n[sz] = 0;
                  return n;
                })} className={`text-xs px-3 py-1.5 border transition-all ${sizeStock[sz] !== undefined ? 'border-brand-black bg-brand-black text-white' : 'border-[#E8E8E5] text-brand-gray hover:border-brand-black'}`}>
                  {sz}
                </button>
              ))}
            </div>
            {Object.keys(sizeStock).length > 0 ? (
              <div className="border border-[#E8E8E5] divide-y divide-[#E8E8E5]">
                {Object.entries(sizeStock).map(([sz, qty]) => (
                  <div key={sz} className="flex items-center gap-3 px-4 py-2">
                    <span className="text-sm font-medium w-16">{sz}</span>
                    <input type="number" min="0" value={qty}
                      onChange={e => setSizeStock(prev => ({ ...prev, [sz]: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-[#E8E8E5] px-3 py-1.5 text-sm focus:outline-none focus:border-brand-orange" />
                    <span className="text-xs text-brand-gray">units</span>
                    <button onClick={() => setSizeStock(prev => { const n={...prev}; delete n[sz]; return n; })}
                      className="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2 bg-[#F5F5F3] text-xs">
                  <span className="text-brand-gray">Total stock</span>
                  <span className="font-bold">{Object.values(sizeStock).reduce((a,b)=>a+b,0)} units</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="input-label mt-2">Plain Stock (no sizes)</label>
                <input type="number" min="0" value={form.stock} onChange={e => f('stock', e.target.value)}
                  className="input-field w-32" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-[#E8E8E5] flex-shrink-0 bg-[#FAFAF8]">
          <button onClick={onClose} className="btn-outline flex-1 py-3 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="btn-primary flex-[2] py-3 text-sm disabled:opacity-50">
            {saving ? 'Saving…' : '✅ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV Modal ─────────────────────────────────────────────────
function CSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows]       = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string) => {
    const lines   = text.trim().split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
    const parsed  = lines.slice(1).filter(l => l.trim()).map((line, i) => {
      const vals: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      vals.push(cur.trim());
      const row: any = { _line: i+2 };
      headers.forEach((h, idx) => { row[h] = (vals[idx]||'').replace(/^"|"$/g,'').trim(); });
      return row;
    }).filter(r => r.sku || r.name);
    setRows(parsed);
    toast.success(`Parsed ${parsed.length} rows`);
  };

  const doImport = async () => {
    setLoading(true);
    const t = toast.loading(`Importing ${rows.length}…`);
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const sku   = r.sku?.trim().toUpperCase();
        if (!sku) { fail++; continue; }
        const sizes = r.sizes ? r.sizes.split('/').map((s:string)=>s.trim()).filter(Boolean) : [];
        const { error } = await supabase.from('products').upsert({
          sku, name: r.name, description: r.description||'',
          price: parseFloat(r.price)||0, currency:'PHP',
          image_url: r.image_url||'', category: r.category||'Tops',
          status:'active', sizes,
        }, { onConflict:'sku' });
        if (error) { fail++; continue; }
        await supabase.from('inventory').upsert({ sku, quantity: parseInt(r.stock)||0 }, { onConflict:'sku' });
        await supabase.from('qr_links').upsert({ sku, qr_url:`${APP_URL}/p/${sku}`, scans:0 }, { onConflict:'sku' });
        ok++;
      } catch { fail++; }
    }
    toast.dismiss(t);
    toast.success(`✅ ${ok} imported${fail?` · ${fail} failed`:''}`);
    setLoading(false); onDone(); onClose();
  };

  const downloadTemplate = () => {
    const csv = 'sku,name,description,price,stock,image_url,category,sizes\nAST-TOP-007,Sample Product,Description,1500,20,,Tops,S/M/L/XL';
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = 'ast3r-template.csv'; a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
          <h2 className="font-serif text-lg">CSV Bulk Import</h2>
          <button onClick={onClose} className="text-brand-gray hover:text-brand-black text-xl">✕</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="bg-[#F5F5F3] p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium mb-1">Required columns:</p>
              <p className="font-mono text-xs text-brand-gray">sku, name, price, stock, category, sizes (S/M/L)</p>
            </div>
            <button onClick={downloadTemplate} className="btn-outline py-2 px-4 text-xs">⬇ Template</button>
          </div>
          <div className="border-2 border-dashed border-[#E8E8E5] p-8 text-center cursor-pointer hover:border-brand-orange transition-colors"
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f){setFileName(f.name);new FileReader().onload=ev=>parseCSV(ev.target?.result as string);new FileReader().readAsText(f); const r=new FileReader(); r.onload=ev=>parseCSV(ev.target?.result as string); r.readAsText(f); }}}
            onDragOver={e => e.preventDefault()}>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f=e.target.files?.[0]; if(f){setFileName(f.name); const r=new FileReader(); r.onload=ev=>parseCSV(ev.target?.result as string); r.readAsText(f); e.target.value=''; }}} />
            {fileName
              ? <><p className="text-2xl mb-2">📄</p><p className="font-medium text-sm">{fileName}</p><p className="text-brand-gray text-xs mt-1">{rows.length} rows · click to change</p></>
              : <><p className="text-3xl mb-3">📄</p><p className="text-brand-gray text-sm">Click or drag CSV here</p></>
            }
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto border border-[#E8E8E5]">
              <table className="w-full text-xs">
                <thead className="bg-[#F5F5F3]"><tr>
                  {['SKU','Name','Price','Stock','Category','Sizes'].map(h=>(
                    <th key={h} className="text-left px-3 py-2 text-brand-gray uppercase tracking-wide font-medium">{h}</th>
                  ))}
                </tr></thead>
                <tbody className="divide-y divide-[#E8E8E5]">
                  {rows.slice(0,12).map((r,i)=>(
                    <tr key={i} className={!r.sku||!r.name?'bg-red-50':''}>
                      <td className="px-3 py-2 font-mono">{r.sku||<span className="text-red-500">MISSING</span>}</td>
                      <td className="px-3 py-2">{r.name||<span className="text-red-500">MISSING</span>}</td>
                      <td className="px-3 py-2">₱{r.price}</td>
                      <td className="px-3 py-2">{r.stock||0}</td>
                      <td className="px-3 py-2">{r.category||'Tops'}</td>
                      <td className="px-3 py-2">{r.sizes||'—'}</td>
                    </tr>
                  ))}
                  {rows.length>12 && <tr><td colSpan={6} className="px-3 py-2 text-brand-gray italic text-center">…{rows.length-12} more rows</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-[#E8E8E5]">
          <button onClick={onClose} className="btn-outline flex-1 py-3 text-xs">Cancel</button>
          <button onClick={doImport} disabled={rows.length===0||loading}
            className="btn-primary flex-[2] py-3 text-xs disabled:opacity-50">
            {loading ? 'Importing…' : `✅ Import ${rows.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Add ─────────────────────────────────────────────────
function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const init = { sku:'', name:'', price:'', stock:'0', category:'Tops', sizes: [] as string[] };
  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);
  const toggleSize = (s: string) => setForm(f => ({
    ...f, sizes: f.sizes.includes(s) ? f.sizes.filter(x=>x!==s) : [...f.sizes,s]
  }));
  const submit = async () => {
    if (!form.sku||!form.name||!form.price) { toast.error('SKU, Name and Price required'); return; }
    setSaving(true);
    try {
      const sku = form.sku.trim().toUpperCase();
      const { error } = await supabase.from('products').insert({
        sku, name:form.name.trim(), price:parseFloat(form.price),
        currency:'PHP', category:form.category, status:'active',
        description:'', image_url:'', sizes:form.sizes,
      });
      if (error) throw error;
      await supabase.from('inventory').insert({ sku, quantity:parseInt(form.stock)||0 });
      await supabase.from('qr_links').insert({ sku, qr_url:`${APP_URL}/p/${sku}`, scans:0 });
      toast.success(`${sku} added ✅`);
      setForm(init);
      onAdded();
    } catch(e:any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-[#E8E8E5] p-5">
      <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-4">⚡ Quick Add Product</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
        <input placeholder="SKU *" value={form.sku}
          onChange={e => setForm({...form, sku:e.target.value.toUpperCase()})}
          className="input-field text-xs py-2.5 font-mono" />
        <input placeholder="Product Name *" value={form.name}
          onChange={e => setForm({...form, name:e.target.value})}
          className="input-field text-xs py-2.5 col-span-2" />
        <input placeholder="Price *" type="number" value={form.price}
          onChange={e => setForm({...form, price:e.target.value})}
          className="input-field text-xs py-2.5" />
        <select value={form.category} onChange={e => setForm({...form, category:e.target.value})}
          className="input-field text-xs py-2.5">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-brand-gray">Sizes:</span>
        <div className="flex flex-wrap gap-1">
          {ALL_SIZES.map(s => (
            <button key={s} onClick={() => toggleSize(s)}
              className={`text-xs px-2 py-1 border transition-all ${form.sizes.includes(s) ? 'border-brand-black bg-brand-black text-white' : 'border-[#E8E8E5] hover:border-brand-black'}`}>
              {s}
            </button>
          ))}
        </div>
        <input placeholder="Stock" type="number" value={form.stock}
          onChange={e => setForm({...form, stock:e.target.value})}
          className="input-field text-xs py-2.5 w-20 ml-auto" />
      </div>
      <button onClick={submit} disabled={saving}
        className="bg-brand-orange text-white text-xs font-medium tracking-widest uppercase px-6 py-2.5 hover:bg-orange-600 transition-colors disabled:opacity-50">
        {saving ? 'Adding…' : '+ Add Product'}
      </button>
    </div>
  );
}

// ─── MAIN ADMIN ────────────────────────────────────────────────
export default function AdminPage() {
  const router  = useRouter();
  const [, startTransition] = useTransition();
  const [tab,           setTab]           = useState<Tab>('products');
  const [user,          setUser]          = useState<any>(null);
  const [products,      setProducts]      = useState<Product[]>([]);
  const [orders,        setOrders]        = useState<Order[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [page,          setPage]          = useState(0);
  const [editingProd,   setEditingProd]   = useState<Product | null>(null);
  const [showCSV,       setShowCSV]       = useState(false);
  const [qrSku,         setQrSku]         = useState('');
  const [qrProduct,     setQrProduct]     = useState<Product | null>(null);
  const [genZip,        setGenZip]        = useState(false);
  const [editPrices,    setEditPrices]    = useState<Record<string,string>>({});
  const [editStock,     setEditStock]     = useState<Record<string,string>>({});
  const [stats, setStats] = useState({ orders:0, revenue:0, pending:0, products:0, lowStock:0 });

  // Sidebar nav
  const NAV = [
    { id:'dashboard', label:'Dashboard', icon:'📊' },
    { id:'products',  label:'Products',  icon:'👗' },
    { id:'orders',    label:'Orders',    icon:'📋' },
    { id:'qr',        label:'QR Codes',  icon:'📲' },
    { id:'settings',  label:'Settings',  icon:'⚙️' },
  ] as const;

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }
      const { data: admin } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single();
      if (!admin) { await supabase.auth.signOut(); router.push('/admin/login'); return; }
      setUser(user); loadAll();
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadOrders()]);
    setLoading(false);
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase.from('products')
      .select('*, inventory(quantity), size_inventory(size,quantity)')
      .order('created_at', { ascending: false });
    if (data) {
      setProducts(data as Product[]);
      const lowStock = data.filter(p => (p.inventory?.[0]?.quantity??0) <= 3 && (p.inventory?.[0]?.quantity??0) > 0).length;
      setStats(s => ({ ...s, products: data.length, lowStock }));
    }
  };

  const loadOrders = async () => {
    const { data } = await supabase.from('orders')
      .select('*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)')
      .order('created_at', { ascending: false }).limit(200);
    if (data) {
      setOrders(data as Order[]);
      setStats(s => ({
        ...s, orders: data.length,
        revenue: data.reduce((sum,o) => sum+Number(o.total_amount), 0),
        pending: data.filter(o => o.status==='pending').length,
      }));
    }
  };

  // Search + pagination
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);
  useEffect(() => setPage(0), [search]);

  // Mutations — all optimistic, non-blocking
  const savePrice = async (p: Product) => {
    const val = parseFloat(editPrices[p.id]);
    if (isNaN(val)) return;
    startTransition(() => {
      setProducts(prev => prev.map(x => x.id===p.id ? {...x, price:val} : x));
      setEditPrices(prev => { const n={...prev}; delete n[p.id]; return n; });
    });
    toast.success('Price saved ✅', { duration: 1500 });
    await supabase.from('products').update({ price:val }).eq('id', p.id);
  };

  const saveSalePrice = async (p: Product, saleId: string) => {
    const val = parseFloat(editPrices[saleId]) || null;
    if (val && val >= p.price) { toast.error('Sale price must be lower'); return; }
    startTransition(() => {
      setProducts(prev => prev.map(x => x.id===p.id ? {...x, compare_price:val} : x));
      setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; });
    });
    toast.success('Sale price saved ✅', { duration: 1500 });
    await supabase.from('products').update({ compare_price:val }).eq('id', p.id);
  };

  const saveStock = async (p: Product) => {
    const val = parseInt(editStock[p.sku]);
    if (isNaN(val)) return;
    startTransition(() => {
      setProducts(prev => prev.map(x => x.sku===p.sku ? {...x, inventory:[{quantity:val}]} : x));
      setEditStock(prev => { const n={...prev}; delete n[p.sku]; return n; });
    });
    toast.success('Stock saved ✅', { duration: 1500 });
    await supabase.from('inventory').update({ quantity:val }).eq('sku', p.sku);
  };

  const toggleStatus = async (p: Product) => {
    const next = p.status==='active' ? 'inactive' : 'active';
    startTransition(() => setProducts(prev => prev.map(x => x.id===p.id ? {...x, status:next} : x)));
    toast.success(`${next==='active'?'✅':'⏸'} ${p.sku}`, { duration: 1200 });
    await supabase.from('products').update({ status:next }).eq('id', p.id);
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete ${p.sku} — ${p.name}?\n\nThis cannot be undone.`)) return;
    startTransition(() => setProducts(prev => prev.filter(x => x.id!==p.id)));
    toast.success(`${p.sku} deleted`, { duration: 1500 });
    supabase.from('products').delete().eq('id', p.id);
  };

  const handleImageUploaded = (id: string, url: string) => {
    startTransition(() => setProducts(prev => prev.map(p => p.id===id ? {...p, image_url:url} : p)));
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    toast.success(`Order: ${status}`, { duration: 1500 }); loadOrders();
  };
  const verifyPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status:'verified' }).eq('order_id', orderId);
    await supabase.from('orders').update({ status:'paid' }).eq('id', orderId);
    toast.success('Payment verified ✅'); loadOrders();
  };
  const rejectPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status:'rejected' }).eq('order_id', orderId);
    toast.success('Payment rejected'); loadOrders();
  };

  const searchQR = async () => {
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
        const url   = `${APP_URL}/p/${p.sku}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20&format=png`;
        const blob  = await (await fetch(qrUrl)).blob();
        zip.file(`${p.sku}.png`, blob);
      }
      const content = await zip.generateAsync({ type:'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = 'ast3r-qr-codes.zip'; a.click();
      toast.dismiss(t); toast.success(`✅ ${products.length} QR codes!`);
    } catch(e:any) { toast.dismiss(t); toast.error(e.message); }
    finally { setGenZip(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  if (loading) return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center">
      <div className="text-center">
        <p className="font-serif text-3xl tracking-widest text-white">AST3R</p>
        <p className="text-brand-gray text-xs mt-3 animate-pulse">Loading…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F0EC] flex">
      {/* Modals */}
      {editingProd && <EditModal product={editingProd} onClose={() => setEditingProd(null)} onSaved={loadProducts} />}
      {showCSV     && <CSVModal onClose={() => setShowCSV(false)} onDone={loadProducts} />}

      {/* ── SIDEBAR ────────────────────────────────────────── */}
      <aside className="w-16 sm:w-56 bg-brand-black flex flex-col flex-shrink-0 sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-4 py-6 border-b border-white/10">
          <p className="font-serif text-white text-lg tracking-[0.2em] hidden sm:block">AST3R</p>
          <p className="font-serif text-white text-lg tracking-widest sm:hidden text-center">A</p>
          <p className="text-white/40 text-xs mt-0.5 hidden sm:block">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setTab(n.id as Tab)}
              className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-all rounded-sm ${
                tab === n.id
                  ? 'bg-brand-orange text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white'
              }`}>
              <span className="text-lg flex-shrink-0">{n.icon}</span>
              <span className="text-xs font-medium tracking-wide hidden sm:block">{n.label}</span>
              {n.id === 'orders' && stats.pending > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center hidden sm:flex">
                  {stats.pending}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-white/40 text-xs truncate hidden sm:block">{user?.email}</p>
          <button onClick={signOut}
            className="mt-2 text-xs text-white/50 hover:text-white transition-colors flex items-center gap-2">
            <span>→</span>
            <span className="hidden sm:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">

        {/* Top bar */}
        <div className="bg-white border-b border-[#E8E8E5] px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <div>
            <h1 className="font-serif text-xl text-brand-black capitalize">{tab}</h1>
            <p className="text-xs text-brand-gray">ast3r.store Admin</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-brand-gray hover:text-brand-black border border-[#E8E8E5] px-3 py-1.5 hover:border-brand-black transition-colors">
              🔗 View Store
            </a>
          </div>
        </div>

        <div className="p-6">

          {/* ══ DASHBOARD ══════════════════════════════════════ */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label:'Total Products', value: stats.products,  icon:'👗', color:'bg-brand-black text-white',    action:() => setTab('products') },
                  { label:'Total Orders',   value: stats.orders,    icon:'📋', color:'bg-white',                     action:() => setTab('orders') },
                  { label:'Revenue',        value: formatPrice(stats.revenue), icon:'💰', color:'bg-white', action:() => setTab('orders') },
                  { label:'Pending Orders', value: stats.pending,   icon:'⏳', color: stats.pending > 0 ? 'bg-red-50 border-red-200' : 'bg-white', action:() => setTab('orders') },
                ].map(({ label, value, icon, color, action }) => (
                  <button key={label} onClick={action}
                    className={`${color} border border-[#E8E8E5] p-5 text-left hover:shadow-md transition-all`}>
                    <p className="text-2xl mb-3">{icon}</p>
                    <p className="font-serif text-2xl font-medium">{value}</p>
                    <p className="text-xs text-brand-gray mt-1 uppercase tracking-widest">{label}</p>
                  </button>
                ))}
              </div>

              {/* Quick actions */}
              <div className="bg-white border border-[#E8E8E5] p-6">
                <h3 className="font-medium text-brand-black mb-4 text-sm uppercase tracking-widest">Quick Actions</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label:'Add Product',    icon:'➕', action:() => { setTab('products'); setTimeout(()=>document.getElementById('quick-add')?.scrollIntoView({behavior:'smooth'}),100); } },
                    { label:'CSV Import',     icon:'📄', action:() => setShowCSV(true) },
                    { label:'View Orders',    icon:'📋', action:() => setTab('orders') },
                    { label:'Download QRs',  icon:'📲', action:() => setTab('qr') },
                  ].map(({ label, icon, action }) => (
                    <button key={label} onClick={action}
                      className="border border-[#E8E8E5] px-4 py-4 text-sm hover:border-brand-orange hover:text-brand-orange transition-all text-brand-gray flex flex-col items-center gap-2">
                      <span className="text-2xl">{icon}</span>
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {orders.length > 0 && (
                <div className="bg-white border border-[#E8E8E5]">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E8E5]">
                    <h3 className="font-medium text-sm uppercase tracking-widest">Recent Orders</h3>
                    <button onClick={() => setTab('orders')} className="text-xs text-brand-orange">View all →</button>
                  </div>
                  <div className="divide-y divide-[#E8E8E5]">
                    {orders.slice(0,5).map(o => (
                      <div key={o.id} className="px-6 py-3 flex items-center justify-between">
                        <div>
                          <p className="font-mono text-sm font-medium">{o.order_code}</p>
                          <p className="text-xs text-brand-gray">{o.customer_name} · {formatDate(o.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium">{formatPrice(o.total_amount)}</span>
                          <Badge status={o.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Low stock alert */}
              {stats.lowStock > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-yellow-800">{stats.lowStock} products running low on stock</p>
                    <button onClick={() => setTab('products')} className="text-xs text-yellow-700 underline">Review inventory →</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PRODUCTS ═══════════════════════════════════════ */}
          {tab === 'products' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-56 max-w-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gray text-sm">🔍</span>
                  <input type="text" placeholder="Search SKU, name, category…"
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full border border-[#E8E8E5] pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:border-brand-black bg-white" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-gray hover:text-brand-black text-xs">✕</button>}
                </div>
                <div className="flex gap-2 ml-auto">
                  <button onClick={loadProducts} className="border border-[#E8E8E5] px-4 py-2.5 text-xs bg-white hover:border-brand-black transition-colors">↻</button>
                  <button onClick={() => setShowCSV(true)} className="border border-brand-black px-4 py-2.5 text-xs bg-white hover:bg-brand-black hover:text-white transition-colors">📄 CSV</button>
                </div>
              </div>

              {search && <p className="text-xs text-brand-gray">{filtered.length} result{filtered.length!==1?'s':''} for "<strong>{search}</strong>"</p>}

              {/* Table */}
              <div className="bg-white border border-[#E8E8E5] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-[#F5F5F3] border-b border-[#E8E8E5]">
                      <tr>
                        {['📷','SKU','Name & Category','Sizes','Price','Sale ₱','Stock','Status',''].map((h,i) => (
                          <th key={i} className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-16 text-brand-gray">
                          {search ? `No results for "${search}"` : 'No products yet'}
                        </td></tr>
                      ) : paginated.map(p => {
                        const stock    = p.inventory?.[0]?.quantity ?? 0;
                        const sizeTotal = (p.size_inventory||[]).reduce((s,si) => s+si.quantity, 0);
                        const dispStock = (p.size_inventory||[]).length > 0 ? sizeTotal : stock;
                        const priceEdit = editPrices[p.id] !== undefined;
                        const saleId    = `sale-${p.id}`;
                        const saleEdit  = editPrices[saleId] !== undefined;
                        const stockEdit = editStock[p.sku] !== undefined;

                        return (
                          <tr key={p.id}
                            className="border-b border-[#F0F0ED] hover:bg-[#FAFAF8] transition-colors group cursor-pointer"
                            onClick={() => setEditingProd(p)}>

                            {/* Image */}
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              <ImageCell product={p} onUploaded={handleImageUploaded} />
                            </td>

                            {/* SKU */}
                            <td className="px-3 py-2.5 font-mono text-xs text-brand-gray whitespace-nowrap">{p.sku}</td>

                            {/* Name + Category */}
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-brand-black text-sm">{p.name}</p>
                              <p className="text-xs text-brand-gray">{p.category}</p>
                            </td>

                            {/* Sizes */}
                            <td className="px-3 py-2.5 min-w-[140px]" onClick={e => e.stopPropagation()}>
                              <SizeStockCell product={p} onUpdated={loadProducts} />
                            </td>

                            {/* Price */}
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              {priceEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01"
                                    value={editPrices[p.id]}
                                    onChange={e => setEditPrices(prev => ({...prev,[p.id]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') savePrice(p); if(e.key==='Escape') setEditPrices(prev=>{const n={...prev};delete n[p.id];return n;}); }}
                                    className="w-24 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => savePrice(p)} className="text-xs bg-brand-orange text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditPrices(prev => ({...prev,[p.id]:String(p.price)}))}
                                  className="text-sm font-medium text-brand-black hover:text-brand-orange transition-colors"
                                  title="Click to edit">
                                  {formatPrice(p.price)}
                                </button>
                              )}
                            </td>

                            {/* Sale Price */}
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              {saleEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01" placeholder="sale ₱"
                                    value={editPrices[saleId]}
                                    onChange={e => setEditPrices(prev => ({...prev,[saleId]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') saveSalePrice(p,saleId); if(e.key==='Escape') setEditPrices(prev=>{const n={...prev};delete n[saleId];return n;}); }}
                                    className="w-24 border border-red-400 px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => saveSalePrice(p,saleId)} className="text-xs bg-red-500 text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditPrices(prev => ({...prev,[saleId]:String(p.compare_price||'')}))}
                                  title="Click to set sale price" className="text-left">
                                  {p.compare_price && p.compare_price < p.price ? (
                                    <div>
                                      <span className="text-sm font-medium text-red-600">{formatPrice(p.compare_price)}</span>
                                      <span className="ml-1 text-xs font-bold text-white bg-red-500 px-1 py-0.5">
                                        -{Math.round((1-p.compare_price/p.price)*100)}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-[#D4D4CF] hover:text-brand-orange transition-colors">+ add</span>
                                  )}
                                </button>
                              )}
                            </td>

                            {/* Stock */}
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              {stockEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0"
                                    value={editStock[p.sku]}
                                    onChange={e => setEditStock(prev => ({...prev,[p.sku]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') saveStock(p); if(e.key==='Escape') setEditStock(prev=>{const n={...prev};delete n[p.sku];return n;}); }}
                                    className="w-20 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => saveStock(p)} className="text-xs bg-brand-orange text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditStock(prev => ({...prev,[p.sku]:String(stock)}))}
                                  className={`text-xs font-bold hover:underline ${dispStock<=0?'text-red-500':dispStock<=5?'text-orange-500':'text-green-600'}`}
                                  title="Click to edit">
                                  {dispStock} units
                                </button>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2.5"><Badge status={p.status} /></td>

                            {/* Actions */}
                            <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditingProd(p)} title="Edit"
                                  className="text-xs px-2 py-1.5 border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">✏️</button>
                                <a href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer" title="View"
                                  className="text-xs px-2 py-1.5 border border-[#E8E8E5] hover:border-brand-black transition-colors">🔗</a>
                                <button onClick={() => toggleStatus(p)} title={p.status==='active'?'Deactivate':'Activate'}
                                  className="text-xs px-2 py-1.5 border border-[#E8E8E5] hover:border-brand-black transition-colors">
                                  {p.status==='active'?'⏸':'▶'}
                                </button>
                                <button onClick={() => deleteProduct(p)} title="Delete"
                                  className="text-xs px-2 py-1.5 border border-red-100 text-red-400 hover:border-red-400 hover:bg-red-50 transition-colors">🗑</button>
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E8E5] bg-[#F5F5F3] text-xs">
                    <span className="text-brand-gray">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0}
                        className="px-3 py-1.5 border border-[#E8E8E5] hover:border-brand-black disabled:opacity-40">← Prev</button>
                      {Array.from({length:totalPages},(_,i)=>(
                        <button key={i} onClick={() => setPage(i)}
                          className={`px-3 py-1.5 border transition-colors ${i===page?'border-brand-black bg-brand-black text-white':'border-[#E8E8E5] hover:border-brand-black'}`}>
                          {i+1}
                        </button>
                      ))}
                      <button onClick={() => setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                        className="px-3 py-1.5 border border-[#E8E8E5] hover:border-brand-black disabled:opacity-40">Next →</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Add */}
              <div id="quick-add"><QuickAdd onAdded={loadProducts} /></div>
              <p className="text-xs text-brand-gray text-center">
                💡 Click row to edit · Hover image to upload · Click price / stock to edit inline · Hover for actions
              </p>
            </div>
          )}

          {/* ══ ORDERS ═════════════════════════════════════════ */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-brand-gray">{orders.length} total · {stats.pending} pending</p>
                <button onClick={loadOrders} className="border border-[#E8E8E5] px-4 py-2 text-xs bg-white hover:border-brand-black transition-colors">↻ Refresh</button>
              </div>

              {orders.length === 0 ? (
                <div className="text-center py-20 bg-white border border-[#E8E8E5]">
                  <p className="text-4xl mb-4">📭</p>
                  <p className="text-brand-gray">No orders yet</p>
                </div>
              ) : orders.map(order => {
                const payment = order.payments?.[0];
                return (
                  <div key={order.id} className="bg-white border border-[#E8E8E5]">
                    {/* Order header */}
                    <div className="flex flex-wrap justify-between gap-3 px-5 py-4 border-b border-[#F0F0ED]">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-mono text-sm font-bold">{order.order_code}</p>
                        <Badge status={order.status} />
                        {payment && <Badge status={payment.status} />}
                        {payment?.payment_method && (
                          <span className="text-xs text-brand-gray">{payment.payment_method}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-serif text-lg font-medium">{formatPrice(order.total_amount)}</p>
                        <p className="text-xs text-brand-gray">{formatDate(order.created_at)}</p>
                      </div>
                    </div>

                    {/* Order details */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-[#F0F0ED] text-sm">
                      <div>
                        <p className="text-xs text-brand-gray mb-1">Customer</p>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-xs text-brand-gray">{order.contact_number}</p>
                        {order.email && <p className="text-xs text-brand-gray">{order.email}</p>}
                      </div>
                      <div>
                        <p className="text-xs text-brand-gray mb-1">Address</p>
                        <p className="text-xs leading-relaxed">{order.address_full}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-gray mb-1">Shipping</p>
                        <p className="text-xs font-medium">{formatPrice(order.shipping_fee||0)}</p>
                        <p className="text-xs text-brand-gray">{order.region||'—'}</p>
                        <p className="text-xs text-brand-gray">{order.courier||'TBD'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-brand-gray mb-1">Breakdown</p>
                        <p className="text-xs">Items: {formatPrice(order.subtotal||order.total_amount)}</p>
                        <p className="text-xs">Ship: {formatPrice(order.shipping_fee||0)}</p>
                        <p className="text-xs font-bold">Total: {formatPrice(order.total_amount)}</p>
                      </div>
                    </div>

                    {/* Items + Actions */}
                    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {order.order_items?.map((item,i) => (
                          <span key={i} className="text-xs bg-[#F5F5F3] px-2 py-1 font-mono">{item.sku} ×{item.quantity}</span>
                        ))}
                      </div>
                      {payment?.payment_proof_url && (
                        <a href={payment.payment_proof_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-brand-orange underline">📎 View Proof</a>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <select defaultValue={order.status}
                          onChange={e => updateOrderStatus(order.id, e.target.value)}
                          className="text-xs border border-[#E8E8E5] px-3 py-1.5 bg-white focus:outline-none">
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="shipped">Shipped</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        {payment?.status==='pending' && payment?.payment_method!=='COD' && <>
                          <button onClick={() => verifyPayment(order.id)}
                            className="text-xs px-4 py-1.5 bg-green-600 text-white hover:bg-green-700 transition-colors">✓ Verify</button>
                          <button onClick={() => rejectPayment(order.id)}
                            className="text-xs px-4 py-1.5 bg-red-600 text-white hover:bg-red-700 transition-colors">✗ Reject</button>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ QR CODES ═══════════════════════════════════════ */}
          {tab === 'qr' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Search QR */}
                <div className="bg-white border border-[#E8E8E5] p-6">
                  <h3 className="font-serif text-lg mb-1">Search QR</h3>
                  <p className="text-xs text-brand-gray mb-4">Enter SKU → generate QR code</p>
                  <div className="flex gap-2 mb-5">
                    <input type="text" placeholder="e.g. AST-TOP-001"
                      value={qrSku} onChange={e => setQrSku(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key==='Enter' && searchQR()}
                      className="input-field font-mono text-sm flex-1" />
                    <button onClick={searchQR} className="btn-primary py-2 px-5 text-xs">Generate</button>
                  </div>
                  {qrProduct && (
                    <div className="text-center">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${APP_URL}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=15`}
                        alt={qrProduct.sku} className="mx-auto mb-3 w-44 h-44 border border-[#E8E8E5]" />
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
                <div className="bg-white border border-[#E8E8E5] p-6">
                  <h3 className="font-serif text-lg mb-1">Bulk ZIP</h3>
                  <p className="text-xs text-brand-gray mb-4">Download all {products.length} QR codes · 600×600px · print-ready</p>
                  <div className="bg-[#F5F5F3] p-3 mb-5 font-mono text-xs text-brand-gray space-y-1">
                    {products.slice(0,4).map(p => <p key={p.sku}>{p.sku}.png</p>)}
                    {products.length > 4 && <p className="text-[#D4D4CF]">…{products.length-4} more</p>}
                  </div>
                  <button onClick={generateAllQR} disabled={genZip||products.length===0}
                    className="btn-primary w-full py-3 text-xs disabled:opacity-50">
                    {genZip ? '⏳ Generating…' : `⬇ Download All ${products.length} QR Codes (ZIP)`}
                  </button>
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map(p => {
                  const url = `${APP_URL}/p/${p.sku}`;
                  return (
                    <div key={p.sku} className="bg-white border border-[#E8E8E5] p-4 text-center">
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
          )}

          {/* ══ SETTINGS ═══════════════════════════════════════ */}
          {tab === 'settings' && (
            <div className="max-w-lg space-y-6">
              <div className="bg-white border border-[#E8E8E5] p-6">
                <h3 className="font-medium text-sm uppercase tracking-widest mb-4">Store Info</h3>
                <div className="space-y-2 text-sm">
                  {[
                    { label:'Store URL',   value:'ast3r.store' },
                    { label:'Admin Email', value:'admin@ast3r.store' },
                    { label:'Contact',     value:'inquiry@ast3r.store' },
                    { label:'Phone',       value:'0966 960 6060' },
                    { label:'Instagram',   value:'@ast3r.ph' },
                    { label:'Location',    value:'Tagaytay City, Philippines' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2 border-b border-[#F0F0ED]">
                      <span className="text-brand-gray text-xs uppercase tracking-widest">{label}</span>
                      <span className="font-medium text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-[#E8E8E5] p-6">
                <h3 className="font-medium text-sm uppercase tracking-widest mb-4">Shipping Rates</h3>
                <div className="space-y-2">
                  {[
                    { region:'Metro Manila (NCR)', fee:'₱100', days:'2–3 days' },
                    { region:'Luzon',              fee:'₱150', days:'3–5 days' },
                    { region:'Visayas',            fee:'₱200', days:'5–7 days' },
                    { region:'Mindanao',           fee:'₱250', days:'5–7 days' },
                    { region:'International',      fee:'₱800', days:'7–21 days' },
                  ].map(({ region, fee, days }) => (
                    <div key={region} className="flex items-center justify-between py-2 border-b border-[#F0F0ED] text-sm">
                      <span className="text-brand-gray text-xs">{region}</span>
                      <div className="text-right">
                        <span className="font-medium text-xs">{fee}</span>
                        <span className="text-xs text-brand-gray ml-2">{days}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-brand-gray mt-3">To update rates, edit <code className="bg-[#F5F5F3] px-1">src/lib/shipping.ts</code></p>
              </div>

              <div className="bg-white border border-[#E8E8E5] p-6">
                <h3 className="font-medium text-sm uppercase tracking-widest mb-4">System Info</h3>
                <div className="space-y-2">
                  {[
                    { label:'Products',  value: stats.products },
                    { label:'Orders',    value: stats.orders },
                    { label:'Revenue',   value: formatPrice(stats.revenue) },
                    { label:'Framework', value: 'Next.js 14' },
                    { label:'Database',  value: 'Supabase (PostgreSQL)' },
                    { label:'Hosting',   value: 'Vercel' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between py-2 border-b border-[#F0F0ED]">
                      <span className="text-brand-gray text-xs uppercase tracking-widest">{label}</span>
                      <span className="font-medium text-xs">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button onClick={signOut}
                className="w-full border border-red-200 text-red-500 py-3 text-sm hover:bg-red-50 transition-colors">
                Sign Out
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
