// src/app/store/page.tsx
import Header from '@/components/Header';
import Link   from 'next/link';

export default function StorePage() {
  return (
    <>
      <Header />
      <main className="min-h-screen pt-16 bg-brand-cream">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <span className="block w-12 h-0.5 bg-brand-orange mx-auto mb-4" />
            <h1 className="font-serif text-4xl text-brand-black mb-3">Visit Our Store</h1>
            <p className="text-brand-gray">Walk-in orders, fittings, and pick-ups welcome!</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* Store info */}
            <div className="bg-white border border-brand-light p-8 space-y-5">
              <h2 className="font-serif text-2xl text-brand-black">AST3R Boutique</h2>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">📍</span>
                  <div>
                    <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-1">Address</p>
                    <p className="text-sm text-brand-black">Tagaytay City, Cavite 4120<br />Philippines</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">🕐</span>
                  <div>
                    <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-1">Store Hours</p>
                    <div className="text-sm text-brand-black space-y-0.5">
                      <p>Monday – Saturday: 9:00 AM – 6:00 PM</p>
                      <p className="text-brand-gray">Sunday: By appointment only</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">📞</span>
                  <div>
                    <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-1">Contact</p>
                    <a href="tel:09669606060" className="text-sm text-brand-black hover:text-brand-orange transition-colors block">0966 960 6060</a>
                    <a href="mailto:inquiry@ast3r.store" className="text-sm text-brand-black hover:text-brand-orange transition-colors block">inquiry@ast3r.store</a>
                  </div>
                </div>

                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">🚗</span>
                  <div>
                    <p className="text-xs font-medium tracking-widest uppercase text-brand-gray mb-1">Getting Here</p>
                    <p className="text-sm text-brand-gray leading-relaxed">
                      Located in Tagaytay City, approximately 50km south of Manila. 
                      Accessible via STAR Tollway or Aguinaldo Highway.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-brand-light">
                <p className="text-xs text-brand-gray mb-3">Walk-in services:</p>
                <div className="flex flex-wrap gap-2">
                  {['Try-on & Fitting','Cash on Pick-up (COP)','Same-day Pick-up','Order Consultation'].map(s => (
                    <span key={s} className="text-xs border border-brand-light px-3 py-1.5 text-brand-gray">{s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="bg-white border border-brand-light overflow-hidden">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d30891.47!2d120.92!3d14.11!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33bd5b6c7de2ef85%3A0x5c19d51cce6f3580!2sTagaytay%2C%20Cavite!5e0!3m2!1sen!2sph!4v1"
                width="100%"
                height="350"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="AST3R Store Location"
              />
              <div className="p-4">
                <a href="https://maps.google.com/?q=Tagaytay+City+Cavite+Philippines"
                  target="_blank" rel="noopener noreferrer"
                  className="btn-outline py-2.5 px-5 text-xs inline-block">
                  📍 Open in Google Maps
                </a>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link href="/" className="text-xs text-brand-gray underline hover:text-brand-black">
              ← Back to Shop
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
