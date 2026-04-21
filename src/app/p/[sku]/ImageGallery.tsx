// src/app/p/[sku]/ImageGallery.tsx
'use client';
import { useState } from 'react';
import Image from 'next/image';

interface Props {
  mainImage: string | null;
  extraImages: { image_url: string; sort_order: number }[];
  name: string;
}

export default function ImageGallery({ mainImage, extraImages, name }: Props) {
  const all = [
    ...(mainImage ? [{ image_url: mainImage, sort_order: -1 }] : []),
    ...extraImages,
  ].sort((a, b) => a.sort_order - b.sort_order);

  const [active, setActive] = useState(0);

  if (all.length === 0) return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="font-serif text-4xl text-brand-light">AST3R</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Main image */}
      <div className="relative flex-1 min-h-0 aspect-[3/4]">
        <Image src={all[active].image_url} alt={name} fill
          className="object-cover object-top transition-opacity duration-300" priority sizes="(max-width:1024px) 100vw, 50vw" />
      </div>

      {/* Thumbnails — only if multiple images */}
      {all.length > 1 && (
        <div className="flex gap-2 p-3 bg-brand-cream overflow-x-auto">
          {all.map((img, i) => (
            <button key={i} onClick={() => setActive(i)}
              className={`relative w-14 h-16 flex-shrink-0 overflow-hidden transition-all duration-150 ${
                active === i ? 'ring-2 ring-brand-black ring-offset-1' : 'opacity-60 hover:opacity-100'
              }`}>
              <Image src={img.image_url} alt={`${name} ${i+1}`} fill className="object-cover object-top" sizes="56px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
