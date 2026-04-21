// src/components/FlashSaleBanner.tsx
'use client';
import { useState, useEffect } from 'react';

interface FlashSale {
  active: boolean;
  title: string;
  subtitle: string;
  ends_at: string | null;
  banner_color: string;
}

export default function FlashSaleBanner({ sale }: { sale: FlashSale | null }) {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!sale?.active || !sale.ends_at) return;
    const calc = () => {
      const diff = new Date(sale.ends_at!).getTime() - Date.now();
      if (diff <= 0) { setExpired(true); return; }
      setTimeLeft({ h: Math.floor(diff/3600000), m: Math.floor((diff%3600000)/60000), s: Math.floor((diff%60000)/1000) });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [sale]);

  if (!sale?.active || expired) return null;

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="bg-brand-black text-white py-2.5 px-4 text-center">
      <div className="max-w-7xl mx-auto flex items-center justify-center gap-4 flex-wrap">
        <div>
          <span className="text-brand-orange text-[10px] tracking-[0.3em] uppercase font-medium mr-2">⚡ {sale.title}</span>
          <span className="text-white/70 text-xs">{sale.subtitle}</span>
        </div>
        {sale.ends_at && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/50 text-[10px] tracking-widest uppercase">Ends in</span>
            {[pad(timeLeft.h), pad(timeLeft.m), pad(timeLeft.s)].map((v, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="bg-white/10 text-white font-mono text-xs font-bold px-2 py-1 rounded">{v}</span>
                {i < 2 && <span className="text-white/40 text-xs">:</span>}
              </span>
            ))}
          </div>
        )}
        <a href="#collections" className="text-brand-orange text-[10px] tracking-[0.2em] uppercase font-medium border-b border-brand-orange/40 hover:border-brand-orange transition-colors">
          Shop Now →
        </a>
      </div>
    </div>
  );
}
