// src/app/admin/page.tsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import { useRouter }  from 'next/navigation';
import Image          from 'next/image';
import toast          from 'react-hot-toast';
import { supabase }   from '@/lib/supabase';
import { formatPrice, formatDate } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────
type Tab = 'home' | 'products' | 'orders' | 'qr';
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

const CATS     = ['Tops','Bottoms','Dresses','Outerwear','Accessories','Sets','Kids'];
const SIZES    = ['XS','S','M','L','XL','XXL','Free Size'];
const APP_URL  = process.env.NEXT_PUBLIC_APP_URL || 'https://www.ast3r.store';
const PAGE_SIZE = 30;

// ── Helpers ────────────────────────────────────────────────────
function StatusPill({ s }: { s: string }) {
  const map: Record<string,string> = {
    pending:'bg-amber-100 text-amber-800', paid:'bg-green-100 text-green-800',
    shipped:'bg-blue-100 text-blue-800', cancelled:'bg-red-100 text-red-700',
    verified:'bg-green-100 text-green-800', rejected:'bg-red-100 text-red-700',
    active:'bg-brand-black text-white', inactive:'bg-gray-100 text-gray-500',
  };
  return <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${map[s]||map.pending}`}>{s}</span>;
}

// ── Edit Product Sheet ─────────────────────────────────────────
function EditSheet({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product.name, description: product.description||'',
    price: String(product.price), compare_price: String(product.compare_price||''),
    category: product.category, status: product.status,
    stock: String(product.inventory?.[0]?.quantity??0),
  });
  const [sizeStock, setSS] = useState<Record<string,number>>(() => {
    const m:Record<string,number>={};
    (product.size_inventory||[]).forEach(si=>{m[si.size]=si.quantity;});
    return m;
  });
  const [saving,setSaving]=useState(false);
  const [imgUp,setImgUp]=useState(false);
  const [imgPrev,setImgPrev]=useState(product.image_url||'');
  const imgRef=useRef<HTMLInputElement>(null);
  const f=(k:string,v:string)=>setForm(p=>({...p,[k]:v}));
  const hasSizes = Object.keys(sizeStock).length>0;
  const orig=parseFloat(form.price), sale=parseFloat(form.compare_price);
  const disc = !isNaN(sale)&&sale>0&&sale<orig ? Math.round((1-sale/orig)*100) : 0;

  const uploadImg=async(file:File)=>{
    if(!file.type.startsWith('image/')) return;
    setImgUp(true);
    const t=toast.loading('Uploading…');
    try {
      const fn=`${product.sku}-${Date.now()}.${file.name.split('.').pop()}`;
      const {error}=await supabase.storage.from('product-images').upload(fn,file,{upsert:true});
      if(error)throw error;
      const {data:{publicUrl}}=supabase.storage.from('product-images').getPublicUrl(fn);
      setImgPrev(publicUrl);
      await supabase.from('products').update({image_url:publicUrl}).eq('id',product.id);
      toast.dismiss(t); toast.success('Photo saved ✅');
    } catch(e:any){toast.dismiss(t);toast.error(e.message);}
    finally{setImgUp(false);}
  };

  const save=async()=>{
    if(!form.name.trim()){toast.error('Name required');return;}
    const price=parseFloat(form.price);
    if(isNaN(price)){toast.error('Invalid price');return;}
    setSaving(true);
    const t=toast.loading('Saving…');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error('Session expired — please log in again');
      const saleP=parseFloat(form.compare_price)||null;
      const {data,error}=await supabase.from('products').update({
        name:form.name.trim(), description:form.description.trim(),
        price, compare_price: saleP&&saleP<price?saleP:null,
        category:form.category, status:form.status,
      }).eq('id',product.id).select();
      if(error)throw error;
      if(!data?.length)throw new Error('Not saved — try logging out and back in');
      if(!hasSizes){
        await supabase.from('inventory').update({quantity:parseInt(form.stock)||0}).eq('sku',product.sku);
      }
      for(const[sz,qty]of Object.entries(sizeStock)){
        await supabase.from('size_inventory').upsert({sku:product.sku,size:sz,quantity:qty},{onConflict:'sku,size'});
      }
      const removed=(product.size_inventory||[]).map(si=>si.size).filter(s=>sizeStock[s]===undefined);
      for(const sz of removed)await supabase.from('size_inventory').delete().eq('sku',product.sku).eq('size',sz);
      toast.dismiss(t); toast.success(`${product.name} saved ✅`);
      onSaved(); onClose();
    } catch(e:any){toast.dismiss(t);toast.error(e.message);}
    finally{setSaving(false);}
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/50" />
      {/* Sheet slides up */}
      <div className="bg-white w-full max-h-[92vh] flex flex-col rounded-t-2xl overflow-hidden shadow-2xl"
        onClick={e=>e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">{product.name}</h2>
            <p className="text-xs text-gray-400 font-mono">{product.sku}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Photo */}
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 relative flex-shrink-0">
              {imgPrev ? <Image src={imgPrev} alt="" fill className="object-cover" sizes="80px" />
                : <div className="absolute inset-0 flex items-center justify-center text-3xl">📷</div>}
              {imgUp && <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
              </div>}
            </div>
            <div className="flex-1">
              <button onClick={()=>imgRef.current?.click()} disabled={imgUp}
                className="w-full bg-orange-50 border-2 border-dashed border-brand-orange text-brand-orange font-semibold py-3 rounded-xl text-sm hover:bg-brand-orange hover:text-white transition-all disabled:opacity-50">
                {imgUp?'Uploading…':imgPrev?'🔄 Change Photo':'📸 Upload Photo'}
              </button>
              <input ref={imgRef} type="file" accept="image/*" className="hidden"
                onChange={e=>{const f=e.target.files?.[0];if(f)uploadImg(f);}}/>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Product Name *</label>
            <input value={form.name} onChange={e=>f('name',e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-orange-100" />
          </div>

          {/* Price row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Original Price ₱</label>
              <input type="number" value={form.price} min="0" step="0.01" onChange={e=>f('price',e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-orange-100" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-red-400 uppercase tracking-wider mb-1.5">Sale Price ₱</label>
              <input type="number" value={form.compare_price} min="0" step="0.01" placeholder="optional"
                onChange={e=>f('compare_price',e.target.value)}
                className="w-full border border-red-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-50" />
            </div>
          </div>

          {/* Discount preview */}
          {disc>0 && (
            <div className="bg-red-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-sm text-gray-400 line-through">₱{orig.toLocaleString()}</span>
              <span className="text-base font-bold text-red-600">₱{sale.toLocaleString()}</span>
              <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">-{disc}% OFF</span>
            </div>
          )}

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
              <select value={form.category} onChange={e=>f('category',e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange">
                {CATS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                {['active','inactive'].map(s=>(
                  <button key={s} onClick={()=>f('status',s)}
                    className={`flex-1 py-3 text-xs font-semibold transition-all ${form.status===s?(s==='active'?'bg-brand-black text-white':'bg-red-500 text-white'):'text-gray-400 hover:bg-gray-50'}`}>
                    {s==='active'?'Active':'Off'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sizes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sizes & Stock</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {SIZES.map(sz=>(
                <button key={sz} onClick={()=>setSS(prev=>{const n={...prev};if(n[sz]!==undefined)delete n[sz];else n[sz]=0;return n;})}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${sizeStock[sz]!==undefined?'border-brand-black bg-brand-black text-white':'border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                  {sz}
                </button>
              ))}
            </div>
            {hasSizes ? (
              <div className="bg-gray-50 rounded-xl overflow-hidden divide-y divide-gray-100">
                {Object.entries(sizeStock).map(([sz,qty])=>(
                  <div key={sz} className="flex items-center gap-3 px-4 py-3">
                    <span className="font-semibold text-sm w-14">{sz}</span>
                    <input type="number" min="0" value={qty}
                      onChange={e=>setSS(prev=>({...prev,[sz]:parseInt(e.target.value)||0}))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:border-brand-orange" />
                    <span className="text-xs text-gray-400">units</span>
                    <button onClick={()=>setSS(prev=>{const n={...prev};delete n[sz];return n;})}
                      className="ml-auto text-red-400 text-sm hover:text-red-600 font-medium">Remove</button>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-2.5 bg-gray-100 text-xs font-semibold">
                  <span className="text-gray-500">Total stock</span>
                  <span className={Object.values(sizeStock).reduce((a,b)=>a+b,0)>0?'text-green-600':'text-red-500'}>
                    {Object.values(sizeStock).reduce((a,b)=>a+b,0)} units
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 mt-3">Plain Stock</label>
                <input type="number" min="0" value={form.stock} onChange={e=>f('stock',e.target.value)}
                  className="w-32 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange" />
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea value={form.description} onChange={e=>f('description',e.target.value)}
              rows={3} placeholder="Describe this product…"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-brand-orange focus:ring-2 focus:ring-orange-100" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0 bg-white">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:border-gray-400 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-[2] py-3.5 rounded-xl bg-brand-black text-white font-semibold text-sm hover:bg-brand-orange transition-colors disabled:opacity-50">
            {saving?'Saving…':'✅ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CSV Modal ──────────────────────────────────────────────────
function CSVModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [fileName,setFileName]=useState('');
  const fileRef=useRef<HTMLInputElement>(null);

  const parse=(text:string)=>{
    const lines=text.trim().split(/\r?\n/);
    const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());
    const parsed=lines.slice(1).filter(l=>l.trim()).map((line,i)=>{
      const vals:string[]=[]; let cur='',inQ=false;
      for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else{cur+=ch;}}
      vals.push(cur.trim());
      const row:any={_line:i+2};
      headers.forEach((h,idx)=>{row[h]=(vals[idx]||'').replace(/^"|"$/g,'').trim();});
      return row;
    }).filter(r=>r.sku||r.name);
    setRows(parsed); toast.success(`${parsed.length} rows ready`);
  };

  const doImport=async()=>{
    setLoading(true);
    const t=toast.loading(`Importing ${rows.length}…`);
    let ok=0,fail=0;
    for(const r of rows){
      try{
        const sku=r.sku?.trim().toUpperCase();
        if(!sku){fail++;continue;}
        const sizes=r.sizes?r.sizes.split('/').map((s:string)=>s.trim()).filter(Boolean):[];
        const{error}=await supabase.from('products').upsert({
          sku,name:r.name,description:r.description||'',price:parseFloat(r.price)||0,
          currency:'PHP',image_url:r.image_url||'',category:r.category||'Tops',status:'active',sizes,
        },{onConflict:'sku'});
        if(error){fail++;continue;}
        await supabase.from('inventory').upsert({sku,quantity:parseInt(r.stock)||0},{onConflict:'sku'});
        await supabase.from('qr_links').upsert({sku,qr_url:`${APP_URL}/p/${sku}`,scans:0},{onConflict:'sku'});
        ok++;
      }catch{fail++;}
    }
    toast.dismiss(t); toast.success(`✅ ${ok} imported${fail?` · ${fail} failed`:''}`);
    setLoading(false); onDone(); onClose();
  };

  const template=()=>{
    const csv='sku,name,description,price,stock,image_url,category,sizes\nAST-TOP-007,Sample,Description,1500,20,,Tops,S/M/L/XL';
    const a=document.createElement('a');
    a.href=`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download='ast3r-template.csv';a.click();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Import Products (CSV)</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="bg-blue-50 rounded-xl p-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-900 mb-1">Required columns</p>
              <p className="font-mono text-xs text-blue-600">sku, name, price, stock, category</p>
              <p className="text-xs text-blue-500 mt-1">Optional: description, image_url, sizes (S/M/L)</p>
            </div>
            <button onClick={template} className="text-xs bg-blue-100 text-blue-700 font-semibold px-3 py-2 rounded-lg whitespace-nowrap hover:bg-blue-200">⬇ Template</button>
          </div>
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-orange transition-colors"
            onClick={()=>fileRef.current?.click()}
            onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f){setFileName(f.name);const r=new FileReader();r.onload=ev=>parse(ev.target?.result as string);r.readAsText(f);}}}
            onDragOver={e=>e.preventDefault()}>
            <input ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e=>{const f=e.target.files?.[0];if(f){setFileName(f.name);const r=new FileReader();r.onload=ev=>parse(ev.target?.result as string);r.readAsText(f);e.target.value='';}}}/>
            {fileName
              ? <><p className="text-3xl mb-2">📄</p><p className="font-semibold">{fileName}</p><p className="text-gray-400 text-sm mt-1">{rows.length} rows parsed · tap to change</p></>
              : <><p className="text-4xl mb-3">📄</p><p className="text-gray-500">Tap to pick your CSV file</p><p className="text-gray-300 text-xs mt-1">or drag & drop here</p></>
            }
          </div>
          {rows.length>0 && (
            <div className="bg-gray-50 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-100 flex justify-between text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>SKU</span><span>Name</span><span>Price</span><span>Stock</span>
              </div>
              {rows.slice(0,8).map((r,i)=>(
                <div key={i} className={`px-4 py-2.5 flex justify-between text-xs border-t border-gray-100 ${!r.sku||!r.name?'bg-red-50':''}`}>
                  <span className="font-mono font-medium">{r.sku||'⚠️ missing'}</span>
                  <span className="text-gray-600 truncate max-w-[120px]">{r.name||'⚠️ missing'}</span>
                  <span>₱{r.price}</span>
                  <span>{r.stock||0}</span>
                </div>
              ))}
              {rows.length>8&&<p className="text-center text-xs text-gray-400 py-2">…{rows.length-8} more rows</p>}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-3.5 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-600">Cancel</button>
          <button onClick={doImport} disabled={rows.length===0||loading}
            className="flex-[2] py-3.5 rounded-xl bg-brand-black text-white font-semibold text-sm hover:bg-brand-orange transition-colors disabled:opacity-50">
            {loading?'Importing…':`Import ${rows.length} Products`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin ─────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const [,startT] = useTransition();
  const [tab,setTab]           = useState<Tab>('home');
  const [user,setUser]         = useState<any>(null);
  const [products,setProducts] = useState<Product[]>([]);
  const [orders,setOrders]     = useState<Order[]>([]);
  const [loading,setLoading]   = useState(true);
  const [search,setSearch]     = useState('');
  const [page,setPage]         = useState(0);
  const [editing,setEditing]   = useState<Product|null>(null);
  const [showCSV,setShowCSV]   = useState(false);
  const [qrSku,setQrSku]       = useState('');
  const [qrProd,setQrProd]     = useState<Product|null>(null);
  const [stats,setStats]       = useState({orders:0,revenue:0,pending:0,products:0,lowStock:0});
  // Quick add state
  const [qa,setQa] = useState({sku:'',name:'',price:'',stock:'0',category:'Tops'});
  const [qaLoading,setQaLoading] = useState(false);
  const [showQA,setShowQA] = useState(false);

  // Auth
  useEffect(()=>{
    supabase.auth.getUser().then(async({data:{user}})=>{
      if(!user){router.push('/admin/login');return;}
      const{data:admin}=await supabase.from('admin_profiles').select('role').eq('id',user.id).single();
      if(!admin){await supabase.auth.signOut();router.push('/admin/login');return;}
      setUser(user); loadAll();
    });
  },[]);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    await Promise.all([loadProducts(),loadOrders()]);
    setLoading(false);
  },[]);

  const loadProducts=async()=>{
    const{data}=await supabase.from('products')
      .select('*,inventory(quantity),size_inventory(size,quantity)')
      .order('created_at',{ascending:false});
    if(data){
      setProducts(data as Product[]);
      const low=data.filter(p=>{const q=p.inventory?.[0]?.quantity??0;return q>0&&q<=5;}).length;
      setStats(s=>({...s,products:data.length,lowStock:low}));
    }
  };

  const loadOrders=async()=>{
    const{data}=await supabase.from('orders')
      .select('*,payments(payment_method,status,payment_proof_url),order_items(sku,quantity,price)')
      .order('created_at',{ascending:false}).limit(200);
    if(data){
      setOrders(data as Order[]);
      setStats(s=>({...s,orders:data.length,
        revenue:data.reduce((sum,o)=>sum+Number(o.total_amount),0),
        pending:data.filter(o=>o.status==='pending').length,
      }));
    }
  };

  const filtered=useMemo(()=>{
    const q=search.toLowerCase();
    return products.filter(p=>!q||p.sku.toLowerCase().includes(q)||p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q));
  },[products,search]);
  const totalPages=Math.ceil(filtered.length/PAGE_SIZE);
  const paginated=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  useEffect(()=>setPage(0),[search]);

  // Mutations
  const toggleStatus=async(p:Product)=>{
    const next=p.status==='active'?'inactive':'active';
    startT(()=>setProducts(prev=>prev.map(x=>x.id===p.id?{...x,status:next}:x)));
    toast.success(`${p.sku} ${next}`,{duration:1500});
    await supabase.from('products').update({status:next}).eq('id',p.id);
  };
  const deleteProduct=async(p:Product)=>{
    if(!confirm(`Delete "${p.name}"?\n\nThis cannot be undone.`))return;
    startT(()=>setProducts(prev=>prev.filter(x=>x.id!==p.id)));
    toast.success('Deleted',{duration:1500});
    supabase.from('products').delete().eq('id',p.id);
  };
  const handleImgUp=(id:string,url:string)=>{
    startT(()=>setProducts(prev=>prev.map(p=>p.id===id?{...p,image_url:url}:p)));
  };

  const quickAdd=async()=>{
    if(!qa.sku||!qa.name||!qa.price){toast.error('SKU, Name and Price required');return;}
    setQaLoading(true);
    try{
      const sku=qa.sku.trim().toUpperCase();
      const{error}=await supabase.from('products').insert({
        sku,name:qa.name.trim(),price:parseFloat(qa.price),
        currency:'PHP',category:qa.category,status:'active',description:'',image_url:'',sizes:[],
      });
      if(error)throw error;
      await supabase.from('inventory').insert({sku,quantity:parseInt(qa.stock)||0});
      await supabase.from('qr_links').insert({sku,qr_url:`${APP_URL}/p/${sku}`,scans:0});
      toast.success(`${sku} added ✅`);
      setQa({sku:'',name:'',price:'',stock:'0',category:'Tops'});
      setShowQA(false);
      loadProducts();
    }catch(e:any){toast.error(e.message);}
    finally{setQaLoading(false);}
  };

  const verifyPayment=async(orderId:string)=>{
    await supabase.from('payments').update({status:'verified'}).eq('order_id',orderId);
    await supabase.from('orders').update({status:'paid'}).eq('id',orderId);
    toast.success('Payment verified ✅'); loadOrders();
  };
  const rejectPayment=async(orderId:string)=>{
    await supabase.from('payments').update({status:'rejected'}).eq('order_id',orderId);
    toast.success('Payment rejected'); loadOrders();
  };
  const updateOrderStatus=async(id:string,status:string)=>{
    await supabase.from('orders').update({status}).eq('id',id);
    toast.success(`Marked: ${status}`,{duration:1500}); loadOrders();
  };
  const searchQR=async()=>{
    const{data}=await supabase.from('products').select('*,inventory(quantity)').eq('sku',qrSku.trim().toUpperCase()).single();
    setQrProd(data as Product||null);
    if(!data)toast.error('SKU not found');
  };
  const signOut=async()=>{await supabase.auth.signOut();router.push('/admin/login');};

  if(loading) return(
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="font-serif text-4xl tracking-widest text-white mb-4">AST3R</p>
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"/>
      </div>
    </div>
  );

  return(
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Modals */}
      {editing && <EditSheet product={editing} onClose={()=>setEditing(null)} onSaved={loadProducts}/>}
      {showCSV  && <CSVModal onClose={()=>setShowCSV(false)} onDone={loadProducts}/>}

      {/* Quick Add Sheet */}
      {showQA && (
        <div className="fixed inset-0 z-50 flex flex-col" onClick={()=>setShowQA(false)}>
          <div className="flex-1 bg-black/50"/>
          <div className="bg-white rounded-t-2xl p-5 shadow-2xl" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-lg">Quick Add Product</h3>
              <button onClick={()=>setShowQA(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">✕</button>
            </div>
            <div className="space-y-3 mb-4">
              <input placeholder="SKU (e.g. AST-TOP-021) *" value={qa.sku}
                onChange={e=>setQa({...qa,sku:e.target.value.toUpperCase()})}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-orange"/>
              <input placeholder="Product Name *" value={qa.name}
                onChange={e=>setQa({...qa,name:e.target.value})}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange"/>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Price ₱ *" type="number" value={qa.price}
                  onChange={e=>setQa({...qa,price:e.target.value})}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange"/>
                <input placeholder="Stock" type="number" value={qa.stock}
                  onChange={e=>setQa({...qa,stock:e.target.value})}
                  className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-orange"/>
                <select value={qa.category} onChange={e=>setQa({...qa,category:e.target.value})}
                  className="border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-brand-orange">
                  {CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button onClick={quickAdd} disabled={qaLoading}
              className="w-full py-4 rounded-xl bg-brand-orange text-white font-bold text-sm hover:bg-orange-600 transition-colors disabled:opacity-50">
              {qaLoading?'Adding…':'+ Add Product'}
            </button>
          </div>
        </div>
      )}

      {/* ── TOP BAR ──────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="font-serif text-xl font-medium text-brand-black tracking-widest">AST3R</p>
            <p className="text-xs text-gray-400">Admin Panel</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-gray-400 hover:text-brand-black border border-gray-200 rounded-full px-3 py-1.5 transition-colors">
              View Store ↗
            </a>
            <button onClick={signOut} className="text-xs text-gray-400 hover:text-brand-black">Sign Out</button>
          </div>
        </div>
      </header>

      {/* ── CONTENT ───────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-5">

        {/* HOME ────────────────────────────────────────────── */}
        {tab==='home' && (
          <div className="space-y-5">
            <div>
              <p className="text-2xl font-bold text-gray-900">Good day! 👋</p>
              <p className="text-gray-400 text-sm">Here's your store at a glance</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {label:'Products',value:stats.products,icon:'👗',sub:`${stats.lowStock} low stock`,color:'bg-white',action:()=>setTab('products')},
                {label:'Orders',value:stats.orders,icon:'📦',sub:`${stats.pending} pending`,color:stats.pending>0?'bg-orange-50':'bg-white',action:()=>setTab('orders')},
                {label:'Revenue',value:formatPrice(stats.revenue),icon:'💰',sub:'total earned',color:'bg-white',action:()=>setTab('orders')},
                {label:'Pending',value:stats.pending,icon:'⏳',sub:'need attention',color:stats.pending>0?'bg-red-50':'bg-white',action:()=>setTab('orders')},
              ].map(({label,value,icon,sub,color,action})=>(
                <button key={label} onClick={action}
                  className={`${color} rounded-2xl p-4 text-left border border-gray-100 hover:shadow-md active:scale-[0.98] transition-all`}>
                  <p className="text-2xl mb-2">{icon}</p>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-0.5">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>

            {/* Low stock warning */}
            {stats.lowStock>0 && (
              <button onClick={()=>setTab('products')}
                className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-amber-100 transition-colors">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-800 text-sm">{stats.lowStock} products almost sold out</p>
                  <p className="text-xs text-amber-600">Tap to update stock →</p>
                </div>
              </button>
            )}

            {/* Quick actions */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {icon:'➕',label:'Add Product',sub:'Quick entry form',action:()=>setShowQA(true),color:'bg-brand-orange text-white'},
                  {icon:'📄',label:'Import CSV',sub:'Bulk add products',action:()=>setShowCSV(true),color:'bg-white'},
                  {icon:'📋',label:'View Orders',sub:`${stats.pending} pending`,action:()=>setTab('orders'),color:'bg-white'},
                  {icon:'📲',label:'QR Codes',sub:'Download & print',action:()=>setTab('qr'),color:'bg-white'},
                ].map(({icon,label,sub,action,color})=>(
                  <button key={label} onClick={action}
                    className={`${color} rounded-2xl p-4 text-left border border-gray-100 hover:shadow-md active:scale-[0.98] transition-all`}>
                    <p className="text-2xl mb-2">{icon}</p>
                    <p className="font-bold text-sm">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Recent orders */}
            {orders.length>0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
                  <p className="font-bold text-sm text-gray-900">Recent Orders</p>
                  <button onClick={()=>setTab('orders')} className="text-xs text-brand-orange font-semibold">See all →</button>
                </div>
                {orders.slice(0,4).map(o=>(
                  <div key={o.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="font-mono text-sm font-bold text-gray-900">{o.order_code}</p>
                      <p className="text-xs text-gray-400">{o.customer_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{formatPrice(o.total_amount)}</p>
                      <StatusPill s={o.status}/>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PRODUCTS ────────────────────────────────────────── */}
        {tab==='products' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-lg">🔍</span>
                <input type="text" placeholder="Search products…"
                  value={search} onChange={e=>setSearch(e.target.value)}
                  className="w-full bg-white border border-gray-100 rounded-xl pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-brand-orange shadow-sm"/>
                {search && <button onClick={()=>setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">✕</button>}
              </div>
              <button onClick={()=>setShowQA(true)}
                className="bg-brand-orange text-white rounded-xl px-4 font-bold text-lg hover:bg-orange-600 transition-colors shadow-sm">+</button>
              <button onClick={()=>setShowCSV(true)}
                className="bg-white border border-gray-100 text-gray-600 rounded-xl px-3 text-sm font-medium hover:border-gray-300 shadow-sm">CSV</button>
            </div>

            {search && <p className="text-xs text-gray-400 px-1">{filtered.length} result{filtered.length!==1?'s':''}</p>}

            {/* Product cards */}
            <div className="space-y-2">
              {paginated.length===0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                  <p className="text-5xl mb-4">👗</p>
                  <p className="font-semibold text-gray-700 mb-1">{search?'No results found':'No products yet'}</p>
                  <p className="text-gray-400 text-sm mb-4">{search?`Try searching for something else`:'Tap + to add your first product'}</p>
                  {!search && <button onClick={()=>setShowQA(true)} className="bg-brand-orange text-white px-6 py-3 rounded-xl font-semibold text-sm">+ Add Product</button>}
                </div>
              ) : paginated.map(p=>{
                const stock=p.inventory?.[0]?.quantity??0;
                const sizeTotal=(p.size_inventory||[]).reduce((s,si)=>s+si.quantity,0);
                const dispStock=(p.size_inventory||[]).length>0?sizeTotal:stock;
                const hasSizes=(p.size_inventory||[]).length>0;

                return(
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={()=>setEditing(p)}>
                      {/* Image */}
                      <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                        {p.image_url
                          ? <Image src={p.image_url} alt="" fill className="object-cover" sizes="56px"/>
                          : <div className="absolute inset-0 flex items-center justify-center text-xl">📷</div>}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{p.sku} · {p.category}</p>
                          </div>
                          <StatusPill s={p.status}/>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          {p.compare_price && p.compare_price<p.price ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-red-600 font-bold text-sm">{formatPrice(p.compare_price)}</span>
                              <span className="text-gray-300 line-through text-xs">{formatPrice(p.price)}</span>
                              <span className="text-xs bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">-{Math.round((1-p.compare_price/p.price)*100)}%</span>
                            </div>
                          ) : (
                            <span className="font-bold text-sm text-gray-900">{formatPrice(p.price)}</span>
                          )}
                          <span className={`text-xs font-semibold ml-auto ${dispStock<=0?'text-red-500':dispStock<=5?'text-orange-500':'text-green-600'}`}>
                            {dispStock<=0?'OUT OF STOCK':`${dispStock} units`}
                          </span>
                        </div>
                        {/* Sizes preview */}
                        {hasSizes && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {(p.size_inventory||[]).map(si=>(
                              <span key={si.size} className={`text-xs px-1.5 py-0.5 rounded font-medium ${si.quantity<=0?'bg-red-50 text-red-400':si.quantity<=3?'bg-orange-50 text-orange-500':'bg-gray-100 text-gray-500'}`}>
                                {si.size}:{si.quantity}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action bar */}
                    <div className="flex border-t border-gray-50">
                      <button onClick={()=>setEditing(p)} className="flex-1 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-brand-orange transition-colors flex items-center justify-center gap-1.5">
                        ✏️ Edit
                      </button>
                      <div className="w-px bg-gray-100"/>
                      <a href={`/p/${p.sku}`} target="_blank" rel="noopener noreferrer"
                        className="flex-1 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 hover:text-brand-orange transition-colors flex items-center justify-center gap-1.5">
                        🔗 View
                      </a>
                      <div className="w-px bg-gray-100"/>
                      <button onClick={()=>toggleStatus(p)}
                        className="flex-1 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                        {p.status==='active'?'⏸ Hide':'▶ Show'}
                      </button>
                      <div className="w-px bg-gray-100"/>
                      <button onClick={()=>deleteProduct(p)}
                        className="flex-1 py-3 text-xs font-semibold text-red-400 hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages>1 && (
              <div className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 text-xs">
                <span className="text-gray-400">{page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,filtered.length)} of {filtered.length}</span>
                <div className="flex gap-2">
                  <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
                    className="px-4 py-2 rounded-lg border border-gray-200 disabled:opacity-40 font-medium hover:border-gray-400">← Prev</button>
                  <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
                    className="px-4 py-2 rounded-lg border border-gray-200 disabled:opacity-40 font-medium hover:border-gray-400">Next →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ORDERS ───────────────────────────────────────────── */}
        {tab==='orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">{orders.length} total · <span className="text-orange-500 font-semibold">{stats.pending} pending</span></p>
              </div>
              <button onClick={loadOrders} className="text-xs text-gray-400 border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400">↻ Refresh</button>
            </div>

            {orders.length===0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
                <p className="text-5xl mb-4">📭</p>
                <p className="font-semibold text-gray-700">No orders yet</p>
                <p className="text-gray-400 text-sm mt-1">Orders will appear here when customers buy</p>
              </div>
            ) : orders.map(order=>{
              const payment=order.payments?.[0];
              return(
                <div key={order.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="font-mono font-bold text-gray-900">{order.order_code}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">{formatPrice(order.total_amount)}</p>
                      <StatusPill s={order.status}/>
                    </div>
                  </div>

                  {/* Customer info */}
                  <div className="bg-gray-50 mx-4 mb-4 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Customer</span>
                      <span className="font-semibold">{order.customer_name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Contact</span>
                      <span>{order.contact_number}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Address</span>
                      <span className="text-right max-w-[60%] text-xs">{order.address_full}</span>
                    </div>
                    {order.region && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500 font-medium">Shipping</span>
                        <span>{formatPrice(order.shipping_fee||0)} · {order.region} · {order.courier||'TBD'}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 font-medium">Payment</span>
                      <div className="flex items-center gap-2">
                        <span>{payment?.payment_method}</span>
                        {payment && <StatusPill s={payment.status}/>}
                      </div>
                    </div>
                    {/* Items */}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                      {order.order_items?.map((item,i)=>(
                        <span key={i} className="bg-white text-gray-600 text-xs px-2.5 py-1 rounded-lg border border-gray-200 font-mono">
                          {item.sku} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 space-y-2">
                    {payment?.payment_proof_url && (
                      <a href={payment.payment_proof_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 font-medium hover:border-gray-400 transition-colors">
                        📎 View Payment Proof
                      </a>
                    )}
                    {payment?.status==='pending'&&payment?.payment_method!=='COD' && (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={()=>verifyPayment(order.id)}
                          className="py-3 rounded-xl bg-green-600 text-white font-semibold text-sm hover:bg-green-700 transition-colors">
                          ✓ Verify Payment
                        </button>
                        <button onClick={()=>rejectPayment(order.id)}
                          className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700 transition-colors">
                          ✗ Reject
                        </button>
                      </div>
                    )}
                    <select defaultValue={order.status}
                      onChange={e=>updateOrderStatus(order.id,e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 focus:outline-none focus:border-brand-orange bg-white font-medium">
                      <option value="pending">🕐 Pending</option>
                      <option value="paid">✅ Paid</option>
                      <option value="shipped">🚚 Shipped</option>
                      <option value="cancelled">❌ Cancelled</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* QR CODES ─────────────────────────────────────────── */}
        {tab==='qr' && (
          <div className="space-y-5">
            {/* Search QR */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="font-bold text-gray-900 mb-1">Find QR by SKU</p>
              <p className="text-xs text-gray-400 mb-4">Enter a SKU to generate its QR code</p>
              <div className="flex gap-2 mb-4">
                <input type="text" placeholder="e.g. AST-TOP-001"
                  value={qrSku} onChange={e=>setQrSku(e.target.value.toUpperCase())}
                  onKeyDown={e=>e.key==='Enter'&&searchQR()}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-brand-orange"/>
                <button onClick={searchQR} className="bg-brand-black text-white rounded-xl px-5 font-semibold text-sm hover:bg-brand-orange transition-colors">Go</button>
              </div>
              {qrProd && (
                <div className="text-center">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(`${APP_URL}/p/${qrProd.sku}`)}&bgcolor=FFFFFF&color=000000&margin=15`}
                    alt={qrProd.sku} className="mx-auto mb-3 w-40 h-40 rounded-xl border border-gray-100"/>
                  <p className="font-semibold">{qrProd.name}</p>
                  <p className="font-mono text-xs text-gray-400 mb-4">{qrProd.sku}</p>
                  <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${APP_URL}/p/${qrProd.sku}`)}&bgcolor=FFFFFF&color=000000&margin=20`}
                    download={`${qrProd.sku}.png`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-brand-black text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-brand-orange transition-colors">
                    ⬇ Download PNG
                  </a>
                </div>
              )}
            </div>

            {/* QR Grid */}
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">All {products.length} Products</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {products.map(p=>{
                  const url=`${APP_URL}/p/${p.sku}`;
                  return(
                    <div key={p.sku} className="bg-white rounded-2xl border border-gray-100 p-4 text-center shadow-sm">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=0A0A0A&margin=8`}
                        alt={p.sku} className="mx-auto mb-2 w-24 h-24 rounded-lg"/>
                      <p className="font-mono text-xs text-gray-400 truncate">{p.sku}</p>
                      <p className="text-xs font-semibold truncate mb-2">{p.name}</p>
                      <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(url)}&bgcolor=FFFFFF&color=000000&margin=20`}
                        download={`${p.sku}.png`} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-orange font-semibold underline">⬇ Download</a>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV ─────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-30 shadow-lg">
        <div className="max-w-4xl mx-auto flex">
          {[
            {id:'home',    icon:'🏠', label:'Home'},
            {id:'products',icon:'👗', label:'Products'},
            {id:'orders',  icon:'📦', label:'Orders', badge:stats.pending},
            {id:'qr',      icon:'📲', label:'QR'},
          ].map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id as Tab)}
              className={`flex-1 flex flex-col items-center py-3 pt-2.5 gap-0.5 transition-colors relative ${tab===n.id?'text-brand-orange':'text-gray-400 hover:text-gray-600'}`}>
              <span className="text-xl">{n.icon}</span>
              <span className="text-xs font-semibold">{n.label}</span>
              {(n.badge||0)>0 && (
                <span className="absolute top-2 right-[calc(50%-16px)] bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center font-bold leading-none">
                  {n.badge}
                </span>
              )}
              {tab===n.id && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-brand-orange rounded-full"/>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
