// src/components/Header.tsx
'use client';

import Link from 'next/link';

export default function Header() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-brand-white/95 backdrop-blur-sm border-b border-brand-light">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Left nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/#collections" className="nav-link">Collections</Link>
            <Link href="/#about"       className="nav-link">About</Link>
          </nav>

          {/* Logo */}
          <Link href="/" className="absolute left-1/2 -translate-x-1/2">
            <span className="font-serif text-2xl font-medium tracking-[0.15em] text-brand-black">
              AST3R
            </span>
          </Link>

          {/* Right nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="mailto:inquiry@ast3r.store" className="nav-link">Contact</Link>
            <a
              href="https://instagram.com/ast3r.ph"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              Instagram
            </a>
          </nav>

          {/* Mobile menu button */}
          <button className="md:hidden ml-auto text-brand-gray hover:text-brand-black transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
