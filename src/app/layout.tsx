// src/app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import MetaPixel    from '@/components/MetaPixel';
import { Suspense }  from 'react';
import './globals.css';

export const metadata: Metadata = {
  title:       'AST3R Fashion — Elevated Essentials',
  description: 'Trendy · High-Quality · Comfort. Shop the AST3R Fashion collection.',
  keywords:    ['fashion', 'clothing', 'Philippines', 'Tagaytay', 'AST3R'],
  openGraph: {
    type:        'website',
    title:       'AST3R Fashion',
    description: 'Elevated essentials. Worldwide shipping.',
    siteName:    'AST3R Fashion',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="font-sans antialiased">
        {children}
        <Suspense fallback={null}><MetaPixel /></Suspense>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background:   '#0A0A0A',
              color:        '#FAFAF8',
              border:       '1px solid #2A2A2A',
              borderRadius: '0px',
              fontSize:     '13px',
              letterSpacing: '0.02em',
            },
            success: { iconTheme: { primary: '#E8571A', secondary: '#FAFAF8' } },
            error:   { iconTheme: { primary: '#EF4444', secondary: '#FAFAF8' } },
          }}
        />
      </body>
    </html>
  );
}
