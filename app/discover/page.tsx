'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';

interface PubPlaylist {
  id: string;
  name: string;
  rating: number;
  publishedAt: string;
  updatedAt: string;
  owner: { username: string; avatarColor: string };
  itemCount: number;
  saveCount: number;
  preview: { thumbnail: string; title: string }[];
  voted: boolean;
  saved: boolean;
}

export default function DiscoverPage() {
  const { token } = useAuth();
  const [sort, setSort] = useState<'featured' | 'recent'>('featured');
  const [query, setQuery] = useState('');
  const [input, setInput] = useState('');
  const [playlists, setPlaylists] = useState<PubPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  const load = useCallback(async (q: string, s: string, p: number) => {
    setLoading(true);
    const res = await fetch(`/api/discover?q=${encodeURIComponent(q)}&sort=${s}&page=${p}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setPlaylists(data.playlists || []);
    setPages(data.pages || 1);
    setLoading(false);
  }, [token]);

  useEffect(() => { load(query, sort, page); }, [query, sort, page, load]);

  function doSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
    setQuery(input);
  }

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black mb-1">Descubrir playlists</h1>
          <p className="text-slate-500 text-sm">Playlists públicos de la comunidad · vota y guarda tus favoritos</p>
        </div>

        {/* Search + sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <form onSubmit={doSearch} className="flex gap-2 flex-1">
            <input
              className="input flex-1"
              placeholder="Buscar playlist o canción…"
              value={input}
              onChange={e => setInput(e.target.value)}
            />
            <button type="submit" className="btn-primary px-5">Buscar</button>
          </form>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => { setSort('featured'); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${sort === 'featured' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
              ⭐ Destacados
            </button>
            <button onClick={() => { setSort('recent'); setPage(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${sort === 'recent' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
              🕐 Recientes
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-3">🎵</div>
            <p className="text-slate-400">No se encontraron playlists</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {playlists.map(p => (
                <Link key={p.id} href={`/discover/${p.id}`}
                  className="group rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all p-4 block">
                  {/* Preview thumbnails */}
                  <div className="grid grid-cols-4 gap-1 mb-3 rounded-xl overflow-hidden h-16">
                    {p.preview.slice(0, 4).map((item, i) => (
                      item.thumbnail
                        ? <img key={i} src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                        : <div key={i} className="w-full h-full bg-white/5 flex items-center justify-center text-slate-600 text-xs">▶</div>
                    ))}
                    {Array(Math.max(0, 4 - p.preview.length)).fill(0).map((_, i) => (
                      <div key={`e${i}`} className="w-full h-full bg-white/5" />
                    ))}
                  </div>

                  <p className="text-white font-semibold text-sm line-clamp-1 mb-1">{p.name}</p>
                  <p className="text-slate-500 text-xs mb-3">
                    por <span className="text-slate-400">{p.owner.username}</span>
                    {' · '}{p.itemCount} canciones
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className={`flex items-center gap-1 ${p.voted ? 'text-amber-400' : ''}`}>
                      ⭐ {p.rating}
                    </span>
                    <span>💾 {p.saveCount}</span>
                    {p.saved && <span className="text-indigo-400 ml-auto">Guardada ✓</span>}
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="btn-ghost px-4 disabled:opacity-30">← Anterior</button>
                <span className="flex items-center text-slate-500 text-sm px-3">{page + 1} / {pages}</span>
                <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                  className="btn-ghost px-4 disabled:opacity-30">Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
