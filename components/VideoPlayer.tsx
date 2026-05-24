'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

type Platform = 'youtube' | 'twitch' | 'kick';

interface VideoPlayerProps {
  platform: Platform;
  id: string;
  nextId?: string;   // precomputed next-video id — loaded directly in Media Session handler
  prevId?: string;   // precomputed prev-video id
  onEnded?: () => void;
  onVideoData?: (data: { title: string; author: string }) => void;
  onNextTrack?: () => void;
  onPrevTrack?: () => void;
  blocked?: boolean;
  title?: string;
  thumbnail?: string;
  autoplay?: boolean;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
    _ytReadyCallbacks?: Array<() => void>;
  }
}

function loadYouTubeAPI(): Promise<void> {
  return new Promise(resolve => {
    if (typeof window === 'undefined') return;
    if (window.YT?.Player) { resolve(); return; }
    if (!window._ytReadyCallbacks) window._ytReadyCallbacks = [];
    window._ytReadyCallbacks.push(resolve);
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        window._ytReadyCallbacks?.forEach(cb => cb());
        window._ytReadyCallbacks = [];
      };
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

export default function VideoPlayer({
  platform, id, nextId, prevId,
  onEnded, onVideoData, onNextTrack, onPrevTrack,
  blocked, title, thumbnail, autoplay,
}: VideoPlayerProps) {
  const [embedError, setEmbedError] = useState(false);
  const containerRef      = useRef<HTMLDivElement>(null);
  const iframeRef         = useRef<HTMLIFrameElement>(null);
  const playerRef         = useRef<any>(null);
  const playerReadyRef    = useRef(false);
  const isPausedRef       = useRef(false);
  const hasEndedRef       = useRef(false);
  // Track last id loaded directly (from Media Session handler) to avoid double-load
  const lastLoadedIdRef   = useRef(id);
  const reapplyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // Keep all callback and data refs current so closures never go stale
  const onEndedRef     = useRef(onEnded);
  const onVideoDataRef = useRef(onVideoData);
  const onNextTrackRef = useRef(onNextTrack);
  const onPrevTrackRef = useRef(onPrevTrack);
  const nextIdRef      = useRef(nextId);
  const prevIdRef      = useRef(prevId);
  useEffect(() => { onEndedRef.current     = onEnded;     }, [onEnded]);
  useEffect(() => { onVideoDataRef.current = onVideoData; }, [onVideoData]);
  useEffect(() => { onNextTrackRef.current = onNextTrack; }, [onNextTrack]);
  useEffect(() => { onPrevTrackRef.current = onPrevTrack; }, [onPrevTrack]);
  useEffect(() => { nextIdRef.current      = nextId;      }, [nextId]);
  useEffect(() => { prevIdRef.current      = prevId;      }, [prevId]);

  // ── Synchronous video-swap for existing player ───────────────────────────
  // useLayoutEffect fires synchronously within flushSync, so on-page buttons
  // (Siguiente/Anterior) still work via the React re-render path.
  // When triggered from the Media Session handler (lock screen), lastLoadedIdRef
  // is already set to the new id, so we skip the redundant load.
  useLayoutEffect(() => {
    if (platform !== 'youtube') return;
    if (!playerRef.current || !playerReadyRef.current) return;
    if (lastLoadedIdRef.current === id) return;
    lastLoadedIdRef.current = id;
    hasEndedRef.current = false;
    if (autoplay) {
      playerRef.current.loadVideoById(id);
    } else {
      playerRef.current.cueVideoById(id);
    }
  }, [platform, id, autoplay]);

  // ── YouTube IFrame API ────────────────────────────────────────────────────
  useEffect(() => {
    if (platform !== 'youtube') return;

    hasEndedRef.current = false;

    // useLayoutEffect handles video-loading for existing player
    if (playerRef.current && playerReadyRef.current) return;

    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;

      const div = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(div);

      const player = new window.YT.Player(div, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          playsinline: 1,
          autoplay: autoplay ? 1 : 0,
          origin: window.location.origin,
        },
        events: {
          onReady(e: any) {
            playerReadyRef.current = true;
            playerRef.current = e.target;
            const iframe: HTMLIFrameElement | undefined = e.target.getIframe?.();
            if (iframe) {
              iframe.style.width    = '100%';
              iframe.style.height   = '100%';
              iframe.style.position = 'absolute';
              iframe.style.top      = '0';
              iframe.style.left     = '0';
            }
            if (autoplay) e.target.playVideo();
            // Override YouTube's own Media Session setup that runs on ready
            setTimeout(() => applyMediaSessionRef.current?.(), 200);
          },
          onStateChange(e: any) {
            const s: number = e.data;
            if (s === 1) {
              isPausedRef.current = false;
              const data = e.target.getVideoData?.();
              if (data?.title) onVideoDataRef.current?.({ title: data.title, author: data.author || '' });
              // Start a persistent re-apply interval while playing —
              // YouTube's iframe keeps re-registering its own handlers
              if (reapplyIntervalRef.current) clearInterval(reapplyIntervalRef.current);
              applyMediaSessionRef.current?.();
              setTimeout(() => applyMediaSessionRef.current?.(), 500);
              setTimeout(() => applyMediaSessionRef.current?.(), 1500);
              reapplyIntervalRef.current = setInterval(() => applyMediaSessionRef.current?.(), 2000);
            }
            if (s === 2) {
              isPausedRef.current = true;
              if (reapplyIntervalRef.current) { clearInterval(reapplyIntervalRef.current); reapplyIntervalRef.current = null; }
            }
            if (s === 0 && !hasEndedRef.current) {
              hasEndedRef.current = true;
              if (reapplyIntervalRef.current) { clearInterval(reapplyIntervalRef.current); reapplyIntervalRef.current = null; }
              onEndedRef.current?.();
            }
          },
          onError() { setEmbedError(true); },
        },
      });
      playerRef.current = player;
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, id]);

  // Destroy player (and stop re-apply interval) when component unmounts or platform changes
  useEffect(() => {
    return () => {
      if (reapplyIntervalRef.current) { clearInterval(reapplyIntervalRef.current); reapplyIntervalRef.current = null; }
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current     = null;
      playerReadyRef.current = false;
    };
  }, [platform]);

  // ── Commands helper ───────────────────────────────────────────────────────
  const sendCmd = useCallback((fn: string) => {
    const p = playerRef.current;
    if (!p) return;
    try { p[fn]?.(); } catch {}
  }, []);

  const applyMediaSessionRef = useRef<() => void>(() => {});

  // ── Media Session API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (platform !== 'youtube' || !('mediaSession' in navigator)) return;

    const apply = () => {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: title || 'WatchRoom',
          artist: 'WatchRoom',
          artwork: thumbnail ? [{ src: thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [],
        });
        navigator.mediaSession.setActionHandler('play',  () => { sendCmd('playVideo');  isPausedRef.current = false; });
        navigator.mediaSession.setActionHandler('pause', () => { sendCmd('pauseVideo'); isPausedRef.current = true; });

        // Directly call loadVideoById inside the handler — this bypasses the React
        // re-render cycle entirely, so video changes even when the screen is locked.
        // We also register seekforward/seekbackward with the same logic so that our
        // handlers shadow YouTube's iframe seek handlers (which would otherwise just
        // seek ±10s within the current video instead of changing tracks).
        if (onNextTrackRef.current || nextIdRef.current) {
          navigator.mediaSession.setActionHandler('nexttrack', () => {
            const nid = nextIdRef.current;
            if (nid && playerRef.current && playerReadyRef.current) {
              lastLoadedIdRef.current = nid;
              hasEndedRef.current = false;
              try { playerRef.current.loadVideoById(nid); } catch {}
            }
            onNextTrackRef.current?.();
          });
        } else {
          try { navigator.mediaSession.setActionHandler('nexttrack', null); } catch {}
        }

        if (onPrevTrackRef.current || prevIdRef.current) {
          navigator.mediaSession.setActionHandler('previoustrack', () => {
            const pid = prevIdRef.current;
            if (pid && playerRef.current && playerReadyRef.current) {
              lastLoadedIdRef.current = pid;
              hasEndedRef.current = false;
              try { playerRef.current.loadVideoById(pid); } catch {}
            }
            onPrevTrackRef.current?.();
          });
        } else {
          try { navigator.mediaSession.setActionHandler('previoustrack', null); } catch {}
        }

        // Always null seek handlers — registering them causes iOS to show ±10s circular
        // buttons instead of ⏮/⏭. The Permissions-Policy header prevents YouTube's
        // iframe from registering its own seek handlers that would override these nulls.
        try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch {}
        try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch {}
      } catch {}
    };

    applyMediaSessionRef.current = apply;
    apply();
  }, [platform, title, thumbnail, sendCmd, onNextTrack, onPrevTrack, nextId, prevId]);

  // ── Resume on tab/app focus ───────────────────────────────────────────────
  useEffect(() => {
    if (platform !== 'youtube') return;
    function onVisChange() {
      if (document.visibilityState === 'visible' && !isPausedRef.current) {
        setTimeout(() => sendCmd('playVideo'), 700);
      }
    }
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, [platform, sendCmd]);

  // ── Non-YouTube platforms — plain iframe ──────────────────────────────────
  if (platform !== 'youtube') {
    const src = platform === 'twitch'
      ? `https://player.twitch.tv/?channel=${id}&parent=${appHost}&autoplay=false`
      : `https://player.kick.com/${id}`;
    return (
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden">
        <iframe ref={iframeRef} key={src} src={src}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen title="Video player" />
      </div>
    );
  }

  if (embedError) {
    return (
      <div className="w-full aspect-video bg-black rounded-xl overflow-hidden flex flex-col items-center justify-center gap-4 text-center p-6">
        <div className="text-4xl">🚫</div>
        <div>
          <p className="text-white font-semibold mb-1">Este video no permite reproducción en embeds</p>
          <p className="text-slate-400 text-sm mb-4">El dueño del video deshabilitó esta opción en YouTube.</p>
          <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors">
            ▶ Ver en YouTube.com
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full aspect-video bg-black rounded-xl overflow-hidden${blocked ? ' pointer-events-none' : ''}`}>
      <div ref={containerRef} className="relative w-full h-full" />
    </div>
  );
}
