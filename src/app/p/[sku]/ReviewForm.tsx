// src/app/p/[sku]/ReviewForm.tsx
'use client';

import { useState } from 'react';
import toast        from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

export default function ReviewForm({ sku }: { sku: string }) {
  const [open,   setOpen]   = useState(false);
  const [form,   setForm]   = useState({ name: '', rating: 5, comment: '' });
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim())    { toast.error('Please enter your name'); return; }
    if (!form.comment.trim()) { toast.error('Please write a review'); return; }

    setSaving(true);
    const { error } = await supabase.from('reviews').insert({
      sku,
      customer_name: form.name.trim(),
      rating:        form.rating,
      comment:       form.comment.trim(),
      verified:      false, // admin must verify before it shows
    });

    if (error) { toast.error('Failed to submit. Please try again.'); setSaving(false); return; }

    setSaving(false);
    setDone(true);
    toast.success('Review submitted! It will appear after verification. Thank you! 🙏');
  };

  if (done) return (
    <div className="bg-brand-cream border border-brand-light p-6 text-center max-w-md">
      <p className="text-2xl mb-2">🙏</p>
      <p className="font-medium text-brand-black mb-1">Thank you for your review!</p>
      <p className="text-sm text-brand-gray">It will be visible after our team verifies it.</p>
    </div>
  );

  return (
    <div className="max-w-md">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="btn-outline py-3 px-6 text-xs">
          ✍️ Leave a Review
        </button>
      ) : (
        <form onSubmit={submit} className="border border-brand-light p-6 space-y-4">
          <h3 className="font-medium text-brand-black">Write a Review</h3>

          {/* Star rating */}
          <div>
            <label className="input-label">Rating *</label>
            <div className="flex gap-2 mt-1">
              {[1,2,3,4,5].map(star => (
                <button key={star} type="button" onClick={() => setForm(f => ({ ...f, rating: star }))}
                  className={`text-2xl transition-all ${star <= form.rating ? 'text-brand-orange' : 'text-brand-light'}`}>
                  ★
                </button>
              ))}
              <span className="text-xs text-brand-gray self-center ml-2">
                {['','Poor','Fair','Good','Very Good','Excellent'][form.rating]}
              </span>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="input-label">Your Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Maria S." className="input-field" required />
          </div>

          {/* Review */}
          <div>
            <label className="input-label">Review *</label>
            <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
              placeholder="What did you love about this piece? How did it fit?"
              rows={4} className="input-field resize-none" required />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary py-3 px-6 text-xs flex-1">
              {saving ? 'Submitting…' : 'Submit Review'}
            </button>
          </div>

          <p className="text-xs text-brand-gray">Reviews are verified before publishing.</p>
        </form>
      )}
    </div>
  );
}
