'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleLogout() {
    logout();
    router.push('/');
    setMenuOpen(false);
  }

  return (
    <nav className="glass sticky top-0 z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
          <span className="text-2xl">🎬</span>
          <span className="text-gradient">WatchRoom</span>
        </Link>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition-all"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
                  style={{ background: user.avatarColor }}
                >
                  {user.username[0].toUpperCase()}
                </div>
                <span className="text-sm text-slate-300 hidden sm:block">{user.username}</span>
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 glass rounded-xl shadow-2xl border border-white/5 py-1 z-50">

                  <Link
                    href={`/profile/${user.username}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>👤</span> Mi perfil
                  </Link>
                  <Link
                    href="/friends"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 text-sm text-slate-300 hover:text-white transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>👥</span> Amigos
                  </Link>
                  <hr className="border-white/5 my-1" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 text-sm text-red-400 hover:text-red-300 transition-colors"
                  >
                    <span>🚪</span> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="btn-ghost text-sm py-1.5">
                Iniciar sesión
              </Link>
              <Link href="/register" className="btn-primary text-sm py-1.5">
                Registrarse
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
