'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('verified') === 'true') setInfo('¡Correo verificado! Ya puedes iniciar sesión.');
    if (searchParams.get('error') === 'token_invalido') setError('El enlace de verificación es inválido o ya expiró.');
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.token, data.user);
      router.push('/');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold mb-6">Iniciar sesión</h1>

      {info && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm">
          {info}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Correo electrónico</label>
          <input
            type="email" className="input" placeholder="tu@correo.com"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm text-slate-400">Contraseña</label>
            <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            type="password" className="input" placeholder="Tu contraseña"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required
          />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
          {loading ? 'Iniciando sesión...' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="text-center text-slate-500 text-sm mt-6">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="text-indigo-400 hover:text-indigo-300">Regístrate gratis</Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black text-gradient">🎬 WatchRoom</Link>
          <p className="text-slate-400 mt-2">Bienvenido de vuelta</p>
        </div>
        <Suspense fallback={<div className="card p-8 text-center text-slate-500">Cargando...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
