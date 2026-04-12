// src/components/Header.tsx
'use client';

import Link          from 'next/link';
import { useState }  from 'react';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-brand-white/95 backdrop-blur-sm border-b border-brand-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Left nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#collections" className="nav-link">Collections</Link>
            <Link href="/store"         className="nav-link">Visit Store</Link>
            <Link href="/track"         className="nav-link">Track Order</Link>
          </nav>

          {/* Logo */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <span className="font-serif text-2xl font-medium tracking-[0.15em] text-brand-black">AST3R</span>
          </Link>

          {/* Right nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/returns"                className="nav-link">Returns</Link>
            <a href="mailto:inquiry@ast3r.store" className="nav-link">Contact</a>
            <a href="https://instagram.com/ast3r.ph" target="_blank" rel="noopener noreferrer" className="nav-link">Instagram</a>
          </nav>

          {/* Mobile menu button */}
          <button className="md:hidden ml-auto text-brand-gray hover:text-brand-black transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-brand-light py-4 space-y-3 animate-fade-in">
            {[
              { href: '/#collections', label: 'Collections' },
              { href: '/store',        label: '📍 Visit Store' },
              { href: '/track',        label: '📦 Track Order' },
              { href: '/returns',      label: '↩ Returns' },
              { href: 'mailto:inquiry@ast3r.store', label: '📧 Contact' },
            ].map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                className="block text-sm text-brand-gray hover:text-brand-black transition-colors px-2">
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
