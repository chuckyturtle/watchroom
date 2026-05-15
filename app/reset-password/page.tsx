'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-red-400">Enlace inválido o expirado.</p>
        <Link href="/forgot-password" className="btn-primary mt-4 inline-flex">Solicitar nuevo enlace</Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-8">
      {success ? (
        <div className="text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-2">¡Contraseña actualizada!</h2>
          <p className="text-slate-400 text-sm">Redirigiendo al inicio de sesión...</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold mb-2">Nueva contraseña</h1>
          <p className="text-slate-400 text-sm mb-6">Elige una nueva contraseña segura.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Nueva contraseña</label>
              <input type="password" className="input" placeholder="Mínimo 6 caracteres"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                required minLength={6} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1.5">Confirmar contraseña</label>
              <input type="password" className="input" placeholder="Repite la contraseña"
                value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
            </div>
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3">
              {loading ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black text-gradient">🎬 WatchRoom</Link>
        </div>
        <Suspense fallback={<div className="card p-8 text-center text-slate-500">Cargando...</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
