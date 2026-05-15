'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import VideoPlayer from '@/components/VideoPlayer';
import PlaybackPointsTracker from '@/components/PlaybackPointsTracker';
import { useAuth } from '@/contexts/AuthContext';
import { getHistory, buildTasteProfile, saveToHistory } from '@/lib/watchHistory';

type Platform = 'youtube' | 'twitch' | 'kick';

interface Suggestion {
  id: string;
  title: string;
  thumbnail?: string;
  channel: string;
  views?: number;
}

const PLATFORM_LABELS: Record<Platform, { name: string; color: string; icon: string }> = {
  youtube: { name: 'YouTube', color: '#ff0000', icon: '▶' },
  twitch:  { name: 'Twitch',  color: '#9146ff', icon: '🟣' },
  kick:    { name: 'Kick',    color: '#53fc18', icon: '🟢' },
};

const AUTOPLAY_SECS = 8;

function SidebarCard({ s, onPlay }: { s: Suggestion; onPlay: (s: Suggestion) => void }) {
  const [showPreview, setShowPreview] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onEnter() {
    timerRef.current = setTimeout(() => setShowPreview(true), 600);
  }
  function onLeave() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowPreview(false);
  }

  return (
    <button
      onClick={() => onPlay(s)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="w-full text-left group rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/40 transition-all bg-white/[0.03] hover:bg-white/[0.06]"
    >
      <div className="aspect-video relative bg-black">
        {showPreview ? (
          <iframe
            src={`https://www.youtube.com/embed/${s.id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0`}
            className="w-full h-full pointer-events-none"
            allow="autoplay"
          />
        ) : s.thumbnail ? (
          <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xl">▶</div>
        )}
        {/* Title overlay */}
        {!showPreview && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pt-4 pb-1.5">
            <p className="text-white text-[10px] font-medium line-clamp-2 leading-snug drop-shadow">{s.title}</p>
          </div>
        )}
        {!showPreview && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 rounded-full p-1.5">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>
      <div className="px-2 pb-1.5 pt-1">
        <p className="text-slate-500 text-[10px] truncate">{s.channel}</p>
      </div>
    </button>
  );
}

function SidebarSkeleton() {
  return (
    <>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="rounded-xl overflow-hidden border border-white/5">
          <div className="aspect-video bg-white/5 animate-pulse" />
          <div className="p-2 space-y-1.5">
            <div className="h-2.5 bg-white/5 rounded animate-pulse w-full" />
            <div className="h-2 bg-white/5 rounded animate-pulse w-2/3" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function WatchPage() {
  const params   = useParams();
  const router   = useRouter();
  const { user } = useAuth();

  const platform = params.platform as Platform;
  const initId   = params.id as string;

  const [currentId,    setCurrentId]    = useState(initId);
  const [videoTitle,   setVideoTitle]   = useState('');
  const [videoChannel, setVideoChannel] = useState('');
  const [suggestions,  setSuggestions]  = useState<Suggestion[]>([]);
  const [showSugg,     setShowSugg]     = useState(false);
  const [loadingSugg,  setLoadingSugg]  = useState(false);
  const [countdown,    setCountdown]    = useState(AUTOPLAY_SECS);
  const [leftSuggs,    setLeftSuggs]    = useState<Suggestion[]>([]);
  const [rightSuggs,   setRightSuggs]   = useState<Suggestion[]>([]);
  const [loadingLeft,  setLoadingLeft]  = useState(false);
  const [loadingRight, setLoadingRight] = useState(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cfg = PLATFORM_LABELS[platform] || PLATFORM_LABELS.youtube;

  // Fetch video info + save history
  useEffect(() => {
    if (platform !== 'youtube') return;
    fetch(`/api/videoinfo/${currentId}`)
      .then(r => r.json())
      .then(info => {
        setVideoTitle(info.title || currentId);
        setVideoChannel(info.channel || '');
        saveToHistory({
          id: info.id || currentId,
          platform,
          title: info.title || currentId,
          thumbnail: info.thumbnail || '',
          channel: info.channel || '',
          views: info.views,
          duration: info.duration,
        });
      })
      .catch(() => { setVideoTitle(currentId); setVideoChannel(''); });
  }, [currentId, platform]);

  // Fetch sidebar suggestions whenever video info updates
  useEffect(() => {
    if (platform !== 'youtube') return;
    if (!videoTitle && !videoChannel) return;

    // Left: same artist
    if (videoChannel) {
      setLoadingLeft(true);
      setLeftSuggs([]);
      fetch(`/api/search/youtube?q=${encodeURIComponent(videoChannel)}`)
        .then(r => r.json())
        .then(data => {
          const filtered = (data.results || []).filter((r: Suggestion) => r.id !== currentId);
          setLeftSuggs(filtered.slice(0, 8));
        })
        .catch(() => {})
        .finally(() => setLoadingLeft(false));
    }

    // Right: explore by taste profile
    const history = getHistory();
    const profile = buildTasteProfile(history);
    const watched = new Set(history.map((h: { id: string }) => h.id));
    watched.add(currentId);

    const queries: string[] = profile.queries.length > 0
      ? profile.queries.slice(0, 2)
      : [videoTitle || currentId];

    setLoadingRight(true);
    setRightSuggs([]);
    const seen = new Set<string>([currentId]);
    const results: Suggestion[] = [];

    Promise.all(queries.map(async (q: string) => {
      try {
        const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        (data.results || []).forEach((r: Suggestion) => {
          if (!watched.has(r.id) && !seen.has(r.id)) {
            seen.add(r.id);
            results.push(r);
          }
        });
      } catch {}
    })).then(() => {
      setRightSuggs(results.slice(0, 8));
      setLoadingRight(false);
    });

  }, [videoTitle, videoChannel, currentId, platform]);

  // End-of-video overlay suggestions
  const fetchSuggestions = useCallback(async (videoId: string) => {
    setLoadingSugg(true);
    setSuggestions([]);
    try {
      const history = getHistory();
      const profile = buildTasteProfile(history);
      const watched = new Set(history.map(h => h.id));
      watched.add(videoId);

      const queries = profile.queries.length > 0
        ? profile.queries.slice(0, 2)
        : [videoTitle || videoId];

      const allResults: Suggestion[] = [];
      const seen = new Set<string>();

      await Promise.all(queries.map(async (q) => {
        try {
          const res  = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          (data.results || []).forEach((r: Suggestion) => {
            if (!watched.has(r.id) && !seen.has(r.id)) {
              seen.add(r.id);
              allResults.push(r);
            }
          });
        } catch {}
      }));

      setSuggestions(allResults.slice(0, 6));
    } catch {}
    setLoadingSugg(false);
  }, [videoTitle]);

  const handleEnded = useCallback(() => {
    setShowSugg(true);
    setCountdown(AUTOPLAY_SECS);
    fetchSuggestions(currentId);
  }, [currentId, fetchSuggestions]);

  useEffect(() => {
    if (!showSugg || suggestions.length === 0) return;
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          playSuggestion(suggestions[0]);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [showSugg, suggestions]);

  function playSuggestion(s: Suggestion) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setShowSugg(false);
    setSuggestions([]);
    setCurrentId(s.id);
    window.history.replaceState(null, '', `/watch/${platform}/${s.id}`);
  }

  function cancelAutoplay() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(0);
  }

  if (!['youtube', 'twitch', 'kick'].includes(platform)) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl">Plataforma no válida</p>
          <Link href="/" className="btn-primary mt-4 inline-flex">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  const isYT = platform === 'youtube';

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      <div className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 text-sm transition-colors">
          ← Volver
        </button>

        {/* Platform badge */}
        <div className="flex items-center gap-2 mb-4">
          <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}>
            {cfg.icon} {cfg.name}
          </span>
          {(platform === 'twitch' || platform === 'kick') && (
            <span className="text-xs bg-red-600/20 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full font-bold">
              🔴 EN VIVO
            </span>
          )}
          {videoTitle && (
            <span className="text-slate-400 text-sm truncate max-w-md">{videoTitle}</span>
          )}
        </div>

        {/* 3-column layout */}
        <div className={`grid grid-cols-1 gap-4 items-start ${isYT ? 'lg:grid-cols-[220px_1fr_220px]' : ''}`}>

          {/* Left sidebar: same artist */}
          {isYT && (
            <aside className="hidden lg:block sticky top-4">
              <div className="flex flex-col gap-2.5 max-h-[calc(100vh-120px)] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-white/10">
                {loadingLeft ? <SidebarSkeleton /> : leftSuggs.length > 0
                  ? leftSuggs.map(s => <SidebarCard key={s.id} s={s} onPlay={playSuggestion} />)
                  : <p className="text-slate-700 text-xs text-center py-6">Sin sugerencias</p>
                }
              </div>
            </aside>
          )}

          {/* Center: video + actions */}
          <div>
            {user && <PlaybackPointsTracker />}
            <div className="relative">
              <VideoPlayer platform={platform} id={currentId} onEnded={handleEnded} />

              {/* End-of-video overlay */}
              {showSugg && (
                <div className="absolute inset-0 rounded-xl overflow-hidden flex flex-col"
                  style={{ background: 'rgba(5,5,15,0.93)', backdropFilter: 'blur(4px)' }}>

                  <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                    <h3 className="text-white font-bold text-base">A continuación</h3>
                    <button onClick={() => setShowSugg(false)}
                      className="text-slate-500 hover:text-white text-xl leading-none transition-colors">✕</button>
                  </div>

                  {loadingSugg ? (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex gap-1">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto px-4 pb-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {suggestions.map((s, i) => (
                          <button key={s.id} onClick={() => playSuggestion(s)}
                            className="group text-left rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/40 transition-all hover:scale-[1.03] bg-white/[0.03] hover:bg-white/[0.06]">
                            <div className="aspect-video relative bg-black">
                              {s.thumbnail
                                ? <img src={s.thumbnail} alt={s.title} className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-2xl text-slate-600">▶</div>
                              }
                              {i === 0 && countdown > 0 && (
                                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                                  ▶ {countdown}s
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 rounded-full p-2">
                                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{s.title}</p>
                              <p className="text-slate-500 text-[11px] truncate mt-0.5">{s.channel}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {countdown > 0 && suggestions.length > 0 && (
                    <div className="shrink-0 flex items-center justify-center gap-3 px-4 py-3 border-t border-white/5">
                      <span className="text-slate-400 text-xs">
                        Reproduciendo siguiente en <span className="text-white font-bold">{countdown}s</span>
                      </span>
                      <button onClick={cancelAutoplay}
                        className="text-xs px-3 py-1 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={`/room/${platform}/${currentId}`} className="btn-primary gap-2 text-sm">
                <span>🏠</span> Entrar a la sala inmersiva
              </Link>
              {!user && (
                <p className="text-slate-500 text-sm">
                  <Link href="/login" className="text-indigo-400 hover:underline">Inicia sesión</Link>{' '}
                  para guardar favoritos e invitar amigos
                </p>
              )}
            </div>

            {/* Sala inmersiva CTA */}
            <div className="mt-6 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/20">
              <div className="flex items-center gap-4">
                <div className="text-5xl">🏠</div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg text-white">Sala Inmersiva</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    Entra a una sala virtual donde puedes caminar, ver el contenido en una pantalla gigante y chatear con otras personas.
                  </p>
                </div>
                <Link href={`/room/${platform}/${currentId}`} className="btn-primary shrink-0">Entrar</Link>
              </div>
            </div>
          </div>

          {/* Right sidebar: explore similar style */}
          {isYT && (
            <aside className="hidden lg:block sticky top-4">
              <div className="flex flex-col gap-2.5 max-h-[calc(100vh-120px)] overflow-y-auto pr-0.5 scrollbar-thin scrollbar-thumb-white/10">
                {loadingRight ? <SidebarSkeleton /> : rightSuggs.length > 0
                  ? rightSuggs.map(s => <SidebarCard key={s.id} s={s} onPlay={playSuggestion} />)
                  : <p className="text-slate-700 text-xs text-center py-6">Sin sugerencias</p>
                }
              </div>
            </aside>
          )}

        </div>
      </div>
    </div>
  );
}
