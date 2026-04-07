// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image         from 'next/image';
import toast         from 'react-hot-toast';
import { supabase }  from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

type Tab = 'products' | 'orders' | 'qr';

type SizeStock = { size: string; quantity: number; };

type Product = {
  id: string; sku: string; name: string; description: string;
  price: number; currency: string; image_url: string;
  category: string; status: string; sizes: string[];
  inventory: { quantity: number }[];
  size_inventory?: SizeStock[];
};

type Order = {
  id: string; order_code: string; customer_name: string;
  contact_number: string; address_full: string;
  total_amount: number; subtotal: number; shipping_fee: number;
  region: string; courier: string;
  status: string; created_at: string;
  payments: { payment_method: string; status: string; payment_proof_url?: string }[];
  order_items: { sku: string; quantity: number; price: number }[];
};

const PAGE_SIZE  = 50;
const CATEGORIES = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
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
    const t = toast.loading(`Uploading image for ${product.name}...`);

    try {
      const ext      = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${product.sku}-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(fileName, file, { cacheControl: '3600', upsert: true, contentType: file.type });

      if (upErr) throw new Error(`Storage error: ${upErr.message}`);

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const { error: dbErr } = await supabase
        .from('products').update({ image_url: publicUrl }).eq('id', product.id);

      if (dbErr) throw new Error(`DB error: ${dbErr.message}`);

      toast.dismiss(t);
      toast.success(`Image saved! ✅`);
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
    <div
      className="relative w-12 h-12 flex-shrink-0 cursor-pointer group/img"
      onClick={() => !uploading && ref.current?.click()}
      title={product.image_url ? 'Click to change photo' : 'Click to upload photo'}
    >
      <div className="w-12 h-12 bg-brand-cream border border-brand-light overflow-hidden relative">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="48px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xl">📸</div>
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-brand-orange/85 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-bold leading-tight text-center">
            {uploading ? '⏳' : product.image_url ? '🔄' : '📸'}
          </span>
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
        onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
      />
    </div>
  );
}

// ── Size Stock Cell ───────────────────────────────────────────
function SizeStockCell({ product, onUpdated }: {
  product: Product;
  onUpdated: () => void;
}) {
  const ALL_SIZES = ['XS','S','M','L','XL','XXL','Free Size'];
  const [expanded, setExpanded] = useState(false);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [localSizes, setLocalSizes] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { map[si.size] = si.quantity; });
    return map;
  });

  // Sync when product updates
  useEffect(() => {
    const map: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { map[si.size] = si.quantity; });
    setLocalSizes(map);
  }, [product.size_inventory]);

  const totalStock = Object.values(localSizes).reduce((a, b) => a + b, 0);
  const hasSizes   = Object.keys(localSizes).length > 0;

  const saveSizeQty = async (size: string, qty: number) => {
    // Optimistic update first — no UI block
    setLocalSizes(prev => ({ ...prev, [size]: qty }));
    setSaving(size);
    try {
      const { error } = await supabase
        .from('size_inventory')
        .upsert({ sku: product.sku, size, quantity: qty }, { onConflict: 'sku,size' });
      if (error) throw error;
      toast.success(`${size}: ${qty} ✅`, { duration: 1500 });
    } catch (e: any) {
      // Revert on error
      setLocalSizes(prev => ({ ...prev, [size]: qty }));
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const removeSize = async (size: string) => {
    await supabase.from('size_inventory').delete().eq('sku', product.sku).eq('size', size);
    setLocalSizes(prev => { const n = {...prev}; delete n[size]; return n; });
    toast.success(`${size} removed`);
  };

  const addSize = async (size: string) => {
    if (localSizes[size] !== undefined) return;
    await saveSizeQty(size, 0);
  };

  return (
    <div>
      {/* Summary row — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 text-left w-full group/size"
      >
        {hasSizes ? (
          <div className="flex flex-wrap gap-1">
            {Object.entries(localSizes).map(([size, qty]) => (
              <span key={size} className={`text-xs px-1.5 py-0.5 border font-medium ${
                qty <= 0 ? 'border-red-200 text-red-500 bg-red-50'
                : qty <= 3 ? 'border-orange-200 text-orange-600 bg-orange-50'
                : 'border-brand-light text-brand-black'
              }`}>
                {size}:{qty}
              </span>
            ))}
            <span className="text-xs text-brand-gray group-hover/size:text-brand-orange ml-1">{expanded ? '▲' : '▼'}</span>
          </div>
        ) : (
          <span className="text-xs text-brand-orange underline underline-offset-2 hover:opacity-80">
            + Add sizes
          </span>
        )}
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="mt-3 border border-brand-light bg-[#FAFAF8] p-3 space-y-2">
          <p className="text-xs font-medium text-brand-gray tracking-widest uppercase mb-2">
            Stock per size — {product.sku}
          </p>

          {/* Existing sizes */}
          {Object.entries(localSizes).map(([size, qty]) => (
            <div key={size} className="flex items-center gap-2">
              <span className="text-xs font-medium w-16 text-brand-black">{size}</span>
              <input
                type="number"
                min="0"
                defaultValue={qty}
                onBlur={e => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val !== qty) saveSizeQty(size, val);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (!isNaN(val)) saveSizeQty(size, val);
                  }
                }}
                className="w-20 border border-brand-light px-2 py-1 text-xs focus:outline-none focus:border-brand-orange"
              />
              <span className="text-xs text-brand-gray">units</span>
              {saving === size && <span className="text-xs text-brand-orange animate-pulse">saving…</span>}
              <button onClick={() => removeSize(size)} className="text-xs text-red-400 hover:text-red-600 ml-auto">✕</button>
            </div>
          ))}

          {/* Add size buttons */}
          <div className="pt-2 border-t border-brand-light">
            <p className="text-xs text-brand-gray mb-1.5">Add size:</p>
            <div className="flex flex-wrap gap-1">
              {ALL_SIZES.filter(s => localSizes[s] === undefined).map(s => (
                <button key={s} onClick={() => addSize(s)}
                  className="text-xs px-2 py-1 border border-dashed border-brand-light hover:border-brand-orange hover:text-brand-orange transition-colors">
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Total */}
          {hasSizes && (
            <div className="pt-2 border-t border-brand-light flex justify-between items-center">
              <span className="text-xs text-brand-gray">Total stock:</span>
              <span className={`text-xs font-bold ${totalStock <= 0 ? 'text-red-500' : 'text-green-600'}`}>
                {totalStock} units
              </span>
            </div>
          )}

          <button onClick={() => setExpanded(false)}
            className="w-full text-xs text-brand-gray hover:text-brand-black pt-1">
            Close ▲
          </button>
        </div>
      )}
    </div>
  );
}

// ── Edit Product Modal ─────────────────────────────────────────
function EditProductModal({ product, onClose, onSaved }: {
  product: Product;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ALL_SIZES  = ['XS','S','M','L','XL','XXL','Free Size'];
  const CATEGORIES = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];

  const [form, setForm] = useState({
    name:          product.name,
    description:   product.description || '',
    price:         String(product.price),
    compare_price: String(product.compare_price || ''),
    category:      product.category,
    status:        product.status,
    stock:         String(product.inventory?.[0]?.quantity ?? 0),
  });

  // Per-size stock — load from product.size_inventory
  const [sizeStock, setSizeStock] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    (product.size_inventory || []).forEach(si => { map[si.size] = si.quantity; });
    return map;
  });

  const [saving, setSaving] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgPreview, setImgPreview] = useState(product.image_url || '');
  const imgRef = useRef<HTMLInputElement>(null);
  const hasSizes = Object.keys(sizeStock).length > 0;

  const f = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const toggleSize = (size: string) => {
    setSizeStock(prev => {
      const n = { ...prev };
      if (n[size] !== undefined) delete n[size];
      else n[size] = 0;
      return n;
    });
  };

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    setImgUploading(true);
    const t = toast.loading('Uploading image…');
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fn  = `${product.sku}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('product-images').upload(fn, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fn);
      setImgPreview(publicUrl);
      await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      toast.dismiss(t); toast.success('Image saved ✅');
    } catch (e: any) { toast.dismiss(t); toast.error(e.message); }
    finally { setImgUploading(false); }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }

    setSaving(true);
    const t = toast.loading('Saving changes…');
    try {
      // Check session is still active
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.dismiss(t);
        toast.error('Session expired — please log in again');
        setSaving(false);
        return;
      }

      // Update product — use .select() to confirm row was updated
      const comparePrice = parseFloat(form.compare_price) || null;
      const { data: updatedRows, error: pe } = await supabase
        .from('products')
        .update({
          name:          form.name.trim(),
          description:   form.description.trim(),
          price,
          compare_price: comparePrice && comparePrice > price ? comparePrice : null,
          category:      form.category,
          status:        form.status,
        })
        .eq('id', product.id)
        .select();

      if (pe) throw new Error(`Product update failed: ${pe.message}`);
      if (!updatedRows || updatedRows.length === 0) {
        throw new Error('No rows updated — check your admin permissions or try logging out and back in');
      }

      // Update plain inventory (if no sizes)
      if (!hasSizes) {
        const qty = parseInt(form.stock) || 0;
        const { error: ie } = await supabase
          .from('inventory')
          .update({ quantity: qty })
          .eq('sku', product.sku);
        if (ie) console.warn('Inventory update warning:', ie.message);
      }

      // Upsert size inventory
      for (const [size, qty] of Object.entries(sizeStock)) {
        const { error: se } = await supabase
          .from('size_inventory')
          .upsert({ sku: product.sku, size, quantity: qty }, { onConflict: 'sku,size' });
        if (se) console.warn(`Size ${size} upsert warning:`, se.message);
      }

      // Remove deleted sizes
      const originalSizes = (product.size_inventory || []).map(si => si.size);
      const removedSizes  = originalSizes.filter(s => sizeStock[s] === undefined);
      for (const size of removedSizes) {
        await supabase.from('size_inventory').delete().eq('sku', product.sku).eq('size', size);
      }

      toast.dismiss(t);
      toast.success(`✅ ${product.sku} — ${form.name} saved!`);
      onSaved();
      onClose();
    } catch (e: any) {
      toast.dismiss(t);
      toast.error(e.message || 'Something went wrong — please try again');
      console.error('Save error:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-xl max-h-[95vh] flex flex-col overflow-hidden sm:rounded-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-light flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg text-brand-black">Edit Product</h2>
            <p className="font-mono text-xs text-brand-gray">{product.sku}</p>
          </div>
          <button onClick={onClose} className="text-brand-gray hover:text-brand-black text-2xl leading-none w-8 h-8 flex items-center justify-center">✕</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Image */}
          <div>
            <label className="input-label">Product Image</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 bg-brand-cream border border-brand-light overflow-hidden relative flex-shrink-0">
                {imgPreview ? (
                  <Image src={imgPreview} alt={form.name} fill className="object-cover" sizes="80px" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-brand-light text-xs text-center px-1">No image</div>
                )}
                {imgUploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <button
                  onClick={() => imgRef.current?.click()}
                  disabled={imgUploading}
                  className="w-full border-2 border-dashed border-brand-orange text-brand-orange text-sm py-3 hover:bg-brand-orange hover:text-white transition-all font-medium disabled:opacity-50"
                >
                  {imgUploading ? 'Uploading…' : imgPreview ? '🔄 Change Photo' : '📸 Upload Photo'}
                </button>
                <input ref={imgRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
                <p className="text-xs text-brand-gray mt-1.5">JPG, PNG, WEBP — max 10MB</p>
              </div>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="input-label">Product Name *</label>
            <input type="text" value={form.name} onChange={e => f('name', e.target.value)}
              className="input-field" placeholder="e.g. Linen Blazer" />
          </div>

          {/* Price + Compare Price + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Sale Price (PHP) *</label>
              <input type="number" value={form.price} min="0" step="0.01"
                onChange={e => f('price', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="input-label">Original Price (optional)</label>
              <input type="number" value={form.compare_price} min="0" step="0.01"
                placeholder="e.g. 1500"
                onChange={e => f('compare_price', e.target.value)} className="input-field" />
              <p className="text-xs text-brand-gray mt-1">Shows as <span className="line-through">₱1,500</span> → crossed out</p>
            </div>
          </div>
          {/* Discount badge preview */}
          {form.compare_price && parseFloat(form.compare_price) > parseFloat(form.price || '0') && (
            <div className="bg-red-50 border border-red-100 px-4 py-2 flex items-center gap-3">
              <span className="text-xs text-brand-gray">Preview:</span>
              <span className="text-sm font-bold text-brand-black">₱{parseFloat(form.price).toLocaleString()}</span>
              <span className="text-xs text-brand-gray line-through">₱{parseFloat(form.compare_price).toLocaleString()}</span>
              <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5">
                -{Math.round((1 - parseFloat(form.price) / parseFloat(form.compare_price)) * 100)}% OFF
              </span>
            </div>
          )}
          <div>
            <label className="input-label">Category</label>
            <select value={form.category} onChange={e => f('category', e.target.value)} className="input-field">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="input-label">Status</label>
            <div className="flex gap-3">
              {['active','inactive'].map(s => (
                <button key={s} onClick={() => f('status', s)}
                  className={`flex-1 py-2.5 text-sm font-medium border transition-all ${
                    form.status === s
                      ? s === 'active' ? 'bg-brand-black text-white border-brand-black' : 'bg-red-600 text-white border-red-600'
                      : 'border-brand-light text-brand-gray hover:border-brand-black'
                  }`}>
                  {s === 'active' ? '✅ Active' : '⏸ Inactive'}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="input-label">Description</label>
            <textarea value={form.description} onChange={e => f('description', e.target.value)}
              rows={3} placeholder="Describe this product…" className="input-field resize-none" />
          </div>

          {/* Sizes with stock */}
          <div>
            <label className="input-label">Sizes & Stock per Size</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {ALL_SIZES.map(size => (
                <button key={size} onClick={() => toggleSize(size)}
                  className={`text-xs px-3 py-2 border transition-all font-medium ${
                    sizeStock[size] !== undefined
                      ? 'border-brand-black bg-brand-black text-white'
                      : 'border-brand-light text-brand-gray hover:border-brand-black'
                  }`}>
                  {size}
                </button>
              ))}
            </div>

            {Object.keys(sizeStock).length > 0 && (
              <div className="border border-brand-light divide-y divide-brand-light">
                {Object.entries(sizeStock).map(([size, qty]) => (
                  <div key={size} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-sm font-medium text-brand-black w-16">{size}</span>
                    <input
                      type="number" min="0" value={qty}
                      onChange={e => setSizeStock(prev => ({ ...prev, [size]: parseInt(e.target.value) || 0 }))}
                      className="w-24 border border-brand-light px-3 py-1.5 text-sm focus:outline-none focus:border-brand-orange"
                    />
                    <span className="text-xs text-brand-gray">units</span>
                    <button onClick={() => toggleSize(size)}
                      className="ml-auto text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-brand-cream">
                  <span className="text-xs font-medium text-brand-gray">Total</span>
                  <span className="text-sm font-bold text-brand-black">
                    {Object.values(sizeStock).reduce((a, b) => a + b, 0)} units
                  </span>
                </div>
              </div>
            )}

            {Object.keys(sizeStock).length === 0 && (
              <div>
                <label className="input-label mt-3">Plain Stock (no sizes)</label>
                <input type="number" min="0" value={form.stock}
                  onChange={e => f('stock', e.target.value)}
                  className="input-field w-32" placeholder="0" />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-brand-light flex-shrink-0">
          <button onClick={onClose} className="btn-outline flex-1 py-3 text-sm">Cancel</button>
          <button onClick={save} disabled={saving}
            className="btn-primary flex-2 py-3 text-sm flex-[2] disabled:opacity-50">
            {saving ? 'Saving…' : '✅ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Edit Modal ────────────────────────────────────────────
function BulkEditModal({ products, onClose, onSaved }: {
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const CATEGORIES = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
  const [rows, setRows] = useState(() =>
    products.map(p => ({
      id:          p.id,
      sku:         p.sku,
      name:        p.name,
      price:       String(p.price),
      category:    p.category,
      status:      p.status,
      stock:       String(p.inventory?.[0]?.quantity ?? 0),
      description: p.description || '',
      dirty:       false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState<Set<string>>(new Set());

  const update = (id: string, field: string, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value, dirty: true } : r));
  };

  const saveAll = async () => {
    const dirty = rows.filter(r => r.dirty);
    if (!dirty.length) { toast('Nothing changed'); return; }
    setSaving(true);
    const t = toast.loading(`Saving ${dirty.length} products…`);
    let ok = 0;
    for (const r of dirty) {
      const price = parseFloat(r.price);
      const stock = parseInt(r.stock);
      if (isNaN(price)) { toast.error(`${r.sku}: invalid price`); continue; }
      const { error: pe } = await supabase.from('products').update({
        name: r.name.trim(),
        price,
        category: r.category,
        status:   r.status,
        description: r.description,
      }).eq('id', r.id);
      if (!pe && !isNaN(stock)) {
        await supabase.from('inventory').update({ quantity: stock }).eq('sku', r.sku);
      }
      if (!pe) {
        ok++;
        setSaved(prev => new Set([...prev, r.id]));
      }
    }
    toast.dismiss(t);
    toast.success(`✅ ${ok} products saved!`);
    setSaving(false);
    setRows(prev => prev.map(r => ({ ...r, dirty: false })));
    onSaved();
  };

  const dirtyCount = rows.filter(r => r.dirty).length;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col" onClick={onClose}>
      <div className="flex-1 flex flex-col bg-white m-2 sm:m-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-light bg-brand-black text-white flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-serif text-lg tracking-wide">Bulk Edit — {products.length} Products</h2>
            {dirtyCount > 0 && (
              <span className="text-xs bg-brand-orange px-2 py-1">{dirtyCount} unsaved changes</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-sm text-gray-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={saveAll}
              disabled={saving || dirtyCount === 0}
              className="bg-brand-orange text-white text-xs font-medium px-5 py-2 hover:bg-orange-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : `Save ${dirtyCount > 0 ? dirtyCount : 'All'} Changes`}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead className="bg-brand-cream sticky top-0 z-10">
              <tr>
                {['SKU','Product Name','Category','Price (PHP)','Stock','Status','Description'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray border-b border-brand-light whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id}
                  className={`border-b border-brand-light transition-colors ${
                    saved.has(row.id) ? 'bg-green-50' :
                    row.dirty ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'
                  }`}
                >
                  {/* SKU — read only */}
                  <td className="px-4 py-2 font-mono text-xs text-brand-gray whitespace-nowrap">
                    {row.sku}
                    {row.dirty && <span className="ml-1 text-brand-orange">●</span>}
                  </td>

                  {/* Name */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => update(row.id, 'name', e.target.value)}
                      className="w-full min-w-[180px] border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-white transition-colors"
                    />
                  </td>

                  {/* Category */}
                  <td className="px-2 py-1">
                    <select
                      value={row.category}
                      onChange={e => update(row.id, 'category', e.target.value)}
                      className="border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-xs bg-transparent focus:outline-none focus:bg-white"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>

                  {/* Price */}
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-brand-gray">₱</span>
                      <input
                        type="number"
                        value={row.price}
                        min="0"
                        step="0.01"
                        onChange={e => update(row.id, 'price', e.target.value)}
                        className="w-24 border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-white"
                      />
                    </div>
                  </td>

                  {/* Stock */}
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      value={row.stock}
                      min="0"
                      onChange={e => update(row.id, 'stock', e.target.value)}
                      className={`w-20 border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-sm bg-transparent focus:outline-none focus:bg-white font-medium ${
                        parseInt(row.stock) <= 0 ? 'text-red-500' :
                        parseInt(row.stock) <= 5 ? 'text-orange-500' : 'text-green-600'
                      }`}
                    />
                  </td>

                  {/* Status */}
                  <td className="px-2 py-1">
                    <select
                      value={row.status}
                      onChange={e => update(row.id, 'status', e.target.value)}
                      className={`border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-xs bg-transparent focus:outline-none focus:bg-white font-medium ${
                        row.status === 'active' ? 'text-green-600' : 'text-brand-gray'
                      }`}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>

                  {/* Description */}
                  <td className="px-2 py-1">
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => update(row.id, 'description', e.target.value)}
                      placeholder="Add description…"
                      className="w-full min-w-[200px] border border-transparent hover:border-brand-light focus:border-brand-orange px-2 py-1.5 text-xs bg-transparent focus:outline-none focus:bg-white placeholder:text-brand-light"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-brand-light bg-brand-cream flex-shrink-0 text-xs text-brand-gray">
          <span>💡 Click any cell to edit · Orange row = unsaved · Green row = saved</span>
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="bg-brand-orange text-white px-6 py-2 text-xs font-medium hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? 'Saving…' : `✅ Save ${dirtyCount} Changes`}
          </button>
        </div>
      </div>
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
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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
      .from('products')
      .select('*, inventory(quantity), size_inventory(size, quantity)')
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
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, price: val } : x));
    setEditPrices(prev => { const n = {...prev}; delete n[p.id]; return n; });
    toast.success('Price saved ✅');
    await supabase.from('products').update({ price: val }).eq('id', p.id);
  };

  const saveStock = async (p: Product) => {
    const val = parseInt(editStock[p.sku]);
    if (isNaN(val)) return;
    // Optimistic update
    setProducts(prev => prev.map(x => x.sku === p.sku ? { ...x, inventory: [{ quantity: val }] } : x));
    setEditStock(prev => { const n = {...prev}; delete n[p.sku]; return n; });
    toast.success('Stock saved ✅');
    await supabase.from('inventory').update({ quantity: val }).eq('sku', p.sku);
  };

  const toggleStatus = async (p: Product) => {
    const next = p.status === 'active' ? 'inactive' : 'active';
    // Optimistic
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, status: next } : x));
    toast.success(`${next === 'active' ? '✅' : '⏸'} ${p.sku} ${next}`, { duration: 1500 });
    await supabase.from('products').update({ status: next }).eq('id', p.id);
  };

  const deleteProduct = async (p: Product) => {
    if (!confirm(`Delete ${p.sku} — ${p.name}?\n\nThis cannot be undone.`)) return;
    // Optimistic update first (no UI block)
    setProducts(prev => prev.filter(x => x.id !== p.id));
    toast.success(`${p.sku} deleted`);
    await supabase.from('products').delete().eq('id', p.id);
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
      {showBulkEdit && <BulkEditModal products={products} onClose={() => setShowBulkEdit(false)} onSaved={loadProducts} />}
      {editingProduct && <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onSaved={loadProducts} />}

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
                <button onClick={() => setShowBulkEdit(true)}
                  className="bg-brand-black text-white px-4 py-2.5 text-xs font-medium hover:bg-brand-orange transition-colors">
                  ✏️ Edit All
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
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray w-14" title="Click image to upload photo">📸</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">SKU</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Name</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Sizes</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">Price</th>
                      <th className="text-left px-3 py-3 text-xs font-medium tracking-widest uppercase text-brand-gray">
                        <span className="text-red-500">Sale</span>
                      </th>
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
                        <tr key={p.id} className="hover:bg-[#FAFAF8] transition-colors group cursor-pointer" onClick={() => setEditingProduct(p)}>

                          {/* Image */}
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
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

                          {/* Sizes + Stock per size */}
                          <td className="px-3 py-2 min-w-[180px]">
                            <SizeStockCell product={p} onUpdated={loadProducts} />
                          </td>

                          {/* Price — original price, click to edit */}
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

                          {/* Sale Price — compare_price, separate column */}
                          <td className="px-3 py-2">
                            {(() => {
                              const saleId = `sale-${p.id}`;
                              const isEditing = editPrices[saleId] !== undefined;
                              return isEditing ? (
                                <div className="flex gap-1 items-center">
                                  <input
                                    type="number" autoFocus min="0" step="0.01" placeholder="0"
                                    value={editPrices[saleId]}
                                    onChange={e => setEditPrices(prev => ({ ...prev, [saleId]: e.target.value }))}
                                    onKeyDown={async e => {
                                      if (e.key === 'Enter') {
                                        const val = parseFloat(editPrices[saleId]) || null;
                                        setProducts(prev => prev.map(x => x.id === p.id ? { ...x, compare_price: val } : x));
                                        setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; });
                                        await supabase.from('products').update({ compare_price: val }).eq('id', p.id);
                                        toast.success('Sale price saved ✅');
                                      }
                                      if (e.key === 'Escape') setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; });
                                    }}
                                    className="w-24 border border-red-400 px-2 py-1 text-xs focus:outline-none"
                                  />
                                  <button onClick={async () => {
                                    const val = parseFloat(editPrices[saleId]) || null;
                                    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, compare_price: val } : x));
                                    setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; });
                                    await supabase.from('products').update({ compare_price: val }).eq('id', p.id);
                                    toast.success('Sale price saved ✅');
                                  }} className="text-xs bg-red-500 text-white px-2 py-1">✓</button>
                                  <button onClick={() => setEditPrices(prev => { const n={...prev}; delete n[saleId]; return n; })} className="text-xs text-brand-gray">✕</button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setEditPrices(prev => ({ ...prev, [saleId]: String(p.compare_price || '') }))}
                                  className="text-left group/sale"
                                  title="Click to set sale price"
                                >
                                  {p.compare_price && p.compare_price > p.price ? (
                                    <div>
                                      <span className="text-sm font-medium text-red-600">{formatPrice(p.compare_price)}</span>
                                      <span className="ml-1.5 text-xs font-bold text-white bg-red-500 px-1 py-0.5">
                                        -{Math.round((1 - p.price / p.compare_price) * 100)}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-brand-light group-hover/sale:text-brand-orange transition-colors">+ add</span>
                                  )}
                                </button>
                              );
                            })()}
                          </td>

                          {/* Stock — total across all sizes */}
                          <td className="px-3 py-2">
                            {(() => {
                              const sizeTotal = (p.size_inventory || []).reduce((sum, si) => sum + si.quantity, 0);
                              const displayStock = (p.size_inventory || []).length > 0 ? sizeTotal : stock;
                              const color = displayStock <= 0 ? 'text-red-500' : displayStock <= 5 ? 'text-orange-500' : 'text-green-600';
                              return (
                                <span className={`text-xs font-bold ${color}`}>
                                  {displayStock} total
                                </span>
                              );
                            })()}
                          </td>

                          {/* Status */}
                          <td className="px-3 py-2">{badge(p.status)}</td>

                          {/* Actions */}
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => setEditingProduct(p)}
                                title="Edit product"
                                className="text-xs px-2 py-1 border border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-white transition-colors">✏️</button>
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
              💡 <strong>Click row</strong> to edit · <strong>Hover image</strong> to upload photo · Click <strong>price</strong> or <strong>stock</strong> to edit inline · Hover for actions (✏️ 🔗 ⏸ 🗑)
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-brand-light text-sm">
                    <div>
                      <p className="text-xs text-brand-gray">Customer</p>
                      <p className="font-medium text-sm">{order.customer_name}</p>
                      <p className="text-xs text-brand-gray">{order.contact_number}</p>
                    </div>
                    <div className="col-span-1 sm:col-span-1">
                      <p className="text-xs text-brand-gray">Address</p>
                      <p className="text-xs leading-relaxed">{order.address_full}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-gray">Shipping</p>
                      <p className="text-xs font-medium text-brand-black">{formatPrice(order.shipping_fee || 0)}</p>
                      <p className="text-xs text-brand-gray">{order.region || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-brand-gray">Courier</p>
                      <p className="text-xs font-medium text-brand-black">{order.courier || 'TBD'}</p>
                      <p className="text-xs text-brand-gray">Subtotal: {formatPrice(order.subtotal || order.total_amount)}</p>
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
