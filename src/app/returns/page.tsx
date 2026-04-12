// src/app/returns/page.tsx
'use client';

import { useState } from 'react';
import Link         from 'next/link';
import toast        from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Header       from '@/components/Header';

export default function ReturnsPage() {
  const [form, setForm]   = useState({ order_code:'', name:'', email:'', contact:'', sku:'', reason:'', type:'exchange', preferred_size:'' });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);
  const f = (k: string, v: string) => setForm(p => ({...p, [k]: v}));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.order_code || !form.name || !form.reason) { toast.error('Please fill all required fields'); return; }
    setSaving(true);

    // Send email to admin
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'return_request',
          ...form,
        }),
      });
    } catch {}

    setSaving(false);
    setDone(true);
    toast.success('Return request submitted! We\'ll contact you within 24 hours.');
  };

  if (done) return (
    <>
      <Header />
      <main className="min-h-screen pt-16 bg-brand-cream flex items-center justify-center">
        <div className="text-center px-4 animate-fade-up">
          <p className="text-5xl mb-6">✅</p>
          <h1 className="font-serif text-3xl text-brand-black mb-3">Request Submitted!</h1>
          <p className="text-brand-gray text-sm mb-2">We'll reach out within 24 hours to process your {form.type}.</p>
          <p className="text-brand-gray text-sm mb-8">Reference: <strong>{form.order_code}</strong></p>
          <Link href="/" className="btn-primary">Continue Shopping</Link>
        </div>
      </main>
    </>
  );

  return (
    <>
      <Header />
      <main className="min-h-screen pt-16 bg-brand-cream">
        <div className="max-w-2xl mx-auto px-4 py-16">
          <div className="text-center mb-10">
            <span className="block w-12 h-0.5 bg-brand-orange mx-auto mb-4" />
            <h1 className="font-serif text-4xl text-brand-black mb-3">Return / Exchange</h1>
            <p className="text-brand-gray text-sm">7-day return/exchange from delivery date. Items must be unworn with tags attached.</p>
          </div>

          <div className="bg-brand-cream border border-brand-light p-4 mb-8">
            <p className="text-xs font-medium text-brand-black mb-2">📋 Our Policy</p>
            <ul className="text-xs text-brand-gray space-y-1">
              <li>✅ 7 days from delivery date</li>
              <li>✅ Items must be unworn with original tags</li>
              <li>✅ Original packaging required</li>
              <li>⚠️ Customer pays return shipping</li>
              <li>❌ Final sale / discounted items not eligible</li>
            </ul>
          </div>

          <form onSubmit={submit} className="bg-white border border-brand-light p-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Request Type *</label>
                <div className="grid grid-cols-2 gap-2">
                  {['return','exchange'].map(t => (
                    <button key={t} type="button" onClick={() => f('type', t)}
                      className={`py-2.5 text-xs font-medium border transition-all capitalize ${form.type===t ? 'bg-brand-black text-white border-brand-black' : 'border-brand-light text-brand-gray hover:border-brand-black'}`}>
                      {t === 'return' ? '↩ Return' : '🔄 Exchange'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="input-label">Order Code *</label>
                <input value={form.order_code} onChange={e => f('order_code', e.target.value.toUpperCase())}
                  placeholder="AST-XXXXXXXX" className="input-field font-mono" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">Full Name *</label>
                <input value={form.name} onChange={e => f('name', e.target.value)}
                  placeholder="Maria Santos" className="input-field" required />
              </div>
              <div>
                <label className="input-label">Contact Number *</label>
                <input value={form.contact} onChange={e => f('contact', e.target.value)}
                  placeholder="09XX XXX XXXX" className="input-field" required />
              </div>
            </div>

            <div>
              <label className="input-label">Email Address</label>
              <input type="email" value={form.email} onChange={e => f('email', e.target.value)}
                placeholder="yourname@email.com" className="input-field" />
            </div>

            <div>
              <label className="input-label">Product SKU (if known)</label>
              <input value={form.sku} onChange={e => f('sku', e.target.value.toUpperCase())}
                placeholder="e.g. AST-TOP-001" className="input-field font-mono" />
            </div>

            {form.type === 'exchange' && (
              <div>
                <label className="input-label">Preferred Size / Color</label>
                <input value={form.preferred_size} onChange={e => f('preferred_size', e.target.value)}
                  placeholder="e.g. L, or same in Black" className="input-field" />
              </div>
            )}

            <div>
              <label className="input-label">Reason for {form.type === 'return' ? 'Return' : 'Exchange'} *</label>
              <select value={form.reason} onChange={e => f('reason', e.target.value)} className="input-field mb-2" required>
                <option value="">— Select reason —</option>
                <option>Wrong size</option>
                <option>Item defective / damaged</option>
                <option>Wrong item received</option>
                <option>Color different from photo</option>
                <option>Changed my mind</option>
                <option>Other</option>
              </select>
            </div>

            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? 'Submitting…' : `Submit ${form.type === 'return' ? 'Return' : 'Exchange'} Request`}
            </button>
          </form>

          <div className="text-center mt-8 space-y-2">
            <p className="text-xs text-brand-gray">Questions? Contact us directly:</p>
            <a href="mailto:inquiry@ast3r.store" className="text-xs text-brand-orange underline">inquiry@ast3r.store</a>
            <span className="text-brand-light mx-2">|</span>
            <a href="tel:09669606060" className="text-xs text-brand-orange underline">0966 960 6060</a>
          </div>
        </div>
      </main>
    </>
  );
}
