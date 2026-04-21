// src/app/p/[sku]/CODChecker.tsx
'use client';
import { useState } from 'react';
import { guessRegionFromAddress } from '@/lib/shipping';

const COD_AVAILABLE = ['metro_manila', 'luzon', 'visayas', 'mindanao'];

export default function CODChecker() {
  const [city, setCity] = useState('');
  const [result, setResult] = useState<'available'|'unavailable'|'international'|null>(null);

  const check = () => {
    if (!city.trim()) return;
    const region = guessRegionFromAddress(city);
    if (!region) setResult('unavailable');
    else if (region === 'international') setResult('international');
    else if (COD_AVAILABLE.includes(region)) setResult('available');
    else setResult('unavailable');
  };

  return (
    <div className="border border-brand-light pt-6 mt-6">
      <p className="text-xs font-medium tracking-[0.2em] uppercase text-brand-gray mb-3">COD Availability Checker</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={city}
          onChange={e => { setCity(e.target.value); setResult(null); }}
          onKeyDown={e => e.key === 'Enter' && check()}
          placeholder="Enter your city or province..."
          className="flex-1 border border-brand-light px-3 py-2 text-sm focus:outline-none focus:border-brand-black transition-colors"
        />
        <button onClick={check}
          className="bg-brand-black text-white px-4 py-2 text-xs tracking-widest uppercase hover:bg-brand-orange transition-colors">
          Check
        </button>
      </div>
      {result && (
        <div className={`mt-2.5 flex items-center gap-2 text-xs font-medium ${
          result === 'available' ? 'text-green-700' : result === 'international' ? 'text-blue-600' : 'text-red-600'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            result === 'available' ? 'bg-green-500' : result === 'international' ? 'bg-blue-500' : 'bg-red-400'
          }`} />
          {result === 'available' && '✓ Cash on Delivery (COD) is available in your area'}
          {result === 'unavailable' && '✕ COD not available — GCash or bank transfer required'}
          {result === 'international' && 'International delivery — online payment required'}
        </div>
      )}
    </div>
  );
}
