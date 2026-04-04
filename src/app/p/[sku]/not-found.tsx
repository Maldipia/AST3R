// src/app/p/[sku]/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-cream">
      <div className="text-center px-4 animate-fade-up">
        <span className="font-serif text-8xl font-light text-brand-light">404</span>
        <h1 className="display-md text-brand-black mt-4 mb-3">Product Not Found</h1>
        <p className="text-brand-gray text-sm mb-8 max-w-sm mx-auto">
          The product you&apos;re looking for doesn&apos;t exist or may have been removed.
        </p>
        <Link href="/" className="btn-primary">
          Back to Home
        </Link>
        <p className="mt-6 text-xs text-brand-gray">
          Need help? <a href="mailto:inquiry@ast3r.store" className="underline hover:text-brand-black">inquiry@ast3r.store</a>
        </p>
      </div>
    </div>
  );
}
