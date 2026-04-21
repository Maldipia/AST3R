// src/app/p/[sku]/TrackView.tsx
'use client';
import { useEffect } from 'react';
import { addRecentlyViewed } from '@/lib/recentlyViewed';

interface Props {
  sku: string; name: string; price: number;
  compare_price?: number | null; image_url?: string; category: string;
}

export default function TrackView(props: Props) {
  useEffect(() => {
    addRecentlyViewed(props);
  }, [props.sku]);
  return null;
}
