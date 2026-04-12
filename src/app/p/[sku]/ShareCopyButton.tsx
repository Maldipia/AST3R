// src/app/p/[sku]/ShareCopyButton.tsx
'use client';

import { useState } from 'react';

export default function ShareCopyButton() {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button onClick={copy}
      className="flex items-center gap-1.5 text-xs border border-brand-light px-3 py-2 text-brand-gray hover:border-brand-black hover:text-brand-black transition-all">
      {copied ? '✅ Copied!' : '🔗 Copy Link'}
    </button>
  );
}
