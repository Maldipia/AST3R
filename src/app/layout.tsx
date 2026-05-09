// src/app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import MetaPixel       from '@/components/MetaPixel';
import WhatsAppButton  from '@/components/WhatsAppButton';
import { Suspense }  from 'react';
import './globals.css';

export const metadata: Metadata = {
  title:       'AST3R Fashion — Elevated Essentials',
  description: 'Trendy, high-quality fashion from Amadeo, Cavite. Shop tops, coords, dresses, kids sets and more. Nationwide delivery. GCash and COD accepted.',
  keywords:    ['fashion', 'clothing', 'Philippines', 'Cavite', 'AST3R', 'elevated essentials', 'affordable fashion'],
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    type:        'website',
    title:       'AST3R Fashion — Elevated Essentials',
    description: 'Trendy fashion from Amadeo, Cavite. Nationwide delivery. GCash & COD accepted.',
    siteName:    'AST3R Fashion',
    url:         'https://www.ast3r.store',
    images: [{
      url:    'https://www.ast3r.store/og-image.jpg',
      width:  1200,
      height: 630,
      alt:    'AST3R Fashion',
    }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'AST3R Fashion',
    description: 'Elevated essentials. Worldwide shipping.',
  },
  metadataBase: new URL('https://www.ast3r.store'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        {children}

        <WhatsAppButton />

        <Suspense fallback={null}><MetaPixel /></Suspense>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background:    '#0A0A0A',
              color:         '#FAFAF8',
              border:        '1px solid #2A2A2A',
              borderRadius:  '0px',
              fontSize:      '13px',
              letterSpacing: '0.02em',
              marginBottom:  '80px', // clear sticky buy bar on mobile
            },
            success: { iconTheme: { primary: '#E8571A', secondary: '#FAFAF8' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#FAFAF8' } },
          }}
        />
      </body>
    </html>
  );
}
