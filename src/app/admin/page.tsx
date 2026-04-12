// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image         from 'next/image';
import toast         from 'react-hot-toast';
import { supabase }  from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
type Tab = 'dashboard' | 'products' | 'orders' | 'analytics' | 'promos' | 'reviews' | 'qr' | 'settings';

type Product = {
  id: string; sku: string; name: string; description: string;
  price: number; compare_price: number | null; currency: string;
  image_url: string; category: string; status: string; sizes: string[];
  inventory: { quantity: number }[];
  size_inventory?: { size: string; quantity: number }[];
};

type Order = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; address_full: string; email: string;
  total_amount: number; subtotal: number; shipping_fee: number;
  region: string; courier: string; status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

const CATS  = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
const SIZES = ['XS','S','M','L','XL','XXL','Free Size'];
const APP   = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';
const PAGE  = 50;

// ── Status Badge ───────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-50 text-amber-700 border border-amber-200',
  paid:     'bg-emerald-50 text-emerald-700 border border-emerald-200',
  shipped:  'bg-blue-50 text-blue-700 border border-blue-200',
  cancelled:'bg-red-50 text-red-700 border border-red-200',
  verified: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border border-red-200',
  active:   'bg-gray-900 text-white',
  inactive: 'bg-gray-100 text-gray-500',
};
function Badge({ s }: { s: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-sm ${STATUS_STYLES[s] || STATUS_STYLES.pending}`}>{s}</span>;
}

// ── Image Cell ─────────────────────────────────────────────────
function ImageCell({ p, onDone }: { p: Product; onDone: (id: string, url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const [, tx] = useTransition();

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setBusy(true);
    const t = toast.loading('Uploading...');
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fn  = p.sku + '-' + Date.now() + '.' + ext;
      const { error } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', p.id);
      toast.dismiss(t); toast.success('Image saved');
      tx(() => onDone(p.id, publicUrl));
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div className="relative w-11 h-11 cursor-pointer group/img flex-shrink-0"
      onClick={() => !busy && ref.current?.click()} title="Click to upload">
      <div className="w-11 h-11 bg-gray-100 border border-gray-200 overflow-hidden rounded-sm">
        {p.image_url
          ? <Image src={p.image_url} alt="" fill className="object-cover" sizes="44px" />
          : <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">+</div>
        }
        <div className="absolute inset-0 bg-orange-500/80 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center rounded-sm">
          <span className="text-white text-xs font-bold">{busy ? '...' : 'upload'}</span>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
    </div>
  );
}

// ── Size Cell ───────────────────────────────────────────────────
function SizeCell({ p, onSaved }: { p: Product; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (p.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    return m;
  });
  const [, tx] = useTransition();

  useEffect(() => {
    const m: Record<string, number> = {};
    (p.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    setLocal(m);
  }, [p.size_inventory]);

  const total = Object.values(local).reduce((a, b) => a + b, 0);

  const save = async (size: string, qty: number) => {
    tx(() => setLocal(prev => ({ ...prev, [size]: qty })));
    await supabase.from('size_inventory').upsert({ sku: p.sku, size, quantity: qty }, { onConflict: 'sku,size' });
    toast.success(size + ': ' + qty, { duration: 1000 });
  };

  const remove = async (size: string) => {
    tx(() => setLocal(prev => { const n = { ...prev }; delete n[size]; return n; }));
    await supabase.from('size_inventory').delete().eq('sku', p.sku).eq('size', size);
  };

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="text-left w-full group/sz">
        {Object.keys(local).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(local).map(([s, q]) => (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 border rounded-sm font-medium ${q <= 0 ? 'border-red-200 text-red-500 bg-red-50' : q <= 3 ? 'border-orange-200 text-orange-600' : 'border-gray-200 text-gray-600'}`}>{s}:{q}</span>
            ))}
            <span className="text-[10px] text-gray-400 group-hover/sz:text-orange-500">{open ? '▲' : '▼'}</span>
          </div>
        ) : (
          <span className="text-xs text-orange-500 underline underline-offset-2">+ sizes</span>
        )}
      </button>
      {open && (
        <div className="mt-2 border border-gray-200 bg-white p-3 space-y-2 shadow-lg rounded-sm z-10 relative">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{p.sku}</p>
          {Object.entries(local).map(([size, qty]) => (
            <div key={size} className="flex items-center gap-2">
              <span className="text-xs font-medium w-12">{size}</span>
              <input type="number" min="0" defaultValue={qty}
                onBlur={e => { const v = parseInt(e.target.value); if (!isNaN(v) && v !== qty) save(size, v); }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseInt((e.target as HTMLInputElement).value); if (!isNaN(v)) save(size, v); (e.target as HTMLInputElement).blur(); }}}
                className="w-16 border border-gray-200 rounded-sm px-2 py-1 text-xs focus:outline-none focus:border-orange-400" />
              <button onClick={() => remove(size)} className="text-xs text-red-400 hover:text-red-600 ml-auto">x</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
            {SIZES.filter(s => local[s] === undefined).map(s => (
              <button key={s} onClick={() => save(s, 0)}
                className="text-[10px] px-1.5 py-0.5 border border-dashed border-gray-300 hover:border-orange-400 hover:text-orange-500 rounded-sm transition-colors">+{s}</button>
            ))}
          </div>
          {Object.keys(local).length > 0 && (
            <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
              <span className="text-gray-400">Total</span>
              <span className={`font-bold ${total <= 0 ? 'text-red-500' : 'text-green-600'}`}>{total} units</span>
            </div>
          )}
          <button onClick={() => setOpen(false)} className="w-full text-[10px] text-gray-400 hover:text-gray-600 pt-1">Close</button>
        </div>
      )}
    </div>
  );
}

// ── Edit Modal ─────────────────────────────────────────────────
function EditModal({ p, onClose, onSaved }: { p: Product; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: p.name, description: p.description || '',
    price: String(p.price), compare_price: String(p.compare_price || ''),
    category: p.category, status: p.status,
    stock: String(p.inventory?.[0]?.quantity ?? 0),
  });
  const [sizes, setSizes] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (p.size_inventory || []).forEach(si => { m[si.size] = si.quantity; });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [imgUp, setImgUp]   = useState(false);
  const [imgPrev, setImgPrev] = useState(p.image_url || '');
  const imgRef = useRef<HTMLInputElement>(null);
  const hasSizes = Object.keys(sizes).length > 0;
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const origPrice = parseFloat(form.price);
  const salePrice = parseFloat(form.compare_price);
  const validDisc = !isNaN(salePrice) && !isNaN(origPrice) && salePrice > 0 && salePrice < origPrice;
  const discPct   = validDisc ? Math.round((1 - salePrice / origPrice) * 100) : 0;

  const uploadImg = async (file: File) => {
    setImgUp(true);
    const t = toast.loading('Uploading...');
    try {
      const fn = p.sku + '-' + Date.now() + '.' + (file.name.split('.').pop() || 'jpg');
      const { error } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      setImgPrev(publicUrl);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', p.id);
      toast.dismiss(t); toast.success('Image saved');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setImgUp(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price)) { toast.error('Invalid price'); return; }
    setSaving(true);
    const t = toast.loading('Saving...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expired');
      const saleP = parseFloat(form.compare_price) || null;
      const { data, error } = await supabase.from('products').update({
        name: form.name.trim(), description: form.description.trim(),
        price, compare_price: saleP && saleP < price ? saleP : null,
        category: form.category, status: form.status,
      }).eq('id', p.id).select();
      if (error) throw error;
      if (!data?.length) throw new Error('No rows updated - check admin permissions');
      if (!hasSizes) {
        const qty = parseInt(form.stock) || 0;
        await supabase.from('inventory').update({ quantity: qty }).eq('sku', p.sku);
      }
      for (const [sz, qty] of Object.entries(sizes)) {
        await supabase.from('size_inventory').upsert({ sku: p.sku, size: sz, quantity: qty }, { onConflict: 'sku,size' });
      }
      const removed = (p.size_inventory || []).map(si => si.size).filter(s => sizes[s] === undefined);
      for (const sz of removed) await supabase.from('size_inventory').delete().eq('sku', p.sku).eq('size', sz);
      toast.dismiss(t); toast.success(p.sku + ' saved!');
      onSaved(); onClose();
    } catch (e: any) { toast.dismiss(t); toast.error(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg max-h-[95vh] flex flex-col rounded-t-2xl sm:rounded-none shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Edit Product</h2>
            <p className="text-xs text-gray-400 font-mono">{p.sku}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">x</button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Image */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 bg-gray-100 border border-gray-200 overflow-hidden relative flex-shrink-0 rounded-sm">
              {imgPrev ? <Image src={imgPrev} alt="" fill className="object-cover" sizes="80px" /> : <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-2xl">+</div>}
              {imgUp && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /></div>}
            </div>
            <div className="flex-1">
              <button onClick={() => imgRef.current?.click()} disabled={imgUp}
                className="w-full border-2 border-dashed border-orange-300 text-orange-500 py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors rounded-sm disabled:opacity-50">
                {imgUp ? 'Uploading...' : imgPrev ? 'Change Photo' : 'Upload Photo'}
              </button>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImg(f); }} />
              <p className="text-xs text-gray-400 mt-1.5">JPG, PNG, WEBP - max 10MB</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Product Name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all" />
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Original Price (PHP) *</label>
              <input type="number" value={form.price} min="0" step="0.01"
                onChange={e => set('price', e.target.value)}
                className="w-full border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-medium text-red-400 mb-1.5 uppercase tracking-wider">Sale Price (optional)</label>
              <input type="number" value={form.compare_price} min="0" step="0.01" placeholder="lower = on sale"
                onChange={e => set('compare_price', e.target.value)}
                className="w-full border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-red-400 transition-all" />
            </div>
          </div>

          {validDisc && (
            <div className="bg-red-50 border border-red-100 rounded-sm px-4 py-2.5 flex items-center gap-3">
              <span className="text-xs text-gray-400 line-through">PHP {origPrice.toLocaleString()}</span>
              <span className="text-sm font-bold text-red-600">PHP {salePrice.toLocaleString()}</span>
              <span className="ml-auto text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-sm">-{discPct}% OFF</span>
            </div>
          )}

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Category</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all bg-white">
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Status</label>
              <div className="grid grid-cols-2 gap-1.5">
                {['active','inactive'].map(s => (
                  <button key={s} onClick={() => set('status', s)}
                    className={`py-2.5 text-xs font-medium rounded-sm border transition-all ${
                      form.status === s
                        ? (s === 'active' ? 'bg-gray-900 text-white border-gray-900' : 'bg-red-500 text-white border-red-500')
                        : 'border-gray-200 text-gray-500 hover:border-gray-400'
                    }`}>
                    {s === 'active' ? 'Active' : 'Off'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} className="w-full border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all resize-none" />
          </div>

          {/* Sizes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">Sizes & Stock per Size</label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {SIZES.map(sz => (
                <button key={sz} onClick={() => setSizes(prev => { const n = {...prev}; if (n[sz] !== undefined) delete n[sz]; else n[sz] = 0; return n; })}
                  className={`text-xs px-3 py-1.5 rounded-sm border transition-all font-medium ${sizes[sz] !== undefined ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                  {sz}
                </button>
              ))}
            </div>
            {Object.keys(sizes).length > 0 ? (
              <div className="border border-gray-200 rounded-sm divide-y divide-gray-100">
                {Object.entries(sizes).map(([sz, qty]) => (
                  <div key={sz} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-sm font-medium w-16">{sz}</span>
                    <input type="number" min="0" value={qty}
                      onChange={e => setSizes(prev => ({ ...prev, [sz]: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-gray-200 rounded-sm px-3 py-1.5 text-sm focus:outline-none focus:border-orange-400" />
                    <span className="text-xs text-gray-400">units</span>
                    <button onClick={() => setSizes(prev => { const n = {...prev}; delete n[sz]; return n; })}
                      className="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-gray-50 text-xs">
                  <span className="text-gray-400">Total stock</span>
                  <span className="font-bold">{Object.values(sizes).reduce((a,b)=>a+b,0)} units</span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 mt-2 uppercase tracking-wider">Plain Stock (no sizes)</label>
                <input type="number" min="0" value={form.stock} onChange={e => set('stock', e.target.value)}
                  className="w-32 border border-gray-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-gray-900 transition-all" />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl sm:rounded-none">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-3 text-sm font-medium hover:bg-gray-100 transition-colors rounded-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-[2] bg-gray-900 text-white py-3 text-sm font-medium hover:bg-gray-700 transition-colors rounded-sm disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Modal ───────────────────────────────────────────────────
function CSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [fname, setFname] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  const parse = (text: string) => {
    const lines = text.trim().split(/\r?\n/);
    const hdrs  = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
    const parsed = lines.slice(1).filter(l => l.trim()).map((line, idx) => {
      const vals: string[] = [];
      let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ; } else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; } else { cur += ch; }
      }
      vals.push(cur.trim());
      const row: any = { _ln: idx + 2 };
      hdrs.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g,'').trim(); });
      return row;
    }).filter(r => r.sku || r.name);
    setRows(parsed);
    toast.success('Parsed ' + parsed.length + ' rows');
  };

  const importAll = async () => {
    setBusy(true);
    const t = toast.loading('Importing ' + rows.length + '...');
    let ok = 0, fail = 0;
    for (const r of rows) {
      try {
        const sku = (r.sku || '').trim().toUpperCase();
        if (!sku) { fail++; continue; }
        const szes = r.sizes ? r.sizes.split('/').map((s: string) => s.trim()).filter(Boolean) : [];
        const { error } = await supabase.from('products').upsert({
          sku, name: r.name, description: r.description || '',
          price: parseFloat(r.price) || 0, currency: 'PHP',
          image_url: r.image_url || '', category: r.category || 'Tops',
          status: 'active', sizes: szes,
        }, { onConflict: 'sku' });
        if (error) { fail++; continue; }
        await supabase.from('inventory').upsert({ sku, quantity: parseInt(r.stock) || 0 }, { onConflict: 'sku' });
        await supabase.from('qr_links').upsert({ sku, qr_url: APP + '/p/' + sku, scans: 0 }, { onConflict: 'sku' });
        ok++;
      } catch { fail++; }
    }
    toast.dismiss(t);
    toast.success(ok + ' imported' + (fail ? ', ' + fail + ' failed' : ''));
    setBusy(false); onDone(); onClose();
  };

  const dlTemplate = () => {
    const csv = 'sku,name,description,price,stock,image_url,category,sizes\nAST-TOP-007,Sample Product,Description,1500,20,,Tops,S/M/L/XL';
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'ast3r-template.csv'; a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl max-h-[80vh] flex flex-col rounded-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">CSV Import</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">x</button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1">Required columns:</p>
              <p className="font-mono text-xs text-gray-500">sku, name, price, stock, category, sizes (S/M/L)</p>
            </div>
            <button onClick={dlTemplate} className="text-xs border border-gray-300 px-3 py-2 rounded-sm hover:border-gray-500 transition-colors whitespace-nowrap">Download Template</button>
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center cursor-pointer hover:border-orange-400 transition-colors"
            onClick={() => ref.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f){setFname(f.name);const r=new FileReader();r.onload=ev=>parse(ev.target?.result as string);r.readAsText(f);}}}
            onDragOver={e => e.preventDefault()}>
            <input ref={ref} type="file" accept=".csv" className="hidden"
              onChange={e => { const f=e.target.files?.[0];if(f){setFname(f.name);const r=new FileReader();r.onload=ev=>parse(ev.target?.result as string);r.readAsText(f);e.target.value='';}}} />
            {fname ? <><p className="text-2xl mb-2">CSV</p><p className="font-medium text-sm text-gray-700">{fname}</p><p className="text-gray-400 text-xs mt-1">{rows.length} rows parsed</p></> : <><p className="text-3xl mb-3 text-gray-300">+</p><p className="text-gray-500 text-sm">Click or drag CSV here</p></>}
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50"><tr>{['SKU','Name','Price','Stock','Cat','Sizes'].map(h=>(
                  <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wider">{h}</th>
                ))}</tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.slice(0,10).map((r,i)=>(
                    <tr key={i} className={!r.sku||!r.name?'bg-red-50':''}>
                      <td className="px-3 py-2 font-mono">{r.sku||<span className="text-red-500">!</span>}</td>
                      <td className="px-3 py-2">{r.name||<span className="text-red-500">!</span>}</td>
                      <td className="px-3 py-2">P{r.price}</td>
                      <td className="px-3 py-2">{r.stock||0}</td>
                      <td className="px-3 py-2">{r.category||'Tops'}</td>
                      <td className="px-3 py-2">{r.sizes||'-'}</td>
                    </tr>
                  ))}
                  {rows.length>10&&<tr><td colSpan={6} className="px-3 py-2 text-gray-400 text-center italic">...{rows.length-10} more</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 py-2.5 text-sm rounded-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={importAll} disabled={rows.length===0||busy}
            className="flex-[2] bg-gray-900 text-white py-2.5 text-sm rounded-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-50">
            {busy ? 'Importing...' : 'Import ' + rows.length + ' Products'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick Add ───────────────────────────────────────────────────
function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const init = { sku:'', name:'', price:'', stock:'0', category:'Tops', sizes: [] as string[] };
  const [form, setForm]   = useState(init);
  const [saving, setSaving] = useState(false);
  const toggle = (s: string) => setForm(f => ({ ...f, sizes: f.sizes.includes(s) ? f.sizes.filter(x=>x!==s) : [...f.sizes,s] }));
  const submit = async () => {
    if (!form.sku||!form.name||!form.price) { toast.error('SKU, Name and Price required'); return; }
    setSaving(true);
    try {
      const sku = form.sku.trim().toUpperCase();
      const { error } = await supabase.from('products').insert({ sku, name:form.name.trim(), price:parseFloat(form.price), currency:'PHP', category:form.category, status:'active', description:'', image_url:'', sizes:form.sizes });
      if (error) throw error;
      await supabase.from('inventory').insert({ sku, quantity:parseInt(form.stock)||0 });
      await supabase.from('qr_links').insert({ sku, qr_url:APP+'/p/'+sku, scans:0 });
      toast.success(sku + ' added!');
      setForm(init); onAdded();
    } catch(e:any) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Quick Add Product</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mb-3">
        {[
          { placeholder:'SKU *', value:form.sku, onChange:(v:string)=>setForm({...form,sku:v.toUpperCase()}), extra:'font-mono' },
          { placeholder:'Product Name *', value:form.name, onChange:(v:string)=>setForm({...form,name:v}), span:'col-span-2' },
          { placeholder:'Price *', value:form.price, onChange:(v:string)=>setForm({...form,price:v}), type:'number' },
        ].map((f, i) => (
          <input key={i} type={(f as any).type||'text'} placeholder={f.placeholder} value={f.value}
            onChange={e => f.onChange(e.target.value)}
            className={`border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all ${(f as any).extra||''} ${(f as any).span||''}`} />
        ))}
        <select value={form.category} onChange={e => setForm({...form,category:e.target.value})}
          className="border border-gray-200 rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-gray-900 transition-all bg-white">
          {CATS.map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs text-gray-400 whitespace-nowrap">Sizes:</span>
        <div className="flex flex-wrap gap-1">
          {SIZES.map(s=>(
            <button key={s} onClick={()=>toggle(s)}
              className={`text-xs px-2 py-1 rounded-sm border transition-all ${form.sizes.includes(s)?'border-gray-900 bg-gray-900 text-white':'border-gray-200 hover:border-gray-400'}`}>{s}</button>
          ))}
        </div>
        <input placeholder="Stock" type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}
          className="border border-gray-200 rounded-sm px-3 py-2 text-sm w-20 ml-auto focus:outline-none focus:border-gray-900" />
      </div>
      <button onClick={submit} disabled={saving}
        className="bg-orange-500 text-white text-xs font-semibold tracking-wider uppercase px-6 py-2.5 rounded-sm hover:bg-orange-600 transition-colors disabled:opacity-50">
        {saving ? 'Adding...' : '+ Add Product'}
      </button>
    </div>
  );
}

// ── Promo Form ──────────────────────────────────────────────────
function PromoForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ code:'', type:'percent', value:'', min_order:'0', max_uses:'' });
  const [busy, setBusy] = useState(false);
  const f = (k:string,v:string) => setForm(p=>({...p,[k]:v}));
  const save = async () => {
    if (!form.code||!form.value) { toast.error('Code and value required'); return; }
    setBusy(true);
    const { error } = await supabase.from('promo_codes').insert({ code:form.code.trim().toUpperCase(), type:form.type, value:parseFloat(form.value), min_order:parseFloat(form.min_order)||0, max_uses:form.max_uses?parseInt(form.max_uses):null, active:true });
    if (error) { toast.error(error.message.includes('duplicate')?'Code already exists':error.message); setBusy(false); return; }
    toast.success('Promo created!'); setForm({ code:'', type:'percent', value:'', min_order:'0', max_uses:'' }); setBusy(false); onSaved();
  };
  return (
    <div className="space-y-3">
      <input value={form.code} onChange={e=>f('code',e.target.value.toUpperCase())} placeholder="CODE *" className="w-full border border-gray-200 rounded-sm px-3 py-2 text-sm font-mono focus:outline-none focus:border-gray-900" />
      <div className="grid grid-cols-2 gap-2">
        <select value={form.type} onChange={e=>f('type',e.target.value)} className="border border-gray-200 rounded-sm px-3 py-2 text-xs bg-white focus:outline-none">
          <option value="percent">% Discount</option><option value="fixed">Fixed Off</option><option value="free_shipping">Free Shipping</option>
        </select>
        <input type="number" value={form.value} onChange={e=>f('value',e.target.value)} placeholder={form.type==='percent'?'10':'100'} disabled={form.type==='free_shipping'} className="border border-gray-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-gray-900 disabled:opacity-50" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" value={form.min_order} onChange={e=>f('min_order',e.target.value)} placeholder="Min order (P)" className="border border-gray-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-gray-900" />
        <input type="number" value={form.max_uses} onChange={e=>f('max_uses',e.target.value)} placeholder="Max uses" className="border border-gray-200 rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-gray-900" />
      </div>
      <button onClick={save} disabled={busy} className="w-full bg-gray-900 text-white py-2.5 text-xs font-semibold rounded-sm hover:bg-gray-700 transition-colors disabled:opacity-50">
        {busy ? 'Creating...' : '+ Create Promo Code'}
      </button>
    </div>
  );
}

// ── Main Admin ─────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [, tx] = useTransition();
  const [tab,        setTab]        = useState<Tab>('dashboard');
  const [user,       setUser]       = useState<any>(null);
  const [products,   setProducts]   = useState<Product[]>([]);
  const [orders,     setOrders]     = useState<Order[]>([]);
  const [promos,     setPromos]     = useState<any[]>([]);
  const [reviews,    setReviews]    = useState<any[]>([]);
  const [analytics,  setAnalytics]  = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const [editing,    setEditing]    = useState<Product | null>(null);
  const [showCSV,    setShowCSV]    = useState(false);
  const [qrSku,      setQrSku]      = useState('');
  const [qrProd,     setQrProd]     = useState<Product | null>(null);
  const [genZip,     setGenZip]     = useState(false);
  const [editPrices, setEditPrices] = useState<Record<string,string>>({});
  const [editStocks, setEditStocks] = useState<Record<string,string>>({});
  const [stats, setStats] = useState({ orders:0, revenue:0, pending:0, products:0, lowStock:0 });
  const [sideOpen, setSideOpen] = useState(false);

  const NAV = [
    { id:'dashboard', label:'Dashboard',  icon:'🏠' },
    { id:'products',  label:'Products',   icon:'👗' },
    { id:'orders',    label:'Orders',     icon:'📦' },
    { id:'analytics', label:'Analytics',  icon:'📊' },
    { id:'promos',    label:'Promos',     icon:'🏷️' },
    { id:'reviews',   label:'Reviews',    icon:'⭐' },
    { id:'qr',        label:'QR Codes',   icon:'📲' },
    { id:'settings',  label:'Settings',   icon:'⚙️' },
  ] as const;

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
    await Promise.all([loadProducts(), loadOrders(), loadPromos(), loadReviews(), loadAnalytics()]);
    setLoading(false);
  }, []);

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('*, inventory(quantity), size_inventory(size,quantity)').order('created_at', { ascending: false });
    if (data) {
      setProducts(data as Product[]);
      const low = data.filter(p => (p.inventory?.[0]?.quantity??0) <= 3 && (p.inventory?.[0]?.quantity??0) > 0).length;
      setStats(s => ({ ...s, products: data.length, lowStock: low }));
    }
  };

  const loadOrders = async () => {
    const { data } = await supabase.from('orders').select('*, payments(payment_method,status,payment_proof_url), order_items(sku,quantity,price)').order('created_at', { ascending: false }).limit(200);
    if (data) {
      setOrders(data as Order[]);
      setStats(s => ({ ...s, orders:data.length, revenue:data.reduce((sum,o)=>sum+Number(o.total_amount),0), pending:data.filter(o=>o.status==='pending').length }));
    }
  };

  const loadPromos = async () => {
    const { data } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
    if (data) setPromos(data);
  };

  const loadReviews = async () => {
    const { data } = await supabase.from('reviews').select('*, products(name)').order('created_at', { ascending: false });
    if (data) setReviews(data);
  };

  const loadAnalytics = async () => {
    const { data: ords } = await supabase.from('orders').select('total_amount, status, created_at, region');
    if (!ords) return;
    const revenue  = ords.reduce((s,o) => s+Number(o.total_amount), 0);
    const byStatus = ords.reduce((m:any,o) => { m[o.status]=(m[o.status]||0)+1; return m; }, {});
    const byRegion = ords.reduce((m:any,o) => { if(o.region)m[o.region]=(m[o.region]||0)+1; return m; }, {});
    const byDay: Record<string,number> = {};
    ords.forEach(o => { const d=o.created_at?.slice(0,10)||''; if(d) byDay[d]=(byDay[d]||0)+Number(o.total_amount); });
    setAnalytics({ revenue, byStatus, byRegion, byDay, total:ords.length });
  };

  // Filtered & paginated products
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);
  const totalPages = Math.ceil(filtered.length / PAGE);
  const paginated  = filtered.slice(page * PAGE, (page+1) * PAGE);
  useEffect(() => setPage(0), [search]);

  // Mutations
  const savePrice = async (p: Product) => {
    const val = parseFloat(editPrices[p.id]);
    if (isNaN(val)) return;
    tx(() => { setProducts(prev => prev.map(x => x.id===p.id?{...x,price:val}:x)); setEditPrices(prev=>{const n={...prev};delete n[p.id];return n;}); });
    toast.success('Price saved', {duration:1200});
    await supabase.from('products').update({ price:val }).eq('id', p.id);
  };

  const saveSale = async (p: Product, saleId: string) => {
    const val = parseFloat(editPrices[saleId]) || null;
    if (val && val >= p.price) { toast.error('Sale must be lower than price'); return; }
    tx(() => { setProducts(prev => prev.map(x => x.id===p.id?{...x,compare_price:val}:x)); setEditPrices(prev=>{const n={...prev};delete n[saleId];return n;}); });
    toast.success('Sale price saved', {duration:1200});
    await supabase.from('products').update({ compare_price:val }).eq('id', p.id);
  };

  const saveStock = async (p: Product) => {
    const val = parseInt(editStocks[p.sku]);
    if (isNaN(val)) return;
    tx(() => { setProducts(prev => prev.map(x => x.sku===p.sku?{...x,inventory:[{quantity:val}]}:x)); setEditStocks(prev=>{const n={...prev};delete n[p.sku];return n;}); });
    toast.success('Stock saved', {duration:1200});
    await supabase.from('inventory').update({ quantity:val }).eq('sku', p.sku);
  };

  const toggleStatus = async (p: Product) => {
    const next = p.status==='active'?'inactive':'active';
    tx(() => setProducts(prev => prev.map(x => x.id===p.id?{...x,status:next}:x)));
    toast.success(p.sku + ': ' + next, {duration:1200});
    await supabase.from('products').update({ status:next }).eq('id', p.id);
  };

  const deleteProd = async (p: Product) => {
    if (!confirm('Delete ' + p.sku + ' - ' + p.name + '?\n\nThis cannot be undone.')) return;
    tx(() => setProducts(prev => prev.filter(x => x.id!==p.id)));
    toast.success(p.sku + ' deleted', {duration:1500});
    supabase.from('products').delete().eq('id', p.id);
  };

  const imgUploaded = (id: string, url: string) => tx(() => setProducts(prev => prev.map(p => p.id===id?{...p,image_url:url}:p)));

  const updateOrder = async (id: string, status: string) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    if (['paid','shipped','cancelled'].includes(status)) {
      const ord = orders.find(o => o.id===id);
      if (ord?.email) fetch('/api/send-email', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ type:'status_update', order_code:ord.order_code, status }) }).catch(()=>{});
    }
    toast.success('Order: ' + status, {duration:1500}); loadOrders();
  };

  const verifyPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status:'verified' }).eq('order_id', orderId);
    await supabase.from('orders').update({ status:'paid' }).eq('id', orderId);
    toast.success('Payment verified!'); loadOrders();
  };

  const rejectPayment = async (orderId: string) => {
    await supabase.from('payments').update({ status:'rejected' }).eq('order_id', orderId);
    toast.success('Payment rejected'); loadOrders();
  };

  const searchQR = async () => {
    const { data } = await supabase.from('products').select('*, inventory(quantity)').eq('sku', qrSku.trim().toUpperCase()).single();
    setQrProd(data as Product || null);
    if (!data) toast.error('SKU not found');
  };

  const bulkQR = async () => {
    setGenZip(true);
    const t = toast.loading('Generating ZIP...');
    try {
      const JSZip = (await import('jszip')).default;
      const zip   = new JSZip();
      for (const p of products) {
        const url   = APP + '/p/' + p.sku;
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' + encodeURIComponent(url) + '&bgcolor=FFFFFF&color=000000&margin=20&format=png';
        const blob  = await (await fetch(qrUrl)).blob();
        zip.file(p.sku + '.png', blob);
      }
      const content = await zip.generateAsync({ type:'blob' });
      const a = document.createElement('a'); a.href=URL.createObjectURL(content); a.download='ast3r-qr-codes.zip'; a.click();
      toast.dismiss(t); toast.success(products.length + ' QR codes downloaded!');
    } catch(e:any) { toast.dismiss(t); toast.error(e.message); }
    finally { setGenZip(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); router.push('/admin/login'); };

  const navClick = (id: Tab) => { setTab(id); setSideOpen(false); };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-white font-light text-3xl tracking-[0.3em]">AST3R</p>
        <p className="text-gray-500 text-xs mt-3 animate-pulse">Loading admin...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Modals */}
      {editing   && <EditModal p={editing} onClose={() => setEditing(null)} onSaved={loadProducts} />}
      {showCSV   && <CSVModal onClose={() => setShowCSV(false)} onDone={loadProducts} />}

      {/* ── SIDEBAR (desktop) ──────────────────────────────────── */}
      <aside className="hidden lg:flex w-60 bg-gray-950 flex-col flex-shrink-0 fixed top-0 left-0 h-screen z-40">
        {/* Logo */}
        <div className="px-6 py-7 border-b border-white/10">
          <p className="text-white text-xl font-light tracking-[0.3em]">AST3R</p>
          <p className="text-gray-500 text-xs mt-0.5 tracking-wider">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV.map(n => (
            <button key={n.id} onClick={() => navClick(n.id as Tab)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-lg transition-all ${
                tab === n.id
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}>
              <span className="text-base">{n.icon}</span>
              <span>{n.label}</span>
              {n.id === 'orders' && stats.pending > 0 && (
                <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{stats.pending}</span>
              )}
              {n.id === 'reviews' && reviews.filter(r=>!r.verified).length > 0 && (
                <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0">{reviews.filter(r=>!r.verified).length}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-5 py-5 border-t border-white/10">
          <p className="text-gray-400 text-xs truncate mb-2">{user?.email}</p>
          <button onClick={signOut} className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-2">
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── MOBILE OVERLAY ────────────────────────────────────── */}
      {sideOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSideOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-gray-950 flex flex-col">
            <div className="px-6 py-7 border-b border-white/10 flex items-center justify-between">
              <div>
                <p className="text-white text-xl font-light tracking-[0.3em]">AST3R</p>
                <p className="text-gray-500 text-xs mt-0.5">Admin Panel</p>
              </div>
              <button onClick={() => setSideOpen(false)} className="text-gray-400 hover:text-white">x</button>
            </div>
            <nav className="flex-1 py-4 px-3 space-y-0.5">
              {NAV.map(n => (
                <button key={n.id} onClick={() => navClick(n.id as Tab)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left rounded-lg transition-all ${tab===n.id?'bg-white/10 text-white font-medium':'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`}>
                  <span className="text-base">{n.icon}</span><span>{n.label}</span>
                  {n.id==='orders'&&stats.pending>0&&<span className="ml-auto bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">{stats.pending}</span>}
                </button>
              ))}
            </nav>
            <div className="px-5 py-5 border-t border-white/10">
              <button onClick={signOut} className="text-xs text-gray-400 hover:text-white">Sign Out</button>
            </div>
          </aside>
        </div>
      )}

      {/* ── MAIN ──────────────────────────────────────────────── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen">

        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center gap-4 sticky top-0 z-30">
          <button className="lg:hidden text-gray-500 hover:text-gray-900 p-1" onClick={() => setSideOpen(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-gray-900 capitalize">{tab}</h1>
            <p className="text-xs text-gray-400 hidden sm:block">ast3r.store admin</p>
          </div>
          <a href="/" target="_blank" rel="noopener noreferrer"
            className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-sm hover:border-gray-400 transition-colors hidden sm:block">
            View Store
          </a>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">

          {/* ══ DASHBOARD ════════════════════════════════════════ */}
          {tab === 'dashboard' && (
            <div className="space-y-6 max-w-6xl">
              {/* Greeting */}
              <div>
                <h2 className="text-2xl font-semibold text-gray-900">Good day! 👋</h2>
                <p className="text-gray-500 text-sm mt-0.5">Here's your store at a glance</p>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label:'Products', value:stats.products, sub: stats.lowStock > 0 ? stats.lowStock + ' low stock' : 'all stocked', icon:'👗', color:'bg-white', action:()=>setTab('products') },
                  { label:'Orders',   value:stats.orders,   sub: stats.pending + ' pending', icon:'📦', color: stats.pending > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white', action:()=>setTab('orders') },
                  { label:'Revenue',  value:formatPrice(stats.revenue), sub:'total earned', icon:'💰', color:'bg-white', action:()=>setTab('analytics') },
                  { label:'Pending',  value:stats.pending,  sub:'need attention', icon:'⏳', color: stats.pending > 0 ? 'bg-red-50 border-red-200' : 'bg-white', action:()=>setTab('orders') },
                ].map(({ label, value, sub, icon, color, action }) => (
                  <button key={label} onClick={action}
                    className={`${color} border border-gray-200 rounded-xl p-5 text-left hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0`}>
                    <p className="text-2xl mb-3">{icon}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>

              {/* Low stock alert */}
              {stats.lowStock > 0 && (
                <button onClick={() => setTab('products')}
                  className="w-full bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors">
                  <span className="text-xl">⚠️</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800">{stats.lowStock} products almost sold out</p>
                    <p className="text-xs text-amber-600">Tap to update stock</p>
                  </div>
                  <span className="text-amber-400">→</span>
                </button>
              )}

              {/* Quick actions */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label:'Add Product',   sub:'Quick entry form', icon:'➕', color:'bg-orange-500 text-white', action:()=>setTab('products') },
                    { label:'Import CSV',    sub:'Bulk add products', icon:'📄', color:'bg-white border border-gray-200', action:()=>setShowCSV(true) },
                    { label:'View Orders',   sub:'Manage fulfillment', icon:'📦', color:'bg-white border border-gray-200', action:()=>setTab('orders') },
                    { label:'Promo Codes',   sub:'Manage discounts', icon:'🏷️', color:'bg-white border border-gray-200', action:()=>setTab('promos') },
                    { label:'QR Codes',      sub:'Download & print', icon:'📲', color:'bg-white border border-gray-200', action:()=>setTab('qr') },
                    { label:'Analytics',     sub:'Revenue & insights', icon:'📊', color:'bg-white border border-gray-200', action:()=>setTab('analytics') },
                  ].map(({ label, sub, icon, color, action }) => (
                    <button key={label} onClick={action}
                      className={`${color} rounded-xl p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5 active:translate-y-0`}>
                      <p className="text-xl mb-2">{icon}</p>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs opacity-60">{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent orders */}
              {orders.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Recent Orders</h3>
                    <button onClick={() => setTab('orders')} className="text-xs text-orange-500 font-medium">View all</button>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {orders.slice(0,5).map(o => (
                      <div key={o.id} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-sm font-mono font-medium text-gray-900">{o.order_code}</p>
                          <p className="text-xs text-gray-400">{o.customer_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-700">{formatPrice(o.total_amount)}</span>
                          <Badge s={o.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PRODUCTS ══════════════════════════════════════════ */}
          {tab === 'products' && (
            <div className="space-y-4 max-w-screen-xl">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-48 max-w-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                  <input type="text" placeholder="Search SKU, name, category..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white shadow-sm" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">x</button>}
                </div>
                <div className="flex gap-2 ml-auto">
                  <button onClick={loadProducts} className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white hover:bg-gray-50 transition-colors shadow-sm">Refresh</button>
                  <button onClick={() => setShowCSV(true)} className="border border-gray-800 rounded-lg px-4 py-2.5 text-sm bg-white hover:bg-gray-900 hover:text-white transition-colors shadow-sm">CSV Import</button>
                </div>
              </div>

              {search && <p className="text-xs text-gray-400">{filtered.length} result{filtered.length!==1?'s':''} for "{search}"</p>}

              {/* Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {['IMG','SKU','Product','Sizes','Price','Sale','Stock','Status',''].map((h,i) => (
                          <th key={i} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {paginated.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                          {search ? 'No results for "' + search + '"' : 'No products yet'}
                        </td></tr>
                      ) : paginated.map(p => {
                        const stock    = p.inventory?.[0]?.quantity ?? 0;
                        const sizeTot  = (p.size_inventory||[]).reduce((s,si)=>s+si.quantity,0);
                        const dispStock = (p.size_inventory||[]).length > 0 ? sizeTot : stock;
                        const priceEdit = editPrices[p.id] !== undefined;
                        const saleId    = 'sale-' + p.id;
                        const saleEdit  = editPrices[saleId] !== undefined;
                        const stockEdit = editStocks[p.sku] !== undefined;

                        return (
                          <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group cursor-pointer" onClick={() => setEditing(p)}>
                            <td className="px-3 py-3" onClick={e=>e.stopPropagation()}><ImageCell p={p} onDone={imgUploaded} /></td>
                            <td className="px-3 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">{p.sku}</td>
                            <td className="px-3 py-3">
                              <p className="font-medium text-gray-900">{p.name}</p>
                              <p className="text-xs text-gray-400">{p.category}</p>
                            </td>
                            <td className="px-3 py-3 min-w-[140px]" onClick={e=>e.stopPropagation()}>
                              <SizeCell p={p} onSaved={loadProducts} />
                            </td>
                            <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                              {priceEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01" value={editPrices[p.id]}
                                    onChange={e=>setEditPrices(prev=>({...prev,[p.id]:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==='Enter')savePrice(p);if(e.key==='Escape')setEditPrices(prev=>{const n={...prev};delete n[p.id];return n;});}}
                                    className="w-24 border border-orange-400 rounded-sm px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={()=>savePrice(p)} className="text-xs bg-orange-500 text-white px-2 py-1 rounded-sm">ok</button>
                                </div>
                              ) : (
                                <button onClick={()=>setEditPrices(prev=>({...prev,[p.id]:String(p.price)}))}
                                  className="text-sm font-medium text-gray-900 hover:text-orange-500 transition-colors" title="Click to edit">
                                  {formatPrice(p.price)}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                              {saleEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" step="0.01" placeholder="sale" value={editPrices[saleId]}
                                    onChange={e=>setEditPrices(prev=>({...prev,[saleId]:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==='Enter')saveSale(p,saleId);if(e.key==='Escape')setEditPrices(prev=>{const n={...prev};delete n[saleId];return n;});}}
                                    className="w-24 border border-red-300 rounded-sm px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={()=>saveSale(p,saleId)} className="text-xs bg-red-500 text-white px-2 py-1 rounded-sm">ok</button>
                                </div>
                              ) : (
                                <button onClick={()=>setEditPrices(prev=>({...prev,[saleId]:String(p.compare_price||'')}))} title="Click to set sale price">
                                  {p.compare_price && p.compare_price < p.price ? (
                                    <div>
                                      <span className="text-sm font-medium text-red-500">{formatPrice(p.compare_price)}</span>
                                      <span className="ml-1 text-[10px] font-bold text-white bg-red-500 px-1 py-0.5 rounded-sm">-{Math.round((1-p.compare_price/p.price)*100)}%</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-300 hover:text-orange-400 transition-colors">+ sale</span>
                                  )}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                              {stockEdit ? (
                                <div className="flex gap-1">
                                  <input type="number" autoFocus min="0" value={editStocks[p.sku]}
                                    onChange={e=>setEditStocks(prev=>({...prev,[p.sku]:e.target.value}))}
                                    onKeyDown={e=>{if(e.key==='Enter')saveStock(p);if(e.key==='Escape')setEditStocks(prev=>{const n={...prev};delete n[p.sku];return n;});}}
                                    className="w-20 border border-orange-400 rounded-sm px-2 py-1 text-xs focus:outline-none" />
                                  <button onClick={()=>saveStock(p)} className="text-xs bg-orange-500 text-white px-2 py-1 rounded-sm">ok</button>
                                </div>
                              ) : (
                                <button onClick={()=>setEditStocks(prev=>({...prev,[p.sku]:String(stock)}))}
                                  className={`text-xs font-bold hover:underline ${dispStock<=0?'text-red-500':dispStock<=5?'text-orange-500':'text-emerald-600'}`}>
                                  {dispStock} units
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-3"><Badge s={p.status} /></td>
                            <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={()=>setEditing(p)} title="Edit" className="text-xs px-2 py-1.5 border border-orange-200 text-orange-500 hover:bg-orange-50 rounded-sm">edit</button>
                                <a href={'/p/'+p.sku} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1.5 border border-gray-200 hover:border-gray-400 rounded-sm">view</a>
                                <button onClick={()=>toggleStatus(p)} className="text-xs px-2 py-1.5 border border-gray-200 hover:border-gray-400 rounded-sm">{p.status==='active'?'off':'on'}</button>
                                <button onClick={()=>deleteProd(p)} className="text-xs px-2 py-1.5 border border-red-100 text-red-400 hover:border-red-300 rounded-sm">del</button>
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
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs">
                    <span className="text-gray-400">{page*PAGE+1}-{Math.min((page+1)*PAGE,filtered.length)} of {filtered.length}</span>
                    <div className="flex gap-1">
                      <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 border border-gray-200 rounded-sm hover:border-gray-400 disabled:opacity-40">Prev</button>
                      {Array.from({length:Math.min(totalPages,5)},(_,i)=>(
                        <button key={i} onClick={()=>setPage(i)} className={`px-3 py-1.5 border rounded-sm transition-colors ${i===page?'border-gray-900 bg-gray-900 text-white':'border-gray-200 hover:border-gray-400'}`}>{i+1}</button>
                      ))}
                      <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1} className="px-3 py-1.5 border border-gray-200 rounded-sm hover:border-gray-400 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                )}
              </div>

              <QuickAdd onAdded={loadProducts} />
              <p className="text-xs text-gray-400 text-center">Tip: Click row to edit • Hover image to upload • Click price/stock to edit inline • Hover row for actions</p>
            </div>
          )}

          {/* ══ ORDERS ════════════════════════════════════════════ */}
          {tab === 'orders' && (
            <div className="space-y-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">{orders.length} total - {stats.pending} pending</p>
                <button onClick={loadOrders} className="border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white hover:bg-gray-50 shadow-sm">Refresh</button>
              </div>
              {orders.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
                  <p className="text-4xl mb-4">📭</p><p className="text-gray-400">No orders yet</p>
                </div>
              ) : orders.map(order => {
                const pay = order.payments?.[0];
                return (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="flex flex-wrap justify-between gap-3 px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="font-mono font-bold text-gray-900">{order.order_code}</p>
                        <Badge s={order.status} />
                        {pay && <Badge s={pay.status} />}
                        {pay?.payment_method && <span className="text-xs text-gray-400">{pay.payment_method}</span>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{formatPrice(order.total_amount)}</p>
                        <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4 border-b border-gray-50 text-sm">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Customer</p>
                        <p className="font-medium text-gray-900">{order.customer_name}</p>
                        <p className="text-xs text-gray-400">{order.contact_number}</p>
                      </div>
                      <div className="sm:col-span-1">
                        <p className="text-xs text-gray-400 mb-1">Address</p>
                        <p className="text-xs text-gray-600 leading-relaxed">{order.address_full}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Shipping</p>
                        <p className="text-xs font-medium">{formatPrice(order.shipping_fee||0)}</p>
                        <p className="text-xs text-gray-400">{order.region||'-'} - {order.courier||'TBD'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Breakdown</p>
                        <p className="text-xs">Items: {formatPrice(order.subtotal||order.total_amount)}</p>
                        <p className="text-xs">Ship: {formatPrice(order.shipping_fee||0)}</p>
                        <p className="text-xs font-bold text-gray-900">Total: {formatPrice(order.total_amount)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {order.order_items?.map((item,i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-sm font-mono">{item.sku} x{item.quantity}</span>
                        ))}
                      </div>
                      {pay?.payment_proof_url && (
                        <a href={pay.payment_proof_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-orange-500 underline font-medium">View Proof</a>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <select defaultValue={order.status} onChange={e=>updateOrder(order.id,e.target.value)}
                          className="text-xs border border-gray-200 rounded-sm px-3 py-1.5 bg-white focus:outline-none">
                          <option value="pending">Pending</option><option value="paid">Paid</option>
                          <option value="shipped">Shipped</option><option value="cancelled">Cancelled</option>
                        </select>
                        {pay?.status==='pending'&&pay?.payment_method!=='COD'&&<>
                          <button onClick={()=>verifyPayment(order.id)} className="text-xs px-4 py-1.5 bg-emerald-500 text-white rounded-sm hover:bg-emerald-600">Verify</button>
                          <button onClick={()=>rejectPayment(order.id)} className="text-xs px-4 py-1.5 bg-red-500 text-white rounded-sm hover:bg-red-600">Reject</button>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══ ANALYTICS ═════════════════════════════════════════ */}
          {tab === 'analytics' && analytics && (
            <div className="space-y-6 max-w-5xl">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label:'Revenue',   value:formatPrice(analytics.revenue) },
                  { label:'Orders',    value:analytics.total },
                  { label:'Avg Order', value:analytics.total>0?formatPrice(analytics.revenue/analytics.total):'P0' },
                  { label:'Paid',      value:analytics.byStatus?.paid||0 },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mt-1">{label}</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-5">Orders by Status</h3>
                  <div className="space-y-3">
                    {Object.entries(analytics.byStatus).map(([status, count]: any) => (
                      <div key={status} className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20 capitalize">{status}</span>
                        <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width:(count/analytics.total*100)+'%' }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-6">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-5">Orders by Region</h3>
                  {Object.keys(analytics.byRegion).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(analytics.byRegion).sort(([,a]:any,[,b]:any)=>b-a).map(([region, count]: any) => (
                        <div key={region} className="flex items-center gap-3">
                          <span className="text-xs text-gray-500 flex-1 truncate">{region}</span>
                          <div className="w-24 bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div className="h-full bg-gray-800 rounded-full" style={{ width:(count/analytics.total*100)+'%' }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-6">{count}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No regional data yet</p>}
                </div>
              </div>
              {Object.keys(analytics.byDay).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-700 mb-5">Revenue by Day (last 14 days)</h3>
                  <div className="overflow-x-auto">
                    <div className="flex items-end gap-2 h-36 min-w-max">
                      {Object.entries(analytics.byDay).sort(([a],[b])=>a.localeCompare(b)).slice(-14).map(([day, amount]: any) => {
                        const max = Math.max(...Object.values(analytics.byDay) as number[]);
                        const pct = max > 0 ? (amount/max)*100 : 0;
                        return (
                          <div key={day} className="flex flex-col items-center gap-1 flex-shrink-0">
                            <span className="text-[10px] text-gray-400">{formatPrice(amount)}</span>
                            <div className="w-9 bg-orange-500 rounded-t-sm transition-all" style={{ height:Math.max(pct,4)+'%' }} title={day} />
                            <span className="text-[10px] text-gray-300">{day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PROMOS ════════════════════════════════════════════ */}
          {tab === 'promos' && (
            <div className="space-y-6 max-w-4xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {promos.map(promo => (
                  <div key={promo.id} className={`bg-white border rounded-xl p-5 shadow-sm ${promo.active?'border-gray-200':'border-gray-100 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-lg font-bold text-gray-900">{promo.code}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-sm ${promo.active?'bg-emerald-50 text-emerald-700':'bg-gray-100 text-gray-400'}`}>{promo.active?'Active':'Off'}</span>
                    </div>
                    <p className="text-sm font-semibold text-orange-500 mb-1">{promo.type==='percent'?promo.value+'% OFF':promo.type==='fixed'?'P'+promo.value+' OFF':'FREE SHIPPING'}</p>
                    {promo.min_order>0&&<p className="text-xs text-gray-400">Min: P{promo.min_order}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">Used: {promo.uses||0}{promo.max_uses?' / '+promo.max_uses:''}</p>
                    <div className="flex gap-2 mt-4">
                      <button onClick={async()=>{await supabase.from('promo_codes').update({active:!promo.active}).eq('id',promo.id);loadPromos();toast.success(promo.active?'Deactivated':'Activated');}}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-sm hover:border-gray-400 transition-colors">{promo.active?'Deactivate':'Activate'}</button>
                      <button onClick={async()=>{if(!confirm('Delete '+promo.code+'?'))return;await supabase.from('promo_codes').delete().eq('id',promo.id);loadPromos();toast.success('Deleted');}}
                        className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-sm hover:border-red-300">Delete</button>
                    </div>
                  </div>
                ))}
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">New Promo Code</p>
                  <PromoForm onSaved={loadPromos} />
                </div>
              </div>
            </div>
          )}

          {/* ══ REVIEWS ═══════════════════════════════════════════ */}
          {tab === 'reviews' && (
            <div className="space-y-4 max-w-4xl">
              <p className="text-sm text-gray-500">{reviews.length} total - {reviews.filter(r=>!r.verified).length} pending</p>
              {reviews.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
                  <p className="text-4xl mb-4">⭐</p><p className="text-gray-400">No reviews yet</p>
                </div>
              ) : reviews.map(r => (
                <div key={r.id} className={`bg-white border rounded-xl p-5 shadow-sm ${r.verified?'border-gray-200':'border-amber-200 bg-amber-50/30'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span className="text-orange-400">{'*'.repeat(r.rating)+'_'.repeat(5-r.rating)}</span>
                        <span className="font-semibold text-sm text-gray-900">{r.customer_name}</span>
                        <span className="text-xs text-gray-400">{r.products?.name||r.sku}</span>
                        {!r.verified&&<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-sm font-medium">Pending</span>}
                        {r.verified&&<span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-sm">Verified</span>}
                      </div>
                      <p className="text-sm text-gray-700">"{r.comment}"</p>
                      <p className="text-xs text-gray-400 mt-2">{formatDate(r.created_at)}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!r.verified&&<button onClick={async()=>{await supabase.from('reviews').update({verified:true}).eq('id',r.id);loadReviews();toast.success('Approved!');}} className="text-xs px-3 py-1.5 bg-emerald-500 text-white rounded-sm hover:bg-emerald-600">Approve</button>}
                      <button onClick={async()=>{if(!confirm('Delete this review?'))return;await supabase.from('reviews').delete().eq('id',r.id);loadReviews();toast.success('Deleted');}} className="text-xs px-3 py-1.5 border border-red-100 text-red-400 rounded-sm hover:border-red-300">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ══ QR ════════════════════════════════════════════════ */}
          {tab === 'qr' && (
            <div className="space-y-6 max-w-5xl">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-1">Search QR</h3>
                  <p className="text-xs text-gray-400 mb-5">Enter SKU to generate a QR code</p>
                  <div className="flex gap-2 mb-5">
                    <input type="text" placeholder="e.g. AST-TOP-001" value={qrSku}
                      onChange={e=>setQrSku(e.target.value.toUpperCase())}
                      onKeyDown={e=>e.key==='Enter'&&searchQR()}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-gray-400" />
                    <button onClick={searchQR} className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors">Generate</button>
                  </div>
                  {qrProd && (
                    <div className="text-center">
                      <img src={'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data='+encodeURIComponent(APP+'/p/'+qrProd.sku)+'&bgcolor=FFFFFF&color=000000&margin=15'}
                        alt={qrProd.sku} className="mx-auto mb-3 w-44 h-44 border border-gray-200 rounded-lg" />
                      <p className="font-semibold text-sm text-gray-900">{qrProd.name}</p>
                      <p className="font-mono text-xs text-gray-400 mb-4">{qrProd.sku}</p>
                      <div className="flex gap-2 justify-center">
                        <a href={'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data='+encodeURIComponent(APP+'/p/'+qrProd.sku)+'&bgcolor=FFFFFF&color=000000&margin=20'}
                          download={qrProd.sku+'.png'} target="_blank" rel="noopener noreferrer"
                          className="bg-gray-900 text-white text-xs px-4 py-2 rounded-sm hover:bg-gray-700 transition-colors">Download PNG</a>
                        <a href={'/p/'+qrProd.sku} target="_blank" rel="noopener noreferrer"
                          className="border border-gray-200 text-gray-600 text-xs px-4 py-2 rounded-sm hover:border-gray-400 transition-colors">View Page</a>
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <h3 className="font-semibold text-gray-900 mb-1">Bulk ZIP Download</h3>
                  <p className="text-xs text-gray-400 mb-5">All {products.length} QR codes - 600x600px - print-ready</p>
                  <div className="bg-gray-50 rounded-lg p-3 mb-5 font-mono text-xs text-gray-400 space-y-1">
                    {products.slice(0,4).map(p=><p key={p.sku}>{p.sku}.png</p>)}
                    {products.length>4&&<p className="text-gray-300">...{products.length-4} more</p>}
                  </div>
                  <button onClick={bulkQR} disabled={genZip||products.length===0}
                    className="w-full bg-gray-900 text-white py-3 text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50">
                    {genZip ? 'Generating...' : 'Download All ' + products.length + ' QR Codes (ZIP)'}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {products.map(p => (
                  <div key={p.sku} className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
                    <img src={'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='+encodeURIComponent(APP+'/p/'+p.sku)+'&bgcolor=FAFAF8&color=0A0A0A&margin=8'}
                      alt={p.sku} className="mx-auto mb-2 w-24 h-24 rounded-sm" />
                    <p className="font-mono text-xs text-gray-400 truncate">{p.sku}</p>
                    <p className="text-xs text-gray-700 truncate mb-2">{p.name}</p>
                    <a href={'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data='+encodeURIComponent(APP+'/p/'+p.sku)+'&bgcolor=FFFFFF&color=000000&margin=20'}
                      download={p.sku+'.png'} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-orange-500 underline hover:opacity-80">Download</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ SETTINGS ══════════════════════════════════════════ */}
          {tab === 'settings' && (
            <div className="max-w-lg space-y-5">
              {[
                { title:'Store Info', rows:[
                  { label:'Store URL', value:'ast3r.store' }, { label:'Admin Email', value:'admin@ast3r.store' },
                  { label:'Contact', value:'inquiry@ast3r.store' }, { label:'Phone', value:'0966 960 6060' },
                  { label:'Instagram', value:'@ast3r.ph' }, { label:'Location', value:'Tagaytay City, PH' },
                ]},
                { title:'Shipping Rates', rows:[
                  { label:'Metro Manila (NCR)', value:'P100 - 2-3 days' }, { label:'Luzon', value:'P150 - 3-5 days' },
                  { label:'Visayas', value:'P200 - 5-7 days' }, { label:'Mindanao', value:'P250 - 5-7 days' },
                  { label:'International', value:'P800 - 7-21 days' },
                ]},
                { title:'System', rows:[
                  { label:'Products', value:String(stats.products) }, { label:'Total Orders', value:String(stats.orders) },
                  { label:'Revenue', value:formatPrice(stats.revenue) }, { label:'Framework', value:'Next.js 14' },
                  { label:'Database', value:'Supabase (PostgreSQL)' }, { label:'Hosting', value:'Vercel' },
                ]},
              ].map(({ title, rows }) => (
                <div key={title} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {rows.map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center px-5 py-3">
                        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
                        <span className="text-xs font-semibold text-gray-700">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={signOut} className="w-full border border-red-200 text-red-500 py-3 text-sm rounded-xl hover:bg-red-50 transition-colors">Sign Out</button>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
