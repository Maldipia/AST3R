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
  const router   = useRouter();
  const [, startT] = useTransition();

  // ── State ──────────────────────────────────────────────────
  const [tab,          setTab]          = useState<'dashboard'|'products'|'orders'|'qr'>('products');
  const [sideOpen,     setSideOpen]     = useState(false);
  const [user,         setUser]         = useState<any>(null);
  const [products,     setProducts]     = useState<Product[]>([]);
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [catFilter,    setCatFilter]    = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,         setPage]         = useState(0);
  const [editPrices,   setEditPrices]   = useState<Record<string,string>>({});
  const [editStock,    setEditStock]    = useState<Record<string,string>>({});
  const [editing,      setEditing]      = useState<Product|null>(null);
  const [showCSV,      setShowCSV]      = useState(false);
  const [showBulk,     setShowBulk]     = useState(false);
  const [qrSku,        setQrSku]        = useState('');
  const [qrProduct,    setQrProduct]    = useState<Product|null>(null);
  const [genZip,       setGenZip]       = useState(false);
  const [orderSearch,  setOrderSearch]  = useState('');
  const [orderStatus,  setOrderStatus]  = useState('');

  // ── Auth ───────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/admin/login'); return; }
      const { data: adm } = await supabase.from('admin_profiles').select('role').eq('id', user.id).single();
      if (!adm) { await supabase.auth.signOut(); router.push('/admin/login'); return; }
      setUser(user); loadAll();
    });
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadOrders()]);
    setLoading(false);
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, inventory(quantity), size_inventory(size,quantity)')
      .order('created_at', { ascending: false });
    if (data) setProducts(data as Product[]);
  };

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setOrders(data as Order[]);
  };

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    totalProducts: products.length,
    activeProducts: products.filter(p => p.status === 'active').length,
    outOfStock: products.filter(p => (p.size_inventory?.length ? p.size_inventory.reduce((s,x) => s+x.quantity,0) : p.inventory?.[0]?.quantity ?? 0) === 0).length,
    onSale: products.filter(p => p.compare_price && p.compare_price < p.price).length,
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => o.status === 'pending').length,
    paidOrders: orders.filter(o => o.status === 'paid').length,
    revenue: orders.filter(o => o.status !== 'cancelled').reduce((s,o) => s + Number(o.total_amount), 0),
  }), [products, orders]);

  // ── Filtered products ──────────────────────────────────────
  const filtered = useMemo(() => {
    let list = products;
    if (search)      list = list.filter(p => p.sku.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase()));
    if (catFilter)   list = list.filter(p => p.category === catFilter);
    if (statusFilter) list = list.filter(p => p.status === statusFilter);
    return list;
  }, [products, search, catFilter, statusFilter]);

  useEffect(() => setPage(0), [search, catFilter, statusFilter]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page+1) * PAGE_SIZE);

  // ── Filtered orders ────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (orderSearch) list = list.filter(o => o.order_code.toLowerCase().includes(orderSearch.toLowerCase()) || o.customer_name.toLowerCase().includes(orderSearch.toLowerCase()));
    if (orderStatus) list = list.filter(o => o.status === orderStatus);
    return list;
  }, [orders, orderSearch, orderStatus]);

  // ── Mutations (all optimistic) ─────────────────────────────
  const savePrice = (p: Product) => {
    const val = parseFloat(editPrices[p.id]); if (isNaN(val)) return;
    setProducts(prev => prev.map(x => x.id === p.id ? {...x, price: val} : x));
    setEditPrices(prev => { const n={...prev}; delete n[p.id]; return n; });
    toast.success('Price saved');
    supabase.from('products').update({ price: val }).eq('id', p.id);
  };
  const saveSalePrice = async (p: Product, saleId: string) => {
    const val = parseFloat(editPrices[saleId]) || null;
    if (val && val >= p.price) { toast.error('Sale must be lower than ₱' + p.price); return; }
    setProducts(prev => prev.map(x => x.id === p.id ? {...x, compare_price: val} : x));
    setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; });
    toast.success(val ? 'Sale price saved' : 'Sale removed');
    await supabase.from('products').update({ compare_price: val }).eq('id', p.id);
  };
  const saveStock = (p: Product) => {
    const val = parseInt(editStock[p.sku]); if (isNaN(val)) return;
    setProducts(prev => prev.map(x => x.sku === p.sku ? {...x, inventory:[{quantity:val}]} : x));
    setEditStock(prev => { const n={...prev}; delete n[p.sku]; return n; });
    toast.success('Stock saved');
    supabase.from('inventory').update({ quantity: val }).eq('sku', p.sku);
  };
  const toggleStatus = (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    setProducts(prev => prev.map(x => x.id === p.id ? {...x, status: next} : x));
    toast.success(`${p.sku} ${next}`, {duration:1500});
    supabase.from('products').update({ status: next }).eq('id', p.id);
  };
  const deleteProduct = (p: Product) => {
    if (!confirm(`Delete ${p.sku}?`)) return;
    setProducts(prev => prev.filter(x => x.id !== p.id));
    toast.success(`${p.sku} deleted`);
    supabase.from('products').delete().eq('id', p.id);
  };
  const updateOrderStatus = (id: string, status: string) => {
    setOrders(prev => prev.map(o => o.id === id ? {...o, status} : o));
    supabase.from('orders').update({ status }).eq('id', id);
    toast.success(`Order: ${status}`, {duration:1500});
  };
  const verifyPayment = async (orderId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {...o, status:'paid', payments:[{...o.payments[0], status:'verified'}]} : o));
    await supabase.from('payments').update({ status:'verified' }).eq('order_id', orderId);
    await supabase.from('orders').update({ status:'paid' }).eq('id', orderId);
    toast.success('Payment verified ✅');
  };
  const rejectPayment = async (orderId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {...o, payments:[{...o.payments[0], status:'rejected'}]} : o));
    await supabase.from('payments').update({ status:'rejected' }).eq('order_id', orderId);
    toast.success('Payment rejected');
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  // ── QR ─────────────────────────────────────────────────────
  const searchQR = async () => {
    if (!qrSku.trim()) return;
    const { data } = await supabase.from('products').select('*, inventory(quantity), size_inventory(size,quantity)').eq('sku', qrSku.trim().toUpperCase()).single();
    setQrProduct(data as Product || null);
    if (!data) toast.error('SKU not found');
  };
  const genAllQR = async () => {
    setGenZip(true);
    const t = toast.loading('Generating ZIP…');
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const p of products) {
        const url = `${APP_URL}/p/${p.sku}`;
        const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20&format=png`);
        zip.file(`${p.sku}.png`, await res.blob());
      }
      const blob = await zip.generateAsync({ type:'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ast3r-qr.zip'; a.click();
      toast.dismiss(t); toast.success(`✅ ${products.length} QR codes ready!`);
    } catch(e:any) { toast.dismiss(t); toast.error(e.message); }
    finally { setGenZip(false); }
  };

  if (loading) return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center">
      <div className="text-center space-y-3">
        <span className="font-serif text-4xl tracking-[0.2em] text-white">AST3R</span>
        <p className="text-xs text-gray-500 tracking-widest uppercase animate-pulse">Loading…</p>
      </div>
    </div>
  );

  // ── NAV ITEMS ──────────────────────────────────────────────
  const navItems = [
    { id: 'dashboard', label: 'Dashboard',  icon: '📊' },
    { id: 'products',  label: `Products (${stats.activeProducts})`, icon: '👗' },
    { id: 'orders',    label: `Orders (${stats.pendingOrders} pending)`, icon: '📋' },
    { id: 'qr',        label: 'QR Codes',    icon: '📲' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F6F6F4] flex">
      {/* Modals */}
      {showCSV  && <CSVModal  onClose={() => setShowCSV(false)}  onDone={loadProducts} />}
      {editing  && <EditModal product={editing} onClose={() => setEditing(null)} onSaved={loadProducts} />}

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      {/* Mobile overlay */}
      {sideOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSideOpen(false)} />}

      <aside className={`
        fixed top-0 left-0 h-full z-40 flex flex-col
        bg-[#0A0A0A] text-white w-64 transition-transform duration-300
        ${sideOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:flex
      `}>
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <span className="font-serif text-2xl tracking-[0.2em]">AST3R</span>
          <p className="text-[10px] text-gray-500 tracking-widest uppercase mt-1">Admin Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ id, label, icon }) => (
            <button key={id} onClick={() => { setTab(id as any); setSideOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-all rounded-none
                ${tab === id
                  ? 'bg-[#E8571A] text-white font-medium'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}>
              <span>{icon}</span>
              <span className="tracking-wide">{label}</span>
            </button>
          ))}
        </nav>

        {/* Store link */}
        <div className="px-4 py-4 border-t border-white/10 space-y-2">
          <a href={APP_URL} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-white transition-colors">
            🌐 <span>View Store</span>
          </a>
          <div className="px-3 py-2">
            <p className="text-[11px] text-gray-600 truncate">{user?.email}</p>
          </div>
          <button onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:text-red-400 transition-colors text-left">
            → Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar (mobile) */}
        <header className="lg:hidden bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between sticky top-0 z-20">
          <button onClick={() => setSideOpen(true)} className="text-gray-600 hover:text-black">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <span className="font-serif text-lg tracking-[0.15em]">AST3R</span>
          <a href={APP_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400">Store →</a>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">

          {/* ══ DASHBOARD ════════════════════════════════════ */}
          {tab === 'dashboard' && (
            <div className="space-y-6 max-w-5xl">
              <div>
                <h1 className="font-serif text-2xl text-gray-900">Good day! 👋</h1>
                <p className="text-sm text-gray-500 mt-1">Here's your store at a glance.</p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Revenue', value: formatPrice(stats.revenue), sub: 'all time', color: 'bg-[#E8571A]', text: 'text-white' },
                  { label: 'Pending Orders', value: stats.pendingOrders, sub: `of ${stats.totalOrders} total`, color: 'bg-amber-50', text: 'text-amber-800', action: () => setTab('orders') },
                  { label: 'Active Products', value: stats.activeProducts, sub: `${stats.outOfStock} out of stock`, color: 'bg-white', text: 'text-gray-900', action: () => setTab('products') },
                  { label: 'On Sale', value: stats.onSale, sub: 'products with discount', color: 'bg-red-50', text: 'text-red-800', action: () => setTab('products') },
                ].map(({ label, value, sub, color, text, action }) => (
                  <div key={label} onClick={action}
                    className={`${color} ${text} p-5 border border-black/5 ${action ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
                    <p className="text-xs font-medium uppercase tracking-widest opacity-70 mb-2">{label}</p>
                    <p className="font-serif text-3xl font-medium">{value}</p>
                    <p className="text-xs mt-1 opacity-60">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Recent orders */}
              <div className="bg-white border border-gray-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                  <h2 className="font-medium text-sm">Recent Orders</h2>
                  <button onClick={() => setTab('orders')} className="text-xs text-[#E8571A] hover:underline">View all →</button>
                </div>
                <div className="divide-y divide-gray-100">
                  {orders.slice(0,5).map(o => {
                    const pay = o.payments?.[0];
                    return (
                      <div key={o.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-gray-900">{o.order_code}</span>
                            <Pill status={o.status} />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{o.customer_name} · {o.contact_number}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-serif text-sm font-medium">{formatPrice(o.total_amount)}</p>
                          <p className="text-xs text-gray-400">{pay?.payment_method}</p>
                        </div>
                      </div>
                    );
                  })}
                  {orders.length === 0 && <p className="px-5 py-8 text-sm text-gray-400 text-center">No orders yet.</p>}
                </div>
              </div>

              {/* Low stock alert */}
              {stats.outOfStock > 0 && (
                <div className="bg-red-50 border border-red-200 p-4">
                  <p className="text-sm font-medium text-red-700 mb-2">⚠️ Out of stock ({stats.outOfStock} products)</p>
                  <div className="flex flex-wrap gap-2">
                    {products.filter(p => {
                      const qty = p.size_inventory?.length ? p.size_inventory.reduce((s,x) => s+x.quantity,0) : p.inventory?.[0]?.quantity ?? 0;
                      return qty === 0 && p.status === 'active';
                    }).slice(0,10).map(p => (
                      <span key={p.sku} onClick={() => { setTab('products'); setSearch(p.sku); }}
                        className="font-mono text-xs bg-red-100 text-red-700 px-2 py-1 cursor-pointer hover:bg-red-200">
                        {p.sku}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PRODUCTS ════════════════════════════════════ */}
          {tab === 'products' && (
            <div className="space-y-4">
              {/* Page header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-serif text-2xl text-gray-900">Products</h1>
                  <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {products.length} shown</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={loadProducts} className="px-3 py-2 text-xs border border-gray-200 bg-white hover:border-gray-400 transition-colors">↻</button>
                  <button onClick={() => setShowCSV(true)} className="px-4 py-2 text-xs border border-gray-900 bg-white hover:bg-gray-900 hover:text-white transition-colors font-medium">📄 CSV Import</button>
                  <button onClick={() => setEditing({} as any)} className="px-4 py-2 text-xs bg-[#E8571A] text-white hover:bg-orange-600 transition-colors font-medium">+ Add Product</button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-2 bg-white border border-gray-200 p-3">
                <div className="relative flex-1 min-w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                  <input type="text" placeholder="Search SKU or name…" value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:border-gray-500" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs">✕</button>}
                </div>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-500 bg-white">
                  <option value="">All Categories</option>
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-gray-500 bg-white">
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                {(search || catFilter || statusFilter) && (
                  <button onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter(''); }}
                    className="px-3 py-2 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 bg-white">Clear</button>
                )}
              </div>

              {/* Table */}
              <div className="bg-white border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400 w-16">Photo</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">SKU / Name</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">Category</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">Sizes</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">Price</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400 text-red-500">Sale</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">Stock</th>
                        <th className="text-left px-4 py-3 text-[11px] font-semibold tracking-widest uppercase text-gray-400">Status</th>
                        <th className="px-4 py-3 w-28"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginated.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                          {search || catFilter ? 'No products match your filters.' : 'No products yet.'}
                        </td></tr>
                      ) : paginated.map(p => {
                        const sizeTotal = p.size_inventory?.length ? p.size_inventory.reduce((s,x) => s+x.quantity,0) : null;
                        const stock     = sizeTotal ?? p.inventory?.[0]?.quantity ?? 0;
                        const hasSale   = p.compare_price && p.compare_price < p.price;
                        const saleId    = `sale-${p.id}`;
                        const pEdit     = editPrices[p.id] !== undefined;
                        const saleEdit  = editPrices[saleId] !== undefined;
                        const stEdit    = editStock[p.sku] !== undefined;

                        return (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors group">

                            {/* Photo */}
                            <td className="px-4 py-3">
                              <ImgCell product={p} onDone={(id,url) => setProducts(prev => prev.map(x => x.id===id ? {...x,image_url:url} : x))} />
                            </td>

                            {/* SKU + Name — click to edit */}
                            <td className="px-4 py-3 cursor-pointer" onClick={() => setEditing(p)}>
                              <p className="font-medium text-gray-900 hover:text-[#E8571A] transition-colors">{p.name}</p>
                              <p className="font-mono text-xs text-gray-400 mt-0.5">{p.sku}</p>
                            </td>

                            {/* Category */}
                            <td className="px-4 py-3 text-xs text-gray-500">{p.category}</td>

                            {/* Sizes */}
                            <td className="px-4 py-3">
                              <SizeCell product={p} />
                            </td>

                            {/* Price */}
                            <td className="px-4 py-3">
                              {pEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus value={editPrices[p.id]} min="0" step="0.01"
                                    onChange={e => setEditPrices(prev => ({...prev,[p.id]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') savePrice(p); if(e.key==='Escape') setEditPrices(prev=>{const n={...prev};delete n[p.id];return n;}); }}
                                    className="w-24 border border-[#E8571A] px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => savePrice(p)} className="text-xs bg-[#E8571A] text-white px-2">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditPrices(prev=>({...prev,[p.id]:String(p.price)}))}
                                  className={`text-sm font-medium hover:text-[#E8571A] transition-colors ${hasSale ? 'text-gray-400 line-through' : 'text-gray-900'}`}
                                  title="Click to edit">
                                  {formatPrice(p.price)}
                                </button>
                              )}
                            </td>

                            {/* Sale Price */}
                            <td className="px-4 py-3">
                              {saleEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus value={editPrices[saleId]} min="0" step="0.01" placeholder="sale ₱"
                                    onChange={e => setEditPrices(prev => ({...prev,[saleId]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') saveSalePrice(p, saleId); if(e.key==='Escape') setEditPrices(prev=>{const n={...prev};delete n[saleId];return n;}); }}
                                    className="w-24 border border-red-400 px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => saveSalePrice(p, saleId)} className="text-xs bg-red-500 text-white px-2">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditPrices(prev=>({...prev,[saleId]:String(p.compare_price||'')})) }
                                  className="text-left group/sale w-full" title="Click to set sale price">
                                  {hasSale ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium text-red-600">{formatPrice(p.compare_price!)}</span>
                                      <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5">
                                        -{Math.round((1-p.compare_price!/p.price)*100)}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-300 group-hover/sale:text-[#E8571A] transition-colors">+ add</span>
                                  )}
                                </button>
                              )}
                            </td>

                            {/* Stock */}
                            <td className="px-4 py-3">
                              {stEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus value={editStock[p.sku]} min="0"
                                    onChange={e => setEditStock(prev=>({...prev,[p.sku]:e.target.value}))}
                                    onKeyDown={e => { if(e.key==='Enter') saveStock(p); if(e.key==='Escape') setEditStock(prev=>{const n={...prev};delete n[p.sku];return n;}); }}
                                    className="w-20 border border-[#E8571A] px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={() => saveStock(p)} className="text-xs bg-[#E8571A] text-white px-2">✓</button>
                                </div>
                              ) : (
                                <button onClick={() => setEditStock(prev=>({...prev,[p.sku]:String(stock)}))}
                                  className={`text-xs font-semibold hover:underline ${stock<=0?'text-red-500':stock<=5?'text-orange-500':'text-emerald-600'}`}
                                  title="Click to edit stock">
                                  {stock} units
                                </button>
                              )}
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3"><Pill status={p.status} /></td>

                            {/* Actions */}
                            <td className="px-4 py-3">
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setEditing(p)} title="Edit"
                                  className="p-1.5 text-xs border border-gray-200 hover:border-[#E8571A] hover:text-[#E8571A] transition-colors">✏️</button>
                                <a href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer" title="View"
                                  className="p-1.5 text-xs border border-gray-200 hover:border-gray-500 transition-colors">🔗</a>
                                <button onClick={() => toggleStatus(p)} title="Toggle status"
                                  className="p-1.5 text-xs border border-gray-200 hover:border-gray-500 transition-colors">
                                  {p.status==='active' ? '⏸' : '▶'}
                                </button>
                                <button onClick={() => deleteProduct(p)} title="Delete"
                                  className="p-1.5 text-xs border border-gray-200 hover:border-red-400 hover:text-red-500 transition-colors">🗑</button>
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <span>{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setPage(p=>Math.max(0,p-1))} disabled={page===0}
                        className="px-3 py-1.5 border border-gray-200 hover:border-gray-400 disabled:opacity-30">← Prev</button>
                      {Array.from({length:totalPages},(_,i)=>(
                        <button key={i} onClick={()=>setPage(i)}
                          className={`px-3 py-1.5 border transition-colors ${i===page?'border-gray-900 bg-gray-900 text-white':'border-gray-200 hover:border-gray-400'}`}>
                          {i+1}
                        </button>
                      ))}
                      <button onClick={() => setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                        className="px-3 py-1.5 border border-gray-200 hover:border-gray-400 disabled:opacity-30">Next →</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Add */}
              <QuickAdd onAdded={loadProducts} />

              <p className="text-xs text-gray-400 text-center">
                Click <strong>name</strong> to edit · Click <strong>image</strong> to upload · Click <strong>price</strong>, <strong>sale</strong>, or <strong>stock</strong> to edit inline · Hover row for actions
              </p>
            </div>
          )}

          {/* ══ ORDERS ══════════════════════════════════════ */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-serif text-2xl text-gray-900">Orders</h1>
                  <p className="text-xs text-gray-400 mt-0.5">{filteredOrders.length} orders</p>
                </div>
                <button onClick={loadOrders} className="px-3 py-2 text-xs border border-gray-200 bg-white hover:border-gray-400">↻ Refresh</button>
              </div>

              {/* Order filters */}
              <div className="flex flex-wrap gap-2 bg-white border border-gray-200 p-3">
                <div className="relative flex-1 min-w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                  <input type="text" placeholder="Order code or customer name…" value={orderSearch}
                    onChange={e => setOrderSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 focus:outline-none focus:border-gray-500" />
                </div>
                <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)}
                  className="border border-gray-200 px-3 py-2 text-sm focus:outline-none bg-white">
                  <option value="">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="shipped">Shipped</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-gray-200 py-20 text-center text-gray-400">No orders found.</div>
              ) : (
                <div className="space-y-3">
                  {filteredOrders.map(order => {
                    const pay = order.payments?.[0];
                    return (
                      <div key={order.id} className="bg-white border border-gray-200 overflow-hidden">
                        {/* Order header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-sm font-semibold text-gray-900">{order.order_code}</span>
                            <Pill status={order.status} />
                            {pay && <Pill status={pay.status} />}
                            <span className="text-xs text-gray-400">{formatDate(order.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-serif text-lg font-medium text-gray-900">{formatPrice(order.total_amount)}</p>
                              <p className="text-[11px] text-gray-400">{pay?.payment_method}</p>
                            </div>
                          </div>
                        </div>

                        {/* Order body */}
                        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-5 border-b border-gray-100">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Customer</p>
                            <p className="text-sm font-medium text-gray-900">{order.customer_name}</p>
                            <p className="text-xs text-gray-500">{order.contact_number}</p>
                            {order.email && <p className="text-xs text-gray-400">{order.email}</p>}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Deliver To</p>
                            <p className="text-xs text-gray-700 leading-relaxed">{order.address_full}</p>
                            {order.region && <p className="text-xs text-gray-400 mt-1">{order.region} · {order.courier}</p>}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Payment</p>
                            <p className="text-xs text-gray-700">Subtotal: {formatPrice(order.subtotal || order.total_amount)}</p>
                            <p className="text-xs text-gray-700">Shipping: {formatPrice(order.shipping_fee || 0)}</p>
                            {pay?.payment_proof_url && (
                              <a href={pay.payment_proof_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-[#E8571A] underline mt-1 block">View proof →</a>
                            )}
                          </div>
                        </div>

                        {/* Items + actions */}
                        <div className="px-5 py-3 flex flex-wrap items-center gap-3">
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {order.order_items?.map((item,i) => (
                              <span key={i} className="font-mono text-[11px] bg-gray-100 text-gray-600 px-2 py-1">
                                {item.sku} ×{item.quantity}
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <select value={order.status} onChange={e => updateOrderStatus(order.id, e.target.value)}
                              className="text-xs border border-gray-200 px-3 py-1.5 bg-white focus:outline-none cursor-pointer hover:border-gray-400">
                              <option value="pending">Pending</option>
                              <option value="paid">Paid</option>
                              <option value="shipped">Shipped</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                            {pay?.status === 'pending' && pay?.payment_method !== 'COD' && (
                              <>
                                <button onClick={() => verifyPayment(order.id)}
                                  className="text-xs px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                                  ✓ Verify
                                </button>
                                <button onClick={() => rejectPayment(order.id)}
                                  className="text-xs px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 transition-colors">
                                  ✗ Reject
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

          {/* ══ QR CODES ════════════════════════════════════ */}
          {tab === 'qr' && (
            <div className="space-y-6">
              <h1 className="font-serif text-2xl text-gray-900">QR Codes</h1>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Search QR */}
                <div className="bg-white border border-gray-200 p-6">
                  <h3 className="font-medium text-sm mb-1">Generate Single QR</h3>
                  <p className="text-xs text-gray-400 mb-4">Enter a SKU to generate and download its QR code</p>
                  <div className="flex gap-2 mb-5">
                    <input type="text" placeholder="e.g. AST-TOP-001"
                      value={qrSku} onChange={e => setQrSku(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key==='Enter' && searchQR()}
                      className="flex-1 border border-gray-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-500" />
                    <button onClick={searchQR} className="px-4 py-2 bg-gray-900 text-white text-xs font-medium hover:bg-gray-700">Generate</button>
                  </div>
                  {qrProduct && (
                    <div className="text-center border-t border-gray-100 pt-5">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${APP_URL}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=10`}
                        alt={qrProduct.sku} className="mx-auto mb-3 w-40 h-40" />
                      <p className="font-medium text-sm">{qrProduct.name}</p>
                      <p className="font-mono text-xs text-gray-400 mb-4">{qrProduct.sku}</p>
                      <div className="flex gap-2 justify-center">
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${APP_URL}/p/${qrProduct.sku}`)}&bgcolor=FFFFFF&color=000000&margin=20`}
                          download={`${qrProduct.sku}.png`} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2 bg-gray-900 text-white text-xs font-medium">⬇ Download PNG</a>
                        <a href={`/p/${qrProduct.sku}`} target="_blank" rel="noopener noreferrer"
                          className="px-4 py-2 border border-gray-200 text-xs hover:border-gray-500">🔗 View Page</a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bulk ZIP */}
                <div className="bg-white border border-gray-200 p-6">
                  <h3 className="font-medium text-sm mb-1">Download All QR Codes</h3>
                  <p className="text-xs text-gray-400 mb-4">{products.length} QR codes · 600×600px · Print-ready · ZIP file</p>
                  <div className="bg-gray-50 p-3 mb-5 font-mono text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto">
                    {products.slice(0,8).map(p => <p key={p.sku}>{p.sku}.png</p>)}
                    {products.length > 8 && <p className="text-gray-300">…{products.length-8} more</p>}
                  </div>
                  <button onClick={genAllQR} disabled={genZip || products.length===0}
                    className="w-full px-4 py-3 bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 disabled:opacity-40 transition-colors">
                    {genZip ? '⏳ Generating…' : `⬇ Download All (ZIP)`}
                  </button>
                </div>
              </div>

              {/* QR Grid */}
              <div>
                <h3 className="font-medium text-sm mb-3">All Products</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {products.map(p => {
                    const url = `${APP_URL}/p/${p.sku}`;
                    return (
                      <div key={p.sku} className="bg-white border border-gray-200 p-4 text-center hover:border-gray-400 transition-colors">
                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=6`}
                          alt={p.sku} className="mx-auto mb-2 w-20 h-20" />
                        <p className="font-mono text-[10px] text-gray-400 truncate">{p.sku}</p>
                        <p className="text-xs text-gray-700 truncate mb-2">{p.name}</p>
                        <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                          download={`${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-[#E8571A] underline">⬇ PNG</a>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
