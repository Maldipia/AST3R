// src/components/Header.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import CartDrawer from './CartDrawer';

export default function Header() {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-md shadow-[0_1px_0_rgba(0,0,0,0.06)]' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">

          {/* Left nav */}
          <nav className="hidden md:flex items-center gap-7">
            <a href="#collections" className={`nav-link text-[11px] ${!scrolled ? 'text-white/70 hover:text-white' : ''}`}>
              Collections
            </a>
            <Link href="/store" className={`nav-link text-[11px] ${!scrolled ? 'text-white/70 hover:text-white' : ''}`}>
              Visit Store
            </Link>
            <Link href="/track" className={`nav-link text-[11px] ${!scrolled ? 'text-white/70 hover:text-white' : ''}`}>
              Track Order
            </Link>
          </nav>

          {/* Logo — centered */}
          <Link href="/"
            className={`absolute left-1/2 -translate-x-1/2 font-serif text-xl sm:text-2xl tracking-[0.2em] transition-colors duration-300 ${
              scrolled ? 'text-brand-black' : 'text-white'
            }`}>
            AST<span className="text-brand-orange">3</span>R
          </Link>

          {/* Right nav */}
          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-7">
              <Link href="/returns" className={`nav-link text-[11px] ${!scrolled ? 'text-white/70 hover:text-white' : ''}`}>
                Returns
              </Link>
              <Link href="https://instagram.com/ast3r.ph" target="_blank" className={`nav-link text-[11px] ${!scrolled ? 'text-white/70 hover:text-white' : ''}`}>
                Instagram
              </Link>
            </div>

            {/* Cart */}
            <div className={!scrolled ? '[&_button]:text-white' : ''}>
              <CartDrawer />
            </div>

            {/* Mobile menu */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`md:hidden flex flex-col gap-1.5 p-1 ${scrolled ? 'text-brand-black' : 'text-white'}`}
              aria-label="Menu">
              <span className={`block w-5 h-px bg-current transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block w-5 h-px bg-current transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block w-5 h-px bg-current transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <div className={`fixed inset-0 z-40 transition-all duration-300 ${menuOpen ? 'visible' : 'invisible'}`}>
        <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${menuOpen ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setMenuOpen(false)} />
        <div className={`absolute right-0 top-0 bottom-0 w-72 bg-white transition-transform duration-300 ${menuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex items-center justify-between px-6 h-16 border-b border-[#E8E6E2]">
            <span className="font-serif text-xl tracking-[0.2em]">AST<span className="text-brand-orange">3</span>R</span>
            <button onClick={() => setMenuOpen(false)} className="text-brand-gray hover:text-brand-black text-lg">✕</button>
          </div>
          <nav className="px-6 py-8 space-y-1">
            {[
              { label: 'Collections', href: '/#collections' },
              { label: 'Visit Store', href: '/store' },
              { label: 'Track Order', href: '/track' },
              { label: 'Returns', href: '/returns' },
              { label: 'Instagram', href: 'https://instagram.com/ast3r.ph' },
            ].map(({ label, href }) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between py-3.5 text-sm font-medium text-brand-black border-b border-[#F0EEE8] hover:text-brand-orange transition-colors">
                {label}
                <span className="text-brand-gray text-xs">→</span>
              </a>
            ))}
          </nav>
          <div className="absolute bottom-8 left-6 right-6">
            <p className="text-[11px] text-brand-gray">inquiry@ast3r.store</p>
            <p className="text-[11px] text-brand-gray">0966 960 6060</p>
          </div>
        </div>
      </div>
    </>
  );
}
