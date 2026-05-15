'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.token, data.user);
      setSuccess(data.message);
      setTimeout(() => router.push('/'), 1500);
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
          <p className="text-slate-400 mt-2">Crea tu cuenta gratis</p>
        </div>

        <div className="card p-8">
          <h1 className="text-2xl font-bold mb-6">Registrarse</h1>

          {success ? (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-center">
              <div className="text-3xl mb-2">✅</div>
              {success}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Correo electrónico</label>
                <input
                  type="email"
                  className="input"
                  placeholder="tu@correo.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Nombre de usuario</label>
                <input
                  type="text"
                  className="input"
                  placeholder="mi_usuario"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  minLength={3}
                  maxLength={20}
                />
                <p className="text-xs text-slate-600 mt-1">Solo letras, números y guiones bajos (3-20 caracteres)</p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1.5">Confirmar contraseña</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Repite tu contraseña"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-base mt-2">
                {loading ? 'Creando cuenta...' : 'Crear cuenta'}
              </button>
            </form>
          )}

          <p className="text-center text-slate-500 text-sm mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Inicia sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
