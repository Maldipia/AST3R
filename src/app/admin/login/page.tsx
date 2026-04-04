// src/app/admin/login/page.tsx
'use client';

import { useState }  from 'react';
import { useRouter } from 'next/navigation';
import { supabase }  from '@/lib/supabase';
import toast         from 'react-hot-toast';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast.error('Invalid credentials.');
      setLoading(false);
      return;
    }

    // Check admin profile
    const { data: admin } = await supabase
      .from('admin_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (!admin) {
      await supabase.auth.signOut();
      toast.error('Access denied. Not an admin account.');
      setLoading(false);
      return;
    }

    toast.success(`Welcome back!`);
    router.push('/admin');
  };

  return (
    <div className="min-h-screen bg-brand-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-12">
          <span className="font-serif text-4xl tracking-[0.2em] text-brand-white">AST3R</span>
          <p className="text-brand-gray text-xs tracking-widest uppercase mt-2">Admin Portal</p>
          <div className="w-8 h-0.5 bg-brand-orange mx-auto mt-4" />
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs tracking-widest uppercase text-brand-gray mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ast3r.store"
              className="w-full bg-transparent border border-[#2A2A2A] text-brand-white px-4 py-3 text-sm placeholder:text-[#444] focus:outline-none focus:border-brand-orange transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs tracking-widest uppercase text-brand-gray mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-transparent border border-[#2A2A2A] text-brand-white px-4 py-3 text-sm placeholder:text-[#444] focus:outline-none focus:border-brand-orange transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-orange text-brand-white py-4 text-sm font-medium tracking-widest uppercase transition-all hover:bg-orange-600 disabled:opacity-50 mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-[#333] mt-8">
          AST3R Fashion Admin · Secure Access
        </p>
      </div>
    </div>
  );
}
