// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image         from 'next/image';
import toast         from 'react-hot-toast';
import { supabase }  from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
type Tab = 'dashboard' | 'products' | 'orders' | 'qr';

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
const CATS = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
const SIZES_ALL = ['XS','S','M','L','XL','XXL','Free Size'];
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';

// ── Pill Badge ─────────────────────────────────────────────────
function Pill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700 border-amber-200',
    paid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
    shipped:  'bg-sky-50 text-sky-700 border-sky-200',
    cancelled:'bg-red-50 text-red-600 border-red-200',
    verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-600 border-red-200',
    active:   'bg-brand-black text-white border-brand-black',
    inactive: 'bg-gray-100 text-gray-400 border-gray-200',
  };
  return <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium border tracking-wide ${map[status] || map.pending}`}>{status}</span>;
}

// ── Image Upload Cell ──────────────────────────────────────────
function ImgCell({ product, onDone }: { product: Product; onDone: (id: string, url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    setBusy(true);
    const t = toast.loading('Uploading…');
    try {
      const fn = `${product.sku}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      onDone(product.id, publicUrl);
      toast.dismiss(t); toast.success('Photo saved ✅');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div className="relative w-11 h-11 cursor-pointer group/img flex-shrink-0"
      onClick={() => !busy && ref.current?.click()} title="Click to upload photo">
      <div className="w-11 h-11 bg-[#F0EEE9] border border-[#E2DED8] overflow-hidden">
        {product.image_url
          ? <Image src={product.image_url} alt="" fill className="object-cover" sizes="44px" />
          : <div className="absolute inset-0 flex items-center justify-center text-[#B8B4AE]">+</div>
        }
        <div className="absolute inset-0 bg-brand-orange/90 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-bold">{busy ? '…' : '↑'}</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

// ── Size Stock Inline ──────────────────────────────────────────
function SizeCell({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    return m;
  });
  const [, startT] = useTransition();

  useEffect(() => {
    const m: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    setSizes(m);
  }, [product.size_inventory]);

  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const hasAny = Object.keys(sizes).length > 0;

  const save = (size: string, qty: number) => {
    startT(() => setSizes(prev => ({ ...prev, [size]: qty })));
    supabase.from('size_inventory').upsert({ sku: product.sku, size, quantity: qty }, { onConflict: 'sku,size' });
    toast.success(`${size}: ${qty}`, { duration: 1000 });
  };

  const remove = (size: string) => {
    startT(() => setSizes(prev => { const n = { ...prev }; delete n[size]; return n; }));
    supabase.from('size_inventory').delete().eq('sku', product.sku).eq('size', size);
  };

  return (
    <div>
      <button onClick={() => setOpen(v => !v)} className="text-left w-full">
        {hasAny ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(sizes).map(([s, q]) => (
              <span key={s} className={`text-[11px] px-1.5 py-0.5 border font-medium ${
                q <= 0 ? 'border-red-200 text-red-400 bg-red-50' :
                q <= 3 ? 'border-amber-200 text-amber-600' :
                'border-[#E2DED8] text-brand-black'}`}>
                {s}:{q}
              </span>
            ))}
            <span className="text-[11px] text-[#B8B4AE] hover:text-brand-orange">{open ? '▲' : '▼'}</span>
          </div>
        ) : (
          <span className="text-[11px] text-brand-orange underline underline-offset-2">+ Add sizes</span>
        )}
      </button>

      {open && (
        <div className="mt-2 bg-white border border-[#E2DED8] p-3 shadow-md space-y-2 z-10 relative">
          <p className="text-[10px] font-semibold text-[#B8B4AE] uppercase tracking-widest">{product.sku}</p>
          {Object.entries(sizes).map(([sz, qty]) => (
            <div key={sz} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-black w-14">{sz}</span>
              <input type="number" min="0" defaultValue={qty}
                onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== qty) save(sz, v); }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) save(sz, v); (e.target as HTMLInputElement).blur(); } }}
                className="w-16 border border-[#E2DED8] px-2 py-1 text-xs focus:outline-none focus:border-brand-orange" />
              <button onMouseDown={() => remove(sz)} className="text-[11px] text-red-400 hover:text-red-600 ml-auto">✕</button>
            </div>
          ))}
          <div className="pt-2 border-t border-[#F0EEE9]">
            <p className="text-[10px] text-[#B8B4AE] mb-1.5">Add:</p>
            <div className="flex flex-wrap gap-1">
              {SIZES_ALL.filter(s => sizes[s] === undefined).map(s => (
                <button key={s} onMouseDown={() => save(s, 0)}
                  className="text-[11px] px-2 py-1 border border-dashed border-[#E2DED8] hover:border-brand-orange hover:text-brand-orange transition-colors">
                  +{s}
                </button>
              ))}
            </div>
          </div>
          {hasAny && (
            <div className="flex justify-between text-[11px] pt-2 border-t border-[#F0EEE9]">
              <span className="text-[#B8B4AE]">Total</span>
              <span className={`font-bold ${total <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>{total} units</span>
            </div>
          )}
          <button onMouseDown={() => setOpen(false)} className="w-full text-[11px] text-[#B8B4AE] hover:text-brand-black pt-1">Close ▲</button>
        </div>
      )}
    </div>
  );
}

// ── Edit Product Modal ─────────────────────────────────────────
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
  const [saving, setSaving] = useState(false);
  const [imgPrev, setImgPrev] = useState(product.image_url || '');
  const [imgBusy, setImgBusy] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const hasSizes = Object.keys(sizeStock).length > 0;

  const p  = parseFloat(form.price) || 0;
  const sp = parseFloat(form.compare_price) || 0;
  const validSale = sp > 0 && sp < p;
  const pct = validSale ? Math.round((1 - sp / p) * 100) : 0;
  const f = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

  const uploadImg = async (file: File) => {
    setImgBusy(true);
    const t = toast.loading('Uploading…');
    try {
      const fn = `${product.sku}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      setImgPrev(publicUrl);
      supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      toast.dismiss(t); toast.success('Photo saved ✅');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setImgBusy(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price)) { toast.error('Enter a valid price'); return; }
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
        await supabase.from('inventory').update({ quantity: parseInt(form.stock) || 0 }).eq('sku', product.sku);
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[96vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EEE9] bg-[#FAFAF8]">
          <div>
            <p className="font-mono text-[11px] text-[#B8B4AE] tracking-widest">{product.sku}</p>
            <h2 className="font-serif text-lg text-brand-black mt-0.5">Edit Product</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[#B8B4AE] hover:text-brand-black rounded-full hover:bg-[#F0EEE9] transition-colors">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Image */}
          <div className="flex items-center gap-4 p-4 bg-[#FAFAF8] border border-[#F0EEE9]">
            <div className="w-20 h-20 bg-[#F0EEE9] border border-[#E2DED8] overflow-hidden relative flex-shrink-0">
              {imgPrev
                ? <Image src={imgPrev} alt="" fill className="object-cover" sizes="80px" />
                : <div className="absolute inset-0 flex items-center justify-center text-2xl text-[#C8C4BE]">📷</div>
              }
              {imgBusy && <div className="absolute inset-0 bg-black/30 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-brand-black mb-1">Product Photo</p>
              <button onClick={() => imgRef.current?.click()} disabled={imgBusy}
                className="w-full border-2 border-dashed border-brand-orange text-brand-orange py-2.5 text-xs font-medium hover:bg-brand-orange hover:text-white transition-all disabled:opacity-40">
                {imgBusy ? 'Uploading…' : imgPrev ? '🔄 Change Photo' : '📸 Upload Photo'}
              </button>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); }} />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="input-label">Product Name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)}
              className="input-field" placeholder="e.g. Linen Blazer" />
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Original Price (₱) *</label>
              <input type="number" value={form.price} min="0" step="0.01"
                onChange={e => f('price', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="input-label">
                <span className="text-red-500">Sale Price</span> (₱)
              </label>
              <input type="number" value={form.compare_price} min="0" step="0.01"
                placeholder="lower = on sale"
                onChange={e => f('compare_price', e.target.value)} className="input-field" />
            </div>
          </div>

          {/* Discount preview */}
          {validSale && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-100">
              <span className="text-xs text-[#B8B4AE] line-through">₱{p.toLocaleString()}</span>
              <span className="text-sm font-bold text-red-600">₱{sp.toLocaleString()}</span>
              <span className="text-[11px] font-bold text-white bg-red-500 px-2 py-0.5">-{pct}% OFF</span>
              <span className="text-xs text-emerald-600 ml-auto">Save ₱{(p - sp).toLocaleString()}</span>
            </div>
          )}
          {sp > 0 && sp >= p && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2">⚠️ Sale price must be lower than original price</p>
          )}

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">Category</label>
              <select value={form.category} onChange={e => f('category', e.target.value)} className="input-field">
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="input-label">Status</label>
              <div className="grid grid-cols-2 gap-1">
                {['active', 'inactive'].map(s => (
                  <button key={s} onClick={() => f('status', s)}
                    className={`py-2.5 text-xs font-medium border transition-all ${
                      form.status === s
                        ? s === 'active' ? 'bg-brand-black text-white border-brand-black' : 'bg-gray-600 text-white border-gray-600'
                        : 'border-[#E2DED8] text-[#B8B4AE] hover:border-brand-black hover:text-brand-black'
                    }`}>{s === 'active' ? '✅ Active' : '⏸ Inactive'}</button>
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
            <label className="input-label">Sizes & Stock per Size</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SIZES_ALL.map(sz => (
                <button key={sz} onClick={() => setSizeStock(prev => {
                  const n = { ...prev };
                  if (n[sz] !== undefined) delete n[sz]; else n[sz] = 0;
                  return n;
                })} className={`text-xs px-3 py-1.5 border transition-all ${
                  sizeStock[sz] !== undefined
                    ? 'border-brand-black bg-brand-black text-white'
                    : 'border-[#E2DED8] text-[#B8B4AE] hover:border-brand-black hover:text-brand-black'
                }`}>{sz}</button>
              ))}
            </div>
            {hasSizes ? (
              <div className="border border-[#E2DED8] divide-y divide-[#F0EEE9]">
                {Object.entries(sizeStock).map(([sz, qty]) => (
                  <div key={sz} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-sm font-semibold text-brand-black w-16">{sz}</span>
                    <input type="number" min="0" value={qty}
                      onChange={e => setSizeStock(prev => ({ ...prev, [sz]: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-[#E2DED8] px-3 py-1.5 text-sm focus:outline-none focus:border-brand-orange" />
                    <span className="text-xs text-[#B8B4AE]">units</span>
                    <button onClick={() => setSizeStock(prev => { const n = { ...prev }; delete n[sz]; return n; })}
                      className="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-[#FAFAF8] text-xs">
                  <span className="text-[#B8B4AE]">Total stock</span>
                  <span className="font-bold text-brand-black">{Object.values(sizeStock).reduce((a, b) => a + b, 0)} units</span>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <label className="input-label">Plain Stock (no sizes)</label>
                <input type="number" min="0" value={form.stock}
                  onChange={e => f('stock', e.target.value)} className="input-field w-32" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-[#F0EEE9] bg-[#FAFAF8] flex-shrink-0">
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

// ── CSV Modal ──────────────────────────────────────────────────
function CSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [fn, setFn] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const parse = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    const hdrs  = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const parsed = lines.slice(1).filter(l => l.trim()).map((line, i) => {
      const vals: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      vals.push(cur.trim());
      const row: any = { _l: i + 2 };
      hdrs.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
      return row;
    }).filter(r => r.sku || r.name);
    setRows(parsed);
    toast.success(`Parsed ${parsed.length} rows ✅`);
  };

  const doImport = async () => {
    setBusy(true);
    const t = toast.loading(`Importing ${rows.length}…`);
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const sku = r.sku?.trim().toUpperCase();
        if (!sku) { fail++; continue; }
        const { error } = await supabase.from('products').upsert({
          sku, name: r.name, description: r.description || '',
          price: parseFloat(r.price) || 0, currency: 'PHP',
          image_url: r.image_url || '', category: r.category || 'Tops', status: 'active',
          sizes: r.sizes ? r.sizes.split('/').map((s: string) => s.trim()).filter(Boolean) : [],
        }, { onConflict: 'sku' });
        if (error) { fail++; continue; }
        await supabase.from('inventory').upsert({ sku, quantity: parseInt(r.stock) || 0 }, { onConflict: 'sku' });
        await supabase.from('qr_links').upsert({ sku, qr_url: `${APP_URL}/p/${sku}`, scans: 0 }, { onConflict: 'sku' });
        ok++;
      } catch { fail++; }
    }
    toast.dismiss(t);
    toast.success(`✅ ${ok} imported${fail ? ` · ${fail} failed` : ''}`);
    setBusy(false); onDone(); onClose();
  };

  const template = () => {
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent('sku,name,description,price,stock,image_url,category,sizes\nAST-TOP-007,My Product,Description,1500,20,,Tops,S/M/L/XL')}`;
    a.download = 'ast3r-template.csv'; a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EEE9] bg-[#FAFAF8]">
          <h2 className="font-serif text-lg">CSV Bulk Import</h2>
          <button onClick={onClose} className="text-[#B8B4AE] hover:text-brand-black text-xl">✕</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="bg-[#FAFAF8] border border-[#F0EEE9] p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-brand-black mb-1">Columns: <span className="font-mono text-[#B8B4AE]">sku, name, price, stock, category, sizes</span></p>
              <p className="text-xs text-[#B8B4AE]">Sizes format: S/M/L/XL · leave compare_price blank for no sale</p>
            </div>
            <button onClick={template} className="btn-outline py-2 px-4 text-xs flex-shrink-0">⬇ Template</button>
          </div>
          <div className="border-2 border-dashed border-[#E2DED8] p-10 text-center cursor-pointer hover:border-brand-orange transition-colors"
            onClick={() => ref.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFn(f.name); const r = new FileReader(); r.onload = ev => parse(ev.target?.result as string); r.readAsText(f); } }}
            onDragOver={e => e.preventDefault()}>
            <input ref={ref} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFn(f.name); const r = new FileReader(); r.onload = ev => parse(ev.target?.result as string); r.readAsText(f); e.target.value = ''; } }} />
            {fn ? (
              <div>
                <p className="text-2xl mb-2">📄</p>
                <p className="font-medium text-brand-black text-sm">{fn}</p>
                <p className="text-xs text-[#B8B4AE] mt-1">{rows.length} rows ready · click to change</p>
              </div>
            ) : (
              <div>
                <p className="text-3xl mb-3 text-[#C8C4BE]">📄</p>
                <p className="text-sm text-[#B8B4AE]">Click to select CSV or drag & drop</p>
              </div>
            )}
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto border border-[#E2DED8] max-h-48">
              <table className="w-full text-xs">
                <thead className="bg-[#FAFAF8] sticky top-0">
                  <tr>{['SKU', 'Name', 'Price', 'Stock', 'Sizes', 'Category'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-[#B8B4AE] uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-[#F0EEE9]">
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className={!r.sku ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 font-mono font-medium">{r.sku || <span className="text-red-500">MISSING</span>}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2">₱{r.price}</td>
                      <td className="px-3 py-2">{r.stock || 0}</td>
                      <td className="px-3 py-2 text-[#B8B4AE]">{r.sizes || '—'}</td>
                      <td className="px-3 py-2 text-[#B8B4AE]">{r.category || 'Tops'}</td>
                    </tr>
                  ))}
                  {rows.length > 20 && <tr><td colSpan={6} className="px-3 py-2 text-center text-[#B8B4AE] italic">…{rows.length - 20} more</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-[#F0EEE9] bg-[#FAFAF8]">
          <button onClick={onClose} className="btn-outline flex-1 py-3 text-xs">Cancel</button>
          <button onClick={doImport} disabled={rows.length === 0 || busy}
            className="btn-primary flex-[2] py-3 text-xs disabled:opacity-40">
            {busy ? 'Importing…' : `✅ Import ${rows.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Add ──────────────────────────────────────────────────
function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const init = { sku: '', name: '', price: '', stock: '0', category: 'Tops', sizes: [] as string[] };
  const [form, setForm] = useState(init);
  const [busy, setBusy] = useState(false);

  const toggle = (s: string) => setForm(f => ({
    ...f, sizes: f.sizes.includes(s) ? f.sizes.filter(x => x !== s) : [...f.sizes, s]
  }));

  const submit = async () => {
    if (!form.sku || !form.name || !form.price) { toast.error('SKU, name and price required'); return; }
    setBusy(true);
    try {
      const sku = form.sku.trim().toUpperCase();
      const { error } = await supabase.from('products').insert({
        sku, name: form.name.trim(), price: parseFloat(form.price),
        currency: 'PHP', category: form.category,
        status: 'active', description: '', image_url: '', sizes: form.sizes,
      });
      if (error) throw error;
      await supabase.from('inventory').insert({ sku, quantity: parseInt(form.stock) || 0 });
      await supabase.from('qr_links').insert({ sku, qr_url: `${APP_URL}/p/${sku}`, scans: 0 });
      toast.success(`${sku} added ✅`);
      setForm(init); onAdded();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-[#FAFAF8] border border-[#E2DED8] p-5" id="quick-add">
      <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest mb-4">⚡ Quick Add Product</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <input placeholder="SKU *" value={form.sku}
          onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
          className="input-field text-xs py-2 font-mono" />
        <input placeholder="Product Name *" value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          className="input-field text-xs py-2 col-span-2" />
        <input type="number" placeholder="Price *" value={form.price}
          onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
          className="input-field text-xs py-2" />
        <input type="number" placeholder="Stock" min="0" value={form.stock}
          onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
          className="input-field text-xs py-2" />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          className="border border-[#E2DED8] px-2 py-1.5 text-xs focus:outline-none focus:border-brand-black bg-white">
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-[#B8B4AE]">Sizes:</span>
        {SIZES_ALL.map(s => (
          <button key={s} onClick={() => toggle(s)}
            className={`text-[11px] px-2.5 py-1 border transition-all ${
              form.sizes.includes(s) ? 'border-brand-black bg-brand-black text-white' : 'border-[#E2DED8] text-[#B8B4AE] hover:border-brand-black'
            }`}>{s}</button>
        ))}
        <button onClick={submit} disabled={busy}
          className="ml-auto bg-brand-orange text-white text-xs font-medium px-5 py-2 hover:bg-orange-600 transition-colors disabled:opacity-50">
          {busy ? 'Adding…' : '+ Add Product'}
        </button>
      </div>
    </div>
  );
}

// ── MAIN ───────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [, startT] = useTransition();
  const [tab,        setTab]        = useState<Tab>('dashboard');
  const [user,       setUser]       = useState<any>(null);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [catFilter,  setCatFilter]  = useState('');
  const [page,       setPage]       = useState(0);
  const [editProd,   setEditProd]   = useState<Product | null>(null);
  const [showCSV,    setShowCSV]    = useState(false);
  const [qrSku,      setQrSku]      = useState('');
  const [qrProd,     setQrProd]     = useState<Product | null>(null);
  const [genZip,     setGenZip]     = useState(false);
  const [editPrices, setEditPrices] = useState<Record<string, string>>({});
  const [editStock,  setEditStock]  = useState<Record<string, string>>({});
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('');
  const [stats, setStats] = useState({ orders: 0, revenue: 0, pending: 0, products: 0, lowStock: 0 });

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
      const low = data.filter(p => (p.inventory?.[0]?.quantity ?? 0) <= 3 && (p.inventory?.[0]?.quantity ?? 0) > 0).length;
      setStats(s => ({ ...s, products: data.length, lowStock: low }));
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
        revenue: data.reduce((sum, o) => sum + Number(o.total_amount), 0),
        pending: data.filter(o => o.status === 'pending').length,
      }));
    }
  };

  // Filtered products
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p =>
      (!q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)) &&
      (!catFilter || p.category === catFilter)
    );
  }, [products, search, catFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => setPage(0), [search, catFilter]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const q = orderSearch.toLowerCase();
    return orders.filter(o =>
      (!q || o.order_code.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q)) &&
      (!orderFilter || o.status === orderFilter)
    );
  }, [orders, orderSearch, orderFilter]);

  // Mutations — all non-blocking (optimistic first, DB after)
  const savePrice = (p: Product) => {
    const val = parseFloat(editPrices[p.id]);
    if (isNaN(val)) return;
    startT(() => {
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, price: val } : x));
      setEditPrices(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    });
    toast.success('Price saved ✅', { duration: 1200 });
    supabase.from('products').update({ price: val }).eq('id', p.id);
  };

  const saveSale = (p: Product, saleId: string) => {
    const val = parseFloat(editPrices[saleId]) || null;
    if (val && val >= p.price) { toast.error('Sale price must be lower than ₱' + p.price); return; }
    startT(() => {
      setProducts(prev => prev.map(x => x.id === p.id ? { ...x, compare_price: val } : x));
      setEditPrices(prev => { const n = { ...prev }; delete n[saleId]; return n; });
    });
    toast.success('Sale price saved ✅', { duration: 1200 });
    supabase.from('products').update({ compare_price: val }).eq('id', p.id);
  };

  const saveStock = (p: Product) => {
    const val = parseInt(editStock[p.sku]);
    if (isNaN(val)) return;
    startT(() => {
      setProducts(prev => prev.map(x => x.sku === p.sku ? { ...x, inventory: [{ quantity: val }] } : x));
      setEditStock(prev => { const n = { ...prev }; delete n[p.sku]; return n; });
    });
    toast.success('Stock saved ✅', { duration: 1200 });
    supabase.from('inventory').update({ quantity: val }).eq('sku', p.sku);
  };

  const toggleStatus = (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    startT(() => setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x)));
    toast.success(`${next === 'active' ? '✅' : '⏸'} ${p.sku}`, { duration: 1200 });
    supabase.from('products').update({ status: next }).eq('id', p.id);
  };

  const deleteProd = (p: Product) => {
    if (!confirm(`Delete ${p.sku} — ${p.name}?\nThis cannot be undone.`)) return;
    startT(() => setProducts(prev => prev.filter(x => x.id !== p.id)));
    toast.success(`${p.sku} deleted`, { duration: 1500 });
    supabase.from('products').delete().eq('id', p.id);
  };

  const imgUploaded = (id: string, url: string) => {
    startT(() => setProducts(prev => prev.map(p => p.id === id ? { ...p, image_url: url } : p)));
  };

  const verifyPay = (orderId: string) => {
    supabase.from('payments').update({ status: 'verified' }).eq('order_id', orderId);
    supabase.from('orders').update({ status: 'paid' }).eq('id', orderId);
    startT(() => setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o, status: 'paid', payments: o.payments.map(p => ({ ...p, status: 'verified' }))
    } : o)));
    toast.success('Payment verified ✅');
  };

  const rejectPay = (orderId: string) => {
    supabase.from('payments').update({ status: 'rejected' }).eq('order_id', orderId);
    startT(() => setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o, payments: o.payments.map(p => ({ ...p, status: 'rejected' }))
    } : o)));
    toast.success('Payment rejected');
  };

  const setOrderStatus = (orderId: string, status: string) => {
    supabase.from('orders').update({ status }).eq('id', orderId);
    startT(() => setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o)));
    toast.success(`Order: ${status}`, { duration: 1200 });
  };

  const searchQR = async () => {
    const { data } = await supabase.from('products').select('*, inventory(quantity)').eq('sku', qrSku.trim().toUpperCase()).single();
    setQrProd(data as Product || null);
    if (!data) toast.error('SKU not found');
  };

  const downloadAllQR = async () => {
    setGenZip(true);
    const t = toast.loading('Generating ZIP…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const p of products) {
        const url = `${APP_URL}/p/${p.sku}`;
        const qr  = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20&format=png`;
        zip.file(`${p.sku}.png`, await (await fetch(qr)).blob());
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'ast3r-qr-codes.zip'; a.click();
      toast.dismiss(t); toast.success(`✅ ${products.length} QR codes!`);
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setGenZip(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  if (loading) return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
      <div className="text-center">
        <p className="font-serif text-3xl tracking-[0.2em] text-white">AST3R</p>
        <p className="text-[#555] text-xs mt-3 animate-pulse tracking-widest">Loading admin…</p>
      </div>
    </div>
  );

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '◈', badge: 0 },
    { id: 'products',  label: 'Products',  icon: '◧', badge: stats.lowStock },
    { id: 'orders',    label: 'Orders',    icon: '◫', badge: stats.pending },
    { id: 'qr',        label: 'QR Codes',  icon: '⬡', badge: 0 },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F0EEE9] flex">
      {editProd && <EditModal product={editProd} onClose={() => setEditProd(null)} onSaved={loadProducts} />}
      {showCSV  && <CSVModal onClose={() => setShowCSV(false)} onDone={loadProducts} />}

      {/* ── SIDEBAR ──────────────────────────────────────────── */}
      <aside className="w-14 sm:w-52 bg-[#0A0A0A] flex flex-col flex-shrink-0 sticky top-0 h-screen z-40">

        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/5">
          <p className="font-serif text-white text-lg tracking-[0.25em] hidden sm:block">AST3R</p>
          <p className="font-serif text-white text-center sm:hidden text-lg">A</p>
          <p className="text-white/25 text-[10px] mt-0.5 tracking-widest hidden sm:block">ADMIN PANEL</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {navItems.map(n => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`w-full flex items-center gap-3 px-2 sm:px-3 py-3 transition-all group ${
                tab === n.id
                  ? 'bg-brand-orange text-white'
                  : 'text-white/40 hover:bg-white/5 hover:text-white/80'
              }`}>
              <span className="text-base flex-shrink-0 sm:text-sm font-mono">{n.icon}</span>
              <span className="text-[11px] font-medium tracking-wide hidden sm:block">{n.label}</span>
              {n.badge > 0 && (
                <span className="ml-auto hidden sm:flex w-4 h-4 rounded-full bg-red-500 text-white text-[10px] items-center justify-center font-bold">
                  {n.badge > 9 ? '9+' : n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Store link + sign out */}
        <div className="px-3 py-4 border-t border-white/5 space-y-2">
          <a href="/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-white/30 hover:text-white/70 transition-colors px-1">
            <span className="text-xs hidden sm:block tracking-wide">View Store ↗</span>
            <span className="text-xs sm:hidden">↗</span>
          </a>
          <p className="text-white/20 text-[10px] truncate hidden sm:block px-1">{user?.email}</p>
          <button onClick={signOut}
            className="flex items-center gap-2 text-white/30 hover:text-red-400 transition-colors px-1 w-full">
            <span className="text-xs">→</span>
            <span className="text-[11px] hidden sm:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto min-w-0">

        {/* Top bar */}
        <div className="bg-white border-b border-[#E8E4DF] px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-serif text-lg text-brand-black capitalize leading-tight">
                {tab === 'dashboard' ? 'Overview' : tab}
              </h1>
              <p className="text-[11px] text-[#B8B4AE] tracking-wide">ast3r.store</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'products' && (
              <>
                <button onClick={() => setShowCSV(true)}
                  className="hidden sm:flex items-center gap-1.5 border border-[#E2DED8] px-3 py-2 text-xs text-brand-gray hover:border-brand-black hover:text-brand-black transition-colors bg-white">
                  📄 CSV
                </button>
                <button onClick={() => { setTab('products'); setTimeout(() => document.getElementById('quick-add')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                  className="bg-brand-orange text-white px-4 py-2 text-xs font-medium hover:bg-orange-600 transition-colors">
                  + Product
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6">

          {/* ══ DASHBOARD ════════════════════════════════════ */}
          {tab === 'dashboard' && (
            <div className="space-y-5">
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Products', value: stats.products, sub: `${stats.lowStock} low stock`, icon: '◧', warning: stats.lowStock > 0, action: () => setTab('products') },
                  { label: 'Orders',   value: stats.orders,   sub: `${stats.pending} pending`,    icon: '◫', warning: stats.pending > 0,  action: () => setTab('orders') },
                  { label: 'Revenue',  value: formatPrice(stats.revenue), sub: 'all time', icon: '₱', warning: false, action: () => setTab('orders') },
                  { label: 'Pending',  value: stats.pending,  sub: 'need action',  icon: '⏳', warning: stats.pending > 0,  action: () => setTab('orders') },
                ].map(({ label, value, sub, icon, warning, action }) => (
                  <button key={label} onClick={action}
                    className={`bg-white border p-5 text-left hover:shadow-sm transition-all ${
                      warning ? 'border-amber-200 bg-amber-50' : 'border-[#E8E4DF]'
                    }`}>
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-[#B8B4AE] font-mono text-sm">{icon}</span>
                      {warning && <span className="w-2 h-2 bg-amber-400 rounded-full mt-1" />}
                    </div>
                    <p className="font-serif text-2xl font-medium text-brand-black">{value}</p>
                    <p className="text-[11px] text-[#B8B4AE] uppercase tracking-widest mt-1">{label}</p>
                    <p className="text-[11px] text-[#C8C4BE] mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>

              {/* Quick actions */}
              <div className="bg-white border border-[#E8E4DF] p-5">
                <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest mb-4">Quick Actions</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Add Product',  icon: '➕', fn: () => { setTab('products'); setTimeout(() => document.getElementById('quick-add')?.scrollIntoView({ behavior: 'smooth' }), 100); } },
                    { label: 'CSV Import',   icon: '📄', fn: () => setShowCSV(true) },
                    { label: 'View Orders',  icon: '📋', fn: () => setTab('orders') },
                    { label: 'QR Codes',     icon: '⬡',  fn: () => setTab('qr') },
                  ].map(({ label, icon, fn }) => (
                    <button key={label} onClick={fn}
                      className="border border-[#E8E4DF] py-4 flex flex-col items-center gap-2 hover:border-brand-orange hover:text-brand-orange transition-all text-[#B8B4AE]">
                      <span className="text-2xl">{icon}</span>
                      <span className="text-[11px] font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {orders.length > 0 && (
                <div className="bg-white border border-[#E8E4DF] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0EEE9]">
                    <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest">Recent Orders</p>
                    <button onClick={() => setTab('orders')} className="text-xs text-brand-orange hover:opacity-80">View all →</button>
                  </div>
                  <div className="divide-y divide-[#F0EEE9]">
                    {orders.slice(0, 6).map(o => (
                      <div key={o.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAF8] transition-colors">
                        <div className="flex items-center gap-3">
                          <Pill status={o.status} />
                          <div>
                            <p className="font-mono text-xs font-semibold text-brand-black">{o.order_code}</p>
                            <p className="text-[11px] text-[#B8B4AE]">{o.customer_name} · {o.contact_number}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-brand-black">{formatPrice(o.total_amount)}</p>
                          <p className="text-[11px] text-[#B8B4AE]">{formatDate(o.created_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Low stock alert */}
              {stats.lowStock > 0 && (
                <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 px-5 py-4">
                  <span className="text-xl flex-shrink-0">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">{stats.lowStock} product{stats.lowStock !== 1 ? 's' : ''} running low on stock</p>
                    <p className="text-xs text-amber-600">Update inventory before they sell out</p>
                  </div>
                  <button onClick={() => setTab('products')} className="text-xs font-medium text-amber-700 border border-amber-300 px-3 py-1.5 hover:bg-amber-100 transition-colors">
                    Review →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ══ PRODUCTS ═════════════════════════════════════ */}
          {tab === 'products' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-48 max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C8C4BE] text-xs">🔍</span>
                  <input type="text" placeholder="Search SKU, name…"
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full border border-[#E2DED8] pl-8 pr-7 py-2 text-xs focus:outline-none focus:border-brand-black bg-white" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#C8C4BE] hover:text-brand-black text-xs">✕</button>}
                </div>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="border border-[#E2DED8] px-3 py-2 text-xs focus:outline-none focus:border-brand-black bg-white text-[#888]">
                  <option value="">All Categories</option>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                <button onClick={loadProducts} className="border border-[#E2DED8] px-3 py-2 text-xs bg-white hover:border-brand-black transition-colors text-[#888]">↻</button>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setShowCSV(true)}
                    className="sm:hidden border border-[#E2DED8] px-3 py-2 text-xs bg-white hover:border-brand-black">📄</button>
                </div>
              </div>

              {(search || catFilter) && (
                <p className="text-[11px] text-[#B8B4AE]">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
                  {catFilter && ` in ${catFilter}`}
                  {search && ` for "${search}"`}
                </p>
              )}

              {/* Table */}
              <div className="bg-white border border-[#E8E4DF] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="bg-[#FAFAF8] border-b border-[#F0EEE9]">
                        {[
                          { h: '', w: 'w-12' },
                          { h: 'SKU', w: 'w-28' },
                          { h: 'Product', w: '' },
                          { h: 'Sizes', w: 'min-w-[120px]' },
                          { h: 'Price', w: 'w-28' },
                          { h: 'Sale ₱', w: 'w-28' },
                          { h: 'Stock', w: 'w-24' },
                          { h: 'Status', w: 'w-20' },
                          { h: '', w: 'w-28' },
                        ].map(({ h, w }, i) => (
                          <th key={i} className={`text-left px-3 py-3 text-[10px] font-semibold tracking-widest uppercase text-[#C8C4BE] ${w}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-16 text-[#C8C4BE] text-sm">
                          {search ? `No results for "${search}"` : 'No products yet — use Quick Add below'}
                        </td></tr>
                      ) : paginated.map(p => {
                        const stock      = p.inventory?.[0]?.quantity ?? 0;
                        const sizeTotal  = (p.size_inventory || []).reduce((s, si) => s + si.quantity, 0);
                        const dispStock  = (p.size_inventory || []).length > 0 ? sizeTotal : stock;
                        const priceEdit  = editPrices[p.id] !== undefined;
                        const saleId     = `sale-${p.id}`;
                        const saleEdit   = editPrices[saleId] !== undefined;
                        const stockEdit  = editStock[p.sku] !== undefined;

                        return (
                          <tr key={p.id}
                            className="border-b border-[#F5F3EF] hover:bg-[#FAFAF8] transition-colors group cursor-pointer"
                            onClick={() => setEditProd(p)}>

                            {/* Photo */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              <ImgCell product={p} onDone={imgUploaded} />
                            </td>

                            {/* SKU */}
                            <td className="px-3 py-2">
                              <span className="font-mono text-[11px] text-[#B8B4AE]">{p.sku}</span>
                            </td>

                            {/* Name */}
                            <td className="px-3 py-2">
                              <p className="font-medium text-brand-black text-sm leading-tight">{p.name}</p>
                              <p className="text-[11px] text-[#C8C4BE]">{p.category}</p>
                            </td>

                            {/* Sizes */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              <SizeCell product={p} />
                            </td>

                            {/* Price */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              {priceEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01"
                                    value={editPrices[p.id]}
                                    onChange={e => setEditPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') savePrice(p);
                                      if (e.key === 'Escape') setEditPrices(prev => { const n = { ...prev }; delete n[p.id]; return n; });
                                    }}
                                    className="w-20 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                  <button onMouseDown={() => savePrice(p)} className="text-[11px] bg-brand-orange text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button
                                  onMouseDown={() => setEditPrices(prev => ({ ...prev, [p.id]: String(p.price) }))}
                                  className="text-sm font-medium text-brand-black hover:text-brand-orange transition-colors"
                                  title="Click to edit price">
                                  {formatPrice(p.price)}
                                </button>
                              )}
                            </td>

                            {/* Sale price */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              {saleEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01" placeholder="₱"
                                    value={editPrices[saleId]}
                                    onChange={e => setEditPrices(prev => ({ ...prev, [saleId]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveSale(p, saleId);
                                      if (e.key === 'Escape') setEditPrices(prev => { const n = { ...prev }; delete n[saleId]; return n; });
                                    }}
                                    className="w-20 border border-red-300 px-2 py-1 text-xs focus:outline-none" />
                                  <button onMouseDown={() => saveSale(p, saleId)} className="text-[11px] bg-red-500 text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button
                                  onMouseDown={() => setEditPrices(prev => ({ ...prev, [saleId]: String(p.compare_price || '') }))}
                                  title="Click to set sale price" className="text-left">
                                  {p.compare_price && p.compare_price < p.price ? (
                                    <div>
                                      <span className="text-sm font-semibold text-red-600">{formatPrice(p.compare_price)}</span>
                                      <span className="ml-1 text-[10px] font-bold text-white bg-red-500 px-1 py-0.5">
                                        -{Math.round((1 - p.compare_price / p.price) * 100)}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-[11px] text-[#C8C4BE] hover:text-brand-orange transition-colors">+ add</span>
                                  )}
                                </button>
                              )}
                            </td>

                            {/* Stock */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              {stockEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0"
                                    value={editStock[p.sku]}
                                    onChange={e => setEditStock(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') saveStock(p);
                                      if (e.key === 'Escape') setEditStock(prev => { const n = { ...prev }; delete n[p.sku]; return n; });
                                    }}
                                    className="w-16 border border-brand-orange px-2 py-1 text-xs focus:outline-none" />
                                  <button onMouseDown={() => saveStock(p)} className="text-[11px] bg-brand-orange text-white px-2 py-1">✓</button>
                                </div>
                              ) : (
                                <button
                                  onMouseDown={() => setEditStock(prev => ({ ...prev, [p.sku]: String(dispStock) }))}
                                  className={`text-xs font-bold hover:underline ${dispStock <= 0 ? 'text-red-500' : dispStock <= 5 ? 'text-amber-500' : 'text-emerald-600'}`}
                                  title="Click to edit stock">
                                  {dispStock}u
                                </button>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-3 py-2"><Pill status={p.status} /></td>

                            {/* Actions */}
                            <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onMouseDown={() => setEditProd(p)} title="Edit"
                                  className="text-[11px] px-2 py-1.5 border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">✏️</button>
                                <a href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer" title="View page"
                                  className="text-[11px] px-2 py-1.5 border border-[#E2DED8] hover:border-brand-black transition-colors">🔗</a>
                                <button onMouseDown={() => toggleStatus(p)} title={p.status === 'active' ? 'Deactivate' : 'Activate'}
                                  className="text-[11px] px-2 py-1.5 border border-[#E2DED8] hover:border-brand-black transition-colors">
                                  {p.status === 'active' ? '⏸' : '▶'}
                                </button>
                                <button onMouseDown={() => deleteProd(p)} title="Delete"
                                  className="text-[11px] px-2 py-1.5 border border-[#E2DED8] text-[#C8C4BE] hover:border-red-400 hover:text-red-500 hover:bg-red-50 transition-colors">✕</button>
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#F0EEE9] bg-[#FAFAF8] text-[11px]">
                    <span className="text-[#C8C4BE]">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setPage(x => Math.max(0, x - 1))} disabled={page === 0}
                        className="px-3 py-1.5 border border-[#E2DED8] hover:border-brand-black disabled:opacity-30 transition-colors">←</button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => (
                        <button key={i} onClick={() => setPage(i)}
                          className={`px-3 py-1.5 border transition-colors ${i === page ? 'border-brand-black bg-brand-black text-white' : 'border-[#E2DED8] hover:border-brand-black'}`}>
                          {i + 1}
                        </button>
                      ))}
                      <button onClick={() => setPage(x => Math.min(totalPages - 1, x + 1))} disabled={page === totalPages - 1}
                        className="px-3 py-1.5 border border-[#E2DED8] hover:border-brand-black disabled:opacity-30 transition-colors">→</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Add */}
              <QuickAdd onAdded={loadProducts} />

              <p className="text-[11px] text-[#C8C4BE] text-center">
                Click row to edit · Hover photo to upload · Click price / stock to edit inline · Hover for actions
              </p>
            </div>
          )}

          {/* ══ ORDERS ═══════════════════════════════════════ */}
          {tab === 'orders' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-48 max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C8C4BE] text-xs">🔍</span>
                  <input type="text" placeholder="Order code or customer…"
                    value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                    className="w-full border border-[#E2DED8] pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-brand-black bg-white" />
                </div>
                <div className="flex gap-1">
                  {['', 'pending', 'paid', 'shipped', 'cancelled'].map(s => (
                    <button key={s} onClick={() => setOrderFilter(s)}
                      className={`px-3 py-2 text-[11px] border transition-colors ${
                        orderFilter === s ? 'border-brand-black bg-brand-black text-white' : 'border-[#E2DED8] text-[#888] bg-white hover:border-brand-black'
                      }`}>{s || 'All'}</button>
                  ))}
                </div>
                <button onClick={loadOrders} className="border border-[#E2DED8] px-3 py-2 text-xs bg-white hover:border-brand-black transition-colors text-[#888] ml-auto">↻</button>
              </div>

              <p className="text-[11px] text-[#C8C4BE]">{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</p>

              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-[#E8E4DF] text-center py-20 text-[#C8C4BE]">No orders yet</div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map(order => {
                    const pay = order.payments?.[0];
                    return (
                      <div key={order.id} className="bg-white border border-[#E8E4DF] overflow-hidden">
                        {/* Order header */}
                        <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAF8] border-b border-[#F0EEE9]">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-brand-black">{order.order_code}</span>
                            <Pill status={order.status} />
                            {pay && <Pill status={pay.status} />}
                            <span className="text-[11px] text-[#C8C4BE]">{pay?.payment_method}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-serif text-base font-medium text-brand-black">{formatPrice(order.total_amount)}</p>
                            <p className="text-[11px] text-[#C8C4BE]">{formatDate(order.created_at)}</p>
                          </div>
                        </div>

                        {/* Customer + shipping */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-[#F0EEE9]">
                          <div>
                            <p className="text-[10px] text-[#C8C4BE] uppercase tracking-widest mb-1">Customer</p>
                            <p className="text-sm font-medium text-brand-black">{order.customer_name}</p>
                            <p className="text-[11px] text-[#B8B4AE]">{order.contact_number}</p>
                            {order.email && <p className="text-[11px] text-[#B8B4AE]">{order.email}</p>}
                          </div>
                          <div>
                            <p className="text-[10px] text-[#C8C4BE] uppercase tracking-widest mb-1">Address</p>
                            <p className="text-[11px] text-brand-black leading-relaxed">{order.address_full}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#C8C4BE] uppercase tracking-widest mb-1">Shipping</p>
                            <p className="text-[11px] text-brand-black font-medium">{formatPrice(order.shipping_fee || 0)}</p>
                            <p className="text-[11px] text-[#B8B4AE]">{order.region || '—'}</p>
                            <p className="text-[11px] text-[#B8B4AE]">{order.courier || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#C8C4BE] uppercase tracking-widest mb-1">Items</p>
                            <div className="flex flex-wrap gap-1">
                              {order.order_items?.map((item, i) => (
                                <span key={i} className="text-[10px] bg-[#F0EEE9] px-1.5 py-0.5 font-mono">{item.sku} ×{item.quantity}</span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
                          {pay?.payment_proof_url && (
                            <a href={pay.payment_proof_url} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-brand-orange underline hover:opacity-80">View Payment Proof ↗</a>
                          )}
                          <div className="ml-auto flex flex-wrap gap-2">
                            <select value={order.status}
                              onChange={e => setOrderStatus(order.id, e.target.value)}
                              className="border border-[#E2DED8] px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-brand-black">
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="shipped">Shipped</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            {pay?.status === 'pending' && pay?.payment_method !== 'COD' && (
                              <>
                                <button onClick={() => verifyPay(order.id)}
                                  className="text-xs px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium">
                                  ✓ Verify Payment
                                </button>
                                <button onClick={() => rejectPay(order.id)}
                                  className="text-xs px-4 py-1.5 bg-red-600 text-white hover:bg-red-700 transition-colors font-medium">
                                  ✕ Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ QR CODES ══════════════════════════════════════ */}
          {tab === 'qr' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* Search QR */}
                <div className="bg-white border border-[#E8E4DF] p-6">
                  <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest mb-1">Search QR</p>
                  <p className="text-xs text-[#C8C4BE] mb-5">Enter a SKU to generate its QR code</p>
                  <div className="flex gap-2 mb-5">
                    <input type="text" placeholder="AST-TOP-001"
                      value={qrSku} onChange={e => setQrSku(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && searchQR()}
                      className="input-field font-mono text-sm flex-1" />
                    <button onClick={searchQR} className="btn-primary px-5 py-2 text-xs">Generate</button>
                  </div>
                  {qrProd && (
                    <div className="text-center">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`${APP_URL}/p/${qrProd.sku}`)}&bgcolor=FFFFFF&color=0A0A0A&margin=12`}
                        alt={qrProd.sku} className="mx-auto mb-3 border border-[#E8E4DF]" style={{ width: 180, height: 180 }}
                      />
                      <p className="font-medium text-sm text-brand-black">{qrProd.name}</p>
                      <p className="font-mono text-[11px] text-[#B8B4AE] mb-4">{qrProd.sku}</p>
                      <div className="flex gap-2 justify-center">
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${APP_URL}/p/${qrProd.sku}`)}&bgcolor=FFFFFF&color=000000&margin=20`}
                          download={`${qrProd.sku}.png`} target="_blank" rel="noopener noreferrer"
                          className="btn-primary py-2 px-5 text-xs">⬇ Download PNG</a>
                        <a href={`/p/${qrProd.sku}`} target="_blank" rel="noopener noreferrer"
                          className="btn-outline py-2 px-5 text-xs">🔗 View Page</a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bulk ZIP */}
                <div className="bg-white border border-[#E8E4DF] p-6">
                  <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest mb-1">Bulk Download</p>
                  <p className="text-xs text-[#C8C4BE] mb-5">All {products.length} QR codes as one ZIP · 600×600px · Print-ready</p>
                  <div className="bg-[#FAFAF8] border border-[#F0EEE9] p-4 mb-5 font-mono text-[11px] text-[#C8C4BE] space-y-1">
                    {products.slice(0, 5).map(p => <p key={p.sku}>{p.sku}.png</p>)}
                    {products.length > 5 && <p>…{products.length - 5} more</p>}
                  </div>
                  <button onClick={downloadAllQR} disabled={genZip || products.length === 0}
                    className="btn-primary w-full py-3 text-xs disabled:opacity-40">
                    {genZip ? '⏳ Generating…' : `⬇ Download All ${products.length} QR Codes (ZIP)`}
                  </button>
                </div>
              </div>

              {/* All QR grid */}
              <div>
                <p className="text-[11px] font-semibold text-[#B8B4AE] uppercase tracking-widest mb-4">All QR Codes</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                  {products.map(p => {
                    const url = `${APP_URL}/p/${p.sku}`;
                    return (
                      <div key={p.sku} className="bg-white border border-[#E8E4DF] p-4 text-center hover:border-brand-orange transition-colors">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=0A0A0A&margin=6`}
                          alt={p.sku} className="mx-auto mb-2 w-24 h-24" />
                        <p className="font-mono text-[10px] text-[#C8C4BE] truncate">{p.sku}</p>
                        <p className="text-[11px] text-brand-black truncate mb-2">{p.name}</p>
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                          download={`${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-brand-orange hover:opacity-70">⬇ PNG</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
