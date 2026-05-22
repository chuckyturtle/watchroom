'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type Platform = 'youtube' | 'twitch' | 'kick';

interface VideoPlayerProps {
  platform: Platform;
  id: string;
  onEnded?: () => void;
  blocked?: boolean;
  title?: string;
  thumbnail?: string;
  autoplay?: boolean;
}

// Global registry so we only load the YouTube IFrame API script once
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

export default function VideoPlayer({ platform, id, onEnded, blocked, title, thumbnail, autoplay }: VideoPlayerProps) {
  const [embedError, setEmbedError] = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);
  const iframeRef     = useRef<HTMLIFrameElement>(null);
  const playerRef     = useRef<any>(null);
  const isPausedRef   = useRef(false);
  const hasEndedRef   = useRef(false);
  const appHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // ── YouTube IFrame API player (reliable onStateChange) ────────────────────
  useEffect(() => {
    if (platform !== 'youtube') return;

    let player: any = null;
    let destroyed = false;

    hasEndedRef.current = false;

    loadYouTubeAPI().then(() => {
      if (destroyed || !containerRef.current) return;

      // Create a fresh div inside the container for YT.Player to replace
      const div = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(div);

      player = new window.YT.Player(div, {
        videoId: id,
        width: '100%',
        height: '100%',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          enablejsapi: 1,
          autoplay: autoplay ? 1 : 0,
          origin: window.location.origin,
        },
        events: {
          onReady(e: any) {
            playerRef.current = e.target;
            // Ensure the generated iframe fills the container
            const iframe = e.target.getIframe?.();
            if (iframe) {
              iframe.style.width = '100%';
              iframe.style.height = '100%';
              iframe.style.position = 'absolute';
              iframe.style.top = '0';
              iframe.style.left = '0';
            }
            if (autoplay) e.target.playVideo();
          },
          onStateChange(e: any) {
            const s: number = e.data;
            if (s === 1) { isPausedRef.current = false; }
            if (s === 2) { isPausedRef.current = true; }
            if (s === 0 && onEnded && !hasEndedRef.current) {
              hasEndedRef.current = true;
              onEnded();
            }
          },
          onError() {
            setEmbedError(true);
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      destroyed = true;
      try { player?.destroy(); } catch {}
      playerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, id]);

  // Separate effect to keep onEnded and autoplay handlers current without
  // recreating the player (which would reset playback)
  useEffect(() => {
    // Nothing to do — onStateChange/onReady already capture these via closure.
    // The player is recreated whenever `id` changes (effect above), so stale
    // closures aren't an issue.
  }, [onEnded, autoplay]);

  // ── Helper to send commands via the YT Player API ────────────────────────
  const sendCmd = useCallback((fn: string) => {
    const p = playerRef.current;
    if (!p) return;
    try { p[fn]?.(); } catch {}
  }, []);

  // ── Media Session API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (platform !== 'youtube' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'WatchRoom',
        artist: 'WatchRoom',
        artwork: thumbnail ? [{ src: thumbnail, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => { sendCmd('playVideo'); isPausedRef.current = false; });
      navigator.mediaSession.setActionHandler('pause', () => { sendCmd('pauseVideo'); isPausedRef.current = true; });
    } catch {}
  }, [platform, title, thumbnail, sendCmd]);

  // ── Resume on tab focus ───────────────────────────────────────────────────
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

  // ── Non-YouTube platforms (Twitch / Kick) — plain iframe ─────────────────
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
      {/* containerRef: YouTube IFrame API replaces this div's contents */}
      <div ref={containerRef} className="relative w-full h-full" />
    </div>
  );
}
