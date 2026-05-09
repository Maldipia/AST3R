// src/app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/checkout', '/payment', '/confirmation', '/api'],
      },
    ],
    sitemap: 'https://www.ast3r.store/sitemap.xml',
  };
}
