'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import AudioKeepAlive from '@/components/AudioKeepAlive';
import { useAuth } from '@/contexts/AuthContext';

interface PubItem {
  id: string;
  videoId: string;
  platform: string;
  title: string;
  thumbnail: string;
  channel: string;
  position: number;
}

interface PubPlaylist {
  id: string;
  name: string;
  rating: number;
  publishedAt: string;
  updatedAt: string;
  owner: { username: string; avatarColor: string };
  saveCount: number;
  items: PubItem[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function DiscoverPlaylistPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();

  const pubId = params.pubId as string;

  const [playlist,    setPlaylist]    = useState<PubPlaylist | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [notFound,    setNotFound]    = useState(false);
  const [isOwner,     setIsOwner]     = useState(false);
  const [voted,       setVoted]       = useState(false);
  const [rating,      setRating]      = useState(0);
  const [saved,       setSaved]       = useState(false);
  const [savedId,     setSavedId]     = useState<string | null>(null);
  const [hasUpdates,  setHasUpdates]  = useState(false);
  const [savingAction, setSavingAction] = useState('');

  const [order,        setOrder]        = useState<PubItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode,         setMode]         = useState<'sequence' | 'shuffle'>('sequence');
  const [audioStarted, setAudioStarted] = useState(false);
  const [resolvedTitles, setResolvedTitles] = useState<Record<string, string>>({});

  const orderRef = useRef<PubItem[]>([]);
  useEffect(() => { orderRef.current = order; }, [order]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/discover/${pubId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setPlaylist(d.playlist);
        setIsOwner(d.isOwner);
        setVoted(d.voted);
        setRating(d.playlist.rating);
        setSaved(!!d.saved);
        setSavedId(d.saved?.localPlaylistId ?? null);
        setHasUpdates(d.hasUpdates);
        const sorted = [...d.playlist.items].sort((a: PubItem, b: PubItem) => a.position - b.position);
        setOrder(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [pubId, token]);

  // Rebuild order on mode change
  useEffect(() => {
    if (!playlist) return;
    const sorted = [...playlist.items].sort((a, b) => a.position - b.position);
    setOrder(mode === 'shuffle' ? shuffleArray(sorted) : sorted);
    setCurrentIndex(0);
  }, [mode, playlist]);

  // Resolve ID-like titles via oEmbed
  useEffect(() => {
    if (!order.length) return;
    order.filter(i => i.platform === 'youtube' && /^[A-Za-z0-9_-]{10,12}$/.test(i.title)).forEach(item => {
      fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${item.videoId}&format=json`)
        .then(r => r.json())
        .then((info: { title?: string }) => {
          if (info.title) setResolvedTitles(prev => ({ ...prev, [item.videoId]: info.title! }));
        })
        .catch(() => {});
    });
  }, [order]);

  const currentItem = order[currentIndex] ?? null;
  const nextItem    = order.length > 1 ? order[(currentIndex + 1) % order.length] : null;
  const prevItem    = order.length > 1 ? order[currentIndex > 0 ? currentIndex - 1 : order.length - 1] : null;

  const goNext = useCallback(() => {
    flushSync(() => {
      setCurrentIndex(i => {
        const next = i + 1;
        return next < orderRef.current.length ? next : 0;
      });
    });
  }, []);

  const goPrev = useCallback(() => {
    flushSync(() => {
      setCurrentIndex(i => (i > 0 ? i - 1 : orderRef.current.length - 1));
    });
  }, []);

  async function handleVote() {
    if (!token) { router.push('/login'); return; }
    if (isOwner) return;
    setSavingAction('vote');
    const res = await fetch(`/api/discover/${pubId}/vote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setVoted(data.voted);
      setRating(r => data.voted ? r + 1 : r - 1);
    }
    setSavingAction('');
  }

  async function handleSave() {
    if (!token) { router.push('/login'); return; }
    setSavingAction('save');
    const res = await fetch(`/api/discover/${pubId}/save`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setSaved(true);
      setSavedId(data.localPlaylistId);
    }
    setSavingAction('');
  }

  async function handleSync() {
    if (!token) return;
    setSavingAction('sync');
    const res = await fetch(`/api/discover/${pubId}/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setHasUpdates(false);
      setSavedId(data.localPlaylistId);
    }
    setSavingAction('');
  }

  if (notFound) return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">📋</div>
        <p className="text-slate-400">Playlist no encontrado</p>
        <Link href="/discover" className="btn-primary mt-4 inline-flex">Explorar</Link>
      </div>
    </div>
  );

  if (loading || !playlist) return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center">
      <div className="animate-pulse text-slate-500">Cargando playlist...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Back */}
        <Link href="/discover" className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm transition-colors w-fit">
          ← Explorar playlists
        </Link>

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold mb-1">{playlist.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-400">
            <span>por <Link href={`/profile/${playlist.owner.username}`}
              className="text-indigo-400 hover:underline">{playlist.owner.username}</Link></span>
            <span>· {playlist.items.length} canciones</span>
            <span>· ⭐ {rating} puntos</span>
            <span>· 💾 {playlist.saveCount} guardados</span>
          </div>
        </div>

        {/* Updates banner */}
        {hasUpdates && saved && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <span className="text-xl shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Hay actualizaciones disponibles</p>
              <p className="text-slate-400 text-xs mt-0.5">
                El creador actualizó este playlist el {new Date(playlist.updatedAt).toLocaleDateString('es', { day: 'numeric', month: 'long' })}.
                Actualizar reemplazará las canciones de tu copia guardada con la versión nueva.
              </p>
            </div>
            <button onClick={handleSync} disabled={savingAction === 'sync'}
              className="btn-primary text-sm px-4 shrink-0 disabled:opacity-50">
              {savingAction === 'sync' ? 'Actualizando…' : 'Actualizar playlist'}
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {/* Mode */}
          <button onClick={() => setMode('sequence')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'sequence' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            ▶ En secuencia
          </button>
          <button onClick={() => setMode('shuffle')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${mode === 'shuffle' ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
            🔀 Aleatorio
          </button>

          <div className="ml-auto flex gap-2">
            {/* Vote — only non-owners */}
            {!isOwner && user && (
              <button onClick={handleVote} disabled={savingAction === 'vote'}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${voted ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                {savingAction === 'vote' ? '…' : voted ? '⭐ Votado' : '⭐ +1 Punto'}
              </button>
            )}

            {/* Save — only non-owners */}
            {!isOwner && user && !saved && (
              <button onClick={handleSave} disabled={savingAction === 'save'}
                className="btn-primary text-sm px-4 disabled:opacity-50">
                {savingAction === 'save' ? 'Guardando…' : '💾 Guardar playlist'}
              </button>
            )}
            {!isOwner && saved && savedId && (
              <Link href={`/playlists/${savedId}`}
                className="btn-ghost text-sm px-4 text-indigo-400">
                ✓ Ver mi copia
              </Link>
            )}

            {/* Login prompt */}
            {!user && (
              <Link href="/login" className="btn-primary text-sm px-4">
                Inicia sesión para guardar
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Player */}
          <div>
            {currentItem && (
              <>
                <AudioKeepAlive active={audioStarted} />
                <VideoPlayer
                  platform={currentItem.platform as 'youtube' | 'twitch' | 'kick'}
                  id={currentItem.videoId}
                  nextId={nextItem?.videoId}
                  prevId={prevItem?.videoId}
                  onEnded={goNext}
                  onNextTrack={goNext}
                  onPrevTrack={goPrev}
                  onVideoData={({ title }) => {
                    setResolvedTitles(prev => ({ ...prev, [currentItem.videoId]: title }));
                    setAudioStarted(true);
                  }}
                  autoplay
                  title={resolvedTitles[currentItem.videoId] || currentItem.title}
                  thumbnail={currentItem.thumbnail}
                />
                <div className="mt-4">
                  <p className="text-white font-semibold text-base line-clamp-2">
                    {resolvedTitles[currentItem.videoId] || currentItem.title}
                  </p>
                  {currentItem.channel && <p className="text-slate-400 text-sm mt-1">{currentItem.channel}</p>}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={goPrev} disabled={order.length <= 1} className="btn-ghost px-5 disabled:opacity-30">⏮ Anterior</button>
                  <span className="text-slate-500 text-sm">{currentIndex + 1} / {order.length}</span>
                  <button onClick={goNext} disabled={order.length <= 1} className="btn-primary px-5 disabled:opacity-30">Siguiente ⏭</button>
                </div>
              </>
            )}
          </div>

          {/* Queue */}
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
                    {item.channel && <p className="text-[11px] text-slate-600 truncate mt-0.5">{item.channel}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
