// src/app/layout.tsx
import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import MetaPixel    from '@/components/MetaPixel';
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
  const waNumber = '639674000040'; // 0967-4000-040 in international format
  const waMessage = encodeURIComponent('Hi AST3R! I have a question about your products.');

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        {children}

        {/* ── WHATSAPP FLOATING BUTTON ── */}
        <a
          href={`https://wa.me/${waNumber}?text=${waMessage}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat on WhatsApp"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '20px',
            zIndex: 50,
            width: '52px',
            height: '52px',
            backgroundColor: '#25D366',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(37,211,102,0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>

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
