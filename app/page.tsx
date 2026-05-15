'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';

const HomeRecommendations = dynamic(() => import('@/components/HomeRecommendations'), { ssr: false });

type Platform = 'youtube' | 'twitch' | 'kick';

interface SearchResult {
  id: string;
  title: string;
  thumbnail?: string;
  channel: string;
  description?: string;
  publishedAt?: string;
  isLive?: boolean;
  gameName?: string;
  viewers?: number;
  category?: string;
  platform: Platform;
}

const PLATFORM_CONFIG: Record<Platform, { label: string; color: string; icon: string; placeholder: string }> = {
  youtube: { label: 'YouTube', color: '#ff0000', icon: '▶', placeholder: 'Buscar videos en YouTube...' },
  twitch: { label: 'Twitch', color: '#9146ff', icon: '🟣', placeholder: 'Buscar canales en Twitch...' },
  kick: { label: 'Kick', color: '#53fc18', icon: '🟢', placeholder: 'Buscar canales en Kick...' },
};

export default function HomePage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nextPageToken, setNextPageToken] = useState('');

  const search = useCallback(async (q: string, append = false) => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/search/${platform}?q=${encodeURIComponent(q)}${append && nextPageToken ? `&pageToken=${nextPageToken}` : ''}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults((prev) => (append ? [...prev, ...(data.results || [])] : data.results || []));
      setNextPageToken(data.nextPageToken || '');
    } catch (e: any) {
      setError(e.message || 'Error al buscar');
    } finally {
      setLoading(false);
    }
  }, [platform, nextPageToken]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResults([]);
    setNextPageToken('');
    search(query);
  }

  function handlePlatformChange(p: Platform) {
    setPlatform(p);
    setResults([]);
    setQuery('');
    setError('');
  }

  function openWatch(result: SearchResult) {
    router.push(`/watch/${result.platform}/${result.id}`);
  }

  const cfg = PLATFORM_CONFIG[platform];

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center relative">
          <h1 className="text-4xl sm:text-5xl font-black mb-4">
            Ve contenido con{' '}
            <span className="text-gradient">tus amigos</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-10">
            YouTube, Twitch y Kick sin anuncios. Crea salas inmersivas, camina, chatea y ve en grupo.
          </p>

          {/* Platform tabs */}
          <div className="flex justify-center gap-2 mb-6">
            {(Object.keys(PLATFORM_CONFIG) as Platform[]).map((p) => {
              const c = PLATFORM_CONFIG[p];
              return (
                <button
                  key={p}
                  onClick={() => handlePlatformChange(p)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                    platform === p
                      ? 'text-white shadow-lg scale-105'
                      : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10'
                  }`}
                  style={platform === p ? { background: c.color + '22', border: `1px solid ${c.color}55`, color: c.color } : {}}
                >
                  <span>{c.icon}</span>
                  {c.label}
                  {p !== 'youtube' && <span className="text-xs bg-white/10 px-1.5 py-0.5 rounded-full">Live</span>}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl mx-auto">
            <input
              className="input flex-1 text-base"
              placeholder={cfg.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-primary px-6 shrink-0"
            >
              {loading ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                'Buscar'
              )}
            </button>
          </form>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="max-w-7xl mx-auto px-4 pb-16">
        {results.length === 0 && !loading && (
          <>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">
                {platform === 'youtube' ? '▶' : platform === 'twitch' ? '🟣' : '🟢'}
              </div>
              <p className="text-slate-500 text-lg">Busca tu contenido favorito en {cfg.label}</p>
              <p className="text-slate-600 text-sm mt-2">Sin anuncios, en grupo y de forma inmersiva</p>
            </div>
            <HomeRecommendations />
          </>
        )}

        {results.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {results.map((r, i) => (
                <button
                  key={`${r.id}-${i}`}
                  onClick={() => openWatch(r)}
                  className="group text-left bg-white/3 hover:bg-white/6 border border-white/5 hover:border-white/10 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02]"
                >
                  <div className="aspect-video relative bg-black">
                    {r.thumbnail ? (
                      <img
                        src={r.thumbnail}
                        alt={r.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">
                        {cfg.icon}
                      </div>
                    )}
                    {r.isLive && (
                      <span className="absolute top-1.5 left-1.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                        EN VIVO
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 rounded-full p-3">
                        <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-white text-xs font-medium line-clamp-2 mb-1">{r.title}</p>
                    <p className="text-slate-500 text-[11px] truncate">{r.channel}</p>
                    {r.gameName && <p className="text-indigo-400 text-[10px] truncate">{r.gameName}</p>}
                    {r.viewers && (
                      <p className="text-slate-500 text-[10px]">{r.viewers.toLocaleString()} espectadores</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {nextPageToken && (
              <div className="text-center mt-8">
                <button
                  onClick={() => search(query, true)}
                  disabled={loading}
                  className="btn-ghost px-8"
                >
                  {loading ? 'Cargando...' : 'Cargar más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
