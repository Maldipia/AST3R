// src/app/sitemap.ts
import { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://www.ast3r.store';

  // Static pages
  const statics: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/store`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/track`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/returns`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  // Dynamic product pages
  try {
    const { data: products } = await supabase
      .from('products')
      .select('sku, updated_at')
      .eq('status', 'active');

    const productPages: MetadataRoute.Sitemap = (products || []).map(p => ({
      url: `${base}/p/${p.sku}`,
      lastModified: new Date(p.updated_at || Date.now()),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

    return [...statics, ...productPages];
  } catch {
    return statics;
  }
}
