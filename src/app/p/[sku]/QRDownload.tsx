// src/app/p/[sku]/QRDownload.tsx
'use client';

import { useState } from 'react';
import QRCode        from 'react-qr-code';

export default function QRDownload({ sku, productName }: { sku: string; productName: string }) {
  const [show, setShow] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com';
  const productUrl = `${appUrl}/p/${sku}`;

  const downloadQR = () => {
    const svg = document.getElementById(`qr-${sku}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas  = document.createElement('canvas');
    canvas.width  = 300;
    canvas.height = 300;
    const ctx  = canvas.getContext('2d')!;
    const img  = new window.Image();
    img.onload = () => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, 300, 300);
      ctx.drawImage(img, 20, 20, 260, 260);
      const a = document.createElement('a');
      a.download = `QR-${sku}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  return (
    <div className="mt-8">
      <button
        onClick={() => setShow(!show)}
        className="text-xs text-brand-gray hover:text-brand-black transition-colors tracking-widest uppercase underline underline-offset-4"
      >
        {show ? 'Hide QR Code' : 'View QR Code'}
      </button>

      {show && (
        <div className="mt-4 p-6 border border-brand-light flex flex-col items-center gap-4 animate-fade-in">
          <QRCode
            id={`qr-${sku}`}
            value={productUrl}
            size={160}
            style={{ height: 'auto', maxWidth: '100%', width: '100%', maxHeight: 160 }}
          />
          <p className="text-xs text-brand-gray text-center font-mono">{sku}</p>
          <button onClick={downloadQR} className="btn-outline py-2 px-6 text-xs">
            Download QR
          </button>
        </div>
      )}
    </div>
  );
}
