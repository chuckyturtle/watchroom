'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import { useAuth } from '@/contexts/AuthContext';

interface PlaylistItem {
  id: string;
  videoId: string;
  platform: string;
  title: string;
  thumbnail: string;
  channel: string;
  position: number;
}

interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
}

type ShuffleMode = 'sequence' | 'shuffle';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PlaylistPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();

  const playlistId = params.id as string;

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [mode, setMode] = useState<ShuffleMode>('sequence');
  const [order, setOrder] = useState<PlaylistItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // resolved titles: videoId -> title (populated from YT player or oEmbed)
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>({});
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const orderRef = useRef<PlaylistItem[]>([]);
  const currentIndexRef = useRef(0);

  useEffect(() => { orderRef.current = order; }, [order]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Fetch real titles via YouTube oEmbed (free, no API key) for items stored with raw ID as title
  useEffect(() => {
    if (!order.length) return;
    const needsFetch = order.filter(
      item => item.platform === 'youtube' && /^[A-Za-z0-9_-]{10,12}$/.test(item.title)
    );
    if (!needsFetch.length) return;
    needsFetch.forEach(item => {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${item.videoId}&format=json`)
        .then(r => r.json())
        .then((info: { title?: string; author_name?: string }) => {
          if (info.title) {
            setResolvedTitles(prev => ({ ...prev, [item.videoId]: info.title! }));
          }
        })
        .catch(() => {});
    });
  }, [order]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => {
        if (!d?.playlist) return;
        setPlaylist(d.playlist);
        setNewName(d.playlist.name);
        const sorted = [...d.playlist.items].sort((a, b) => a.position - b.position);
        setOrder(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [playlistId, token]);

  // When mode changes, rebuild the order array
  useEffect(() => {
    if (!playlist) return;
    const sorted = [...playlist.items].sort((a, b) => a.position - b.position);
    const newOrder = mode === 'shuffle' ? shuffleArray(sorted) : sorted;
    setOrder(newOrder);
    setCurrentIndex(0);
  }, [mode, playlist]);

  const currentItem = order[currentIndex] ?? null;

  const goNext = useCallback(() => {
    setCurrentIndex(i => {
      const next = i + 1;
      return next < orderRef.current.length ? next : 0;
    });
  }, []);

  const goPrev = useCallback(() => {
    setCurrentIndex(i => (i > 0 ? i - 1 : orderRef.current.length - 1));
  }, []);

  async function renamePlaylist() {
    if (!token || !newName.trim()) return;
    setSavingName(true);
    const res = await fetch(`/api/playlists/${playlistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      setPlaylist(p => p ? { ...p, name: newName.trim() } : p);
      setIsRenaming(false);
    }
    setSavingName(false);
  }

  async function removeItem(item: PlaylistItem) {
    if (!token) return;
    setRemovingId(item.id);
    const res = await fetch(`/api/playlists/${playlistId}/items/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const updatedItems = playlist!.items.filter(i => i.id !== item.id);
      setPlaylist(p => p ? { ...p, items: updatedItems } : p);
      const newOrder = order.filter(i => i.id !== item.id);
      setOrder(newOrder);
      // Adjust index if needed
      setCurrentIndex(ci => {
        const removedIdx = order.findIndex(i => i.id === item.id);
        if (removedIdx < ci) return ci - 1;
        if (removedIdx === ci && ci >= newOrder.length) return Math.max(0, newOrder.length - 1);
        return ci;
      });
    }
    setRemovingId(null);
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-4">Debes iniciar sesión para ver tus listas</p>
          <Link href="/login" className="btn-primary">Iniciar sesión</Link>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-slate-400 text-lg">Lista no encontrada</p>
          <button onClick={() => router.back()} className="btn-primary mt-4">Volver</button>
        </div>
      </div>
    );
  }

  if (loading || !playlist) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Cargando lista...</div>
      </div>
    );
  }

  if (playlist.items.length === 0) {
    return (
      <div className="min-h-screen bg-surface-900">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-10 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h1 className="text-2xl font-bold mb-2">{playlist.name}</h1>
          <p className="text-slate-400 mb-6">Esta lista está vacía. Agrega videos desde la página de reproducción.</p>
          <button onClick={() => router.back()} className="btn-primary">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm transition-colors">
          ← Volver
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          {isRenaming ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                className="input flex-1 text-lg font-bold"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') renamePlaylist(); if (e.key === 'Escape') setIsRenaming(false); }}
                autoFocus
                maxLength={60}
              />
              <button onClick={renamePlaylist} disabled={savingName} className="btn-primary px-4">
                {savingName ? '...' : 'Guardar'}
              </button>
              <button onClick={() => setIsRenaming(false)} className="btn-ghost px-4">Cancelar</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{playlist.name}</h1>
              <button onClick={() => setIsRenaming(true)}
                className="text-slate-500 hover:text-white transition-colors text-sm shrink-0">
                ✏️
              </button>
            </div>
          )}
          <span className="text-slate-500 text-sm shrink-0">{playlist.items.length} videos</span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setMode('sequence')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'sequence' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            ▶ En secuencia
          </button>
          <button
            onClick={() => setMode('shuffle')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'shuffle' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            🔀 Aleatorio
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Player */}
          <div>
            {currentItem && (
              <>
                <VideoPlayer
                  platform={currentItem.platform as 'youtube' | 'twitch' | 'kick'}
                  id={currentItem.videoId}
                  onEnded={goNext}
                  onVideoData={({ title }) =>
                    setResolvedTitles(prev => ({ ...prev, [currentItem.videoId]: title }))
                  }
                  autoplay
                  title={resolvedTitles[currentItem.videoId] || currentItem.title}
                  thumbnail={currentItem.thumbnail}
                />

                <div className="mt-4">
                  <p className="text-white font-semibold text-base line-clamp-2">
                    {resolvedTitles[currentItem.videoId] || currentItem.title}
                  </p>
                  {currentItem.channel && (
                    <p className="text-slate-400 text-sm mt-1">{currentItem.channel}</p>
                  )}
                </div>

                {/* Prev / Next controls */}
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={goPrev} disabled={order.length <= 1}
                    className="btn-ghost px-5 disabled:opacity-30">
                    ⏮ Anterior
                  </button>
                  <span className="text-slate-500 text-sm">
                    {currentIndex + 1} / {order.length}
                  </span>
                  <button onClick={goNext} disabled={order.length <= 1}
                    className="btn-primary px-5 disabled:opacity-30">
                    Siguiente ⏭
                  </button>
                </div>

                {/* Open in room */}
                <div className="mt-4">
                  <Link href={`/room/${currentItem.platform}/${currentItem.videoId}`}
                    className="btn-ghost text-sm gap-2">
                    🏠 Abrir en sala inmersiva
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* Queue list */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5">
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Cola de reproducción</p>
            </div>
            <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
              {order.map((item, idx) => (
                <div key={item.id}
                  className={`flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.04] cursor-pointer transition-colors group ${idx === currentIndex ? 'bg-indigo-600/15' : 'hover:bg-white/[0.04]'}`}
                  onClick={() => setCurrentIndex(idx)}>

                  <div className="relative shrink-0 w-16 aspect-video rounded-lg overflow-hidden bg-black">
                    {item.thumbnail
                      ? <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-slate-600 text-sm">▶</div>
                    }
                    {idx === currentIndex && (
                      <div className="absolute inset-0 bg-indigo-600/40 flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium line-clamp-2 leading-snug ${idx === currentIndex ? 'text-indigo-300' : 'text-slate-300'}`}>
                      {resolvedTitles[item.videoId] || item.title}
                    </p>
                    {item.channel && (
                      <p className="text-[11px] text-slate-600 truncate mt-0.5">{item.channel}</p>
                    )}
                  </div>

                  <button
                    onClick={e => { e.stopPropagation(); removeItem(item); }}
                    disabled={removingId === item.id}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-sm disabled:opacity-50">
                    {removingId === item.id ? '...' : '✕'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
