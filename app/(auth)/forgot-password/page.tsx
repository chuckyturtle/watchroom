'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-black text-gradient">🎬 WatchRoom</Link>
        </div>

        <div className="card p-8">
          {sent ? (
            <div className="text-center">
              <div className="text-5xl mb-4">📧</div>
              <h2 className="text-xl font-bold mb-2">¡Revisa tu correo!</h2>
              <p className="text-slate-400 text-sm">
                Si ese correo está registrado, te enviamos un enlace para restablecer tu contraseña.
                El enlace expira en 1 hora.
              </p>
              <Link href="/login" className="btn-ghost mt-6 inline-flex">
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold mb-2">Recuperar contraseña</h1>
              <p className="text-slate-400 text-sm mb-6">
                Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1.5">Correo electrónico</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="tu@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                  {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                </button>
              </form>

              <p className="text-center text-slate-500 text-sm mt-6">
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
                  ← Volver al inicio de sesión
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
