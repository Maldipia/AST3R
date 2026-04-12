// src/app/p/[sku]/ShareButton.tsx
'use client';

import { useState } from 'react';
import toast        from 'react-hot-toast';

export default function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied!', { duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 text-xs border border-brand-light px-3 py-2 text-brand-gray hover:border-brand-black transition-all">
      {copied ? '✅ Copied!' : '🔗 Copy Link'}
    </button>
  );
}
