'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type Platform = 'youtube' | 'twitch' | 'kick';

interface VideoPlayerProps {
  platform: Platform;
  id: string;
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
  platform, id, onEnded, onVideoData, onNextTrack, onPrevTrack, blocked, title, thumbnail, autoplay,
}: VideoPlayerProps) {
  const [embedError, setEmbedError] = useState(false);
  const containerRef   = useRef<HTMLDivElement>(null);
  const iframeRef      = useRef<HTMLIFrameElement>(null);
  const playerRef      = useRef<any>(null);
  const playerReadyRef = useRef(false);
  const isPausedRef    = useRef(false);
  const hasEndedRef    = useRef(false);
  const appHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // Keep callback refs current so closures inside YT events never go stale
  const onEndedRef     = useRef(onEnded);
  const onVideoDataRef = useRef(onVideoData);
  const onNextTrackRef = useRef(onNextTrack);
  const onPrevTrackRef = useRef(onPrevTrack);
  useEffect(() => { onEndedRef.current     = onEnded;     }, [onEnded]);
  useEffect(() => { onVideoDataRef.current = onVideoData; }, [onVideoData]);
  useEffect(() => { onNextTrackRef.current = onNextTrack; }, [onNextTrack]);
  useEffect(() => { onPrevTrackRef.current = onPrevTrack; }, [onPrevTrack]);

  // ── YouTube IFrame API ────────────────────────────────────────────────────
  useEffect(() => {
    if (platform !== 'youtube') return;

    hasEndedRef.current = false;

    // ── If player already exists and is ready: reuse it (keeps iOS media
    //    session alive — avoids gesture-block on next video) ─────────────────
    if (playerRef.current && playerReadyRef.current) {
      if (autoplay) {
        playerRef.current.loadVideoById(id);   // loads + plays immediately
      } else {
        playerRef.current.cueVideoById(id);    // loads but doesn't play
      }
      return;
    }

    // ── First mount: create the YT.Player ────────────────────────────────
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
          playsinline: 1,          // iOS: play inline, not forced fullscreen
          autoplay: autoplay ? 1 : 0,
          origin: window.location.origin,
        },
        events: {
          onReady(e: any) {
            playerReadyRef.current = true;
            playerRef.current = e.target;
            // Make the generated iframe fill the container
            const iframe: HTMLIFrameElement | undefined = e.target.getIframe?.();
            if (iframe) {
              iframe.style.width    = '100%';
              iframe.style.height   = '100%';
              iframe.style.position = 'absolute';
              iframe.style.top      = '0';
              iframe.style.left     = '0';
            }
            if (autoplay) e.target.playVideo();
          },
          onStateChange(e: any) {
            const s: number = e.data;
            if (s === 1) {
              isPausedRef.current = false;
              // Report real title/author every time a video starts playing
              const data = e.target.getVideoData?.();
              if (data?.title) onVideoDataRef.current?.({ title: data.title, author: data.author || '' });
              // Re-apply multiple times — YouTube iframe keeps overriding our handlers
              setTimeout(() => applyMediaSessionRef.current?.(), 300);
              setTimeout(() => applyMediaSessionRef.current?.(), 800);
              setTimeout(() => applyMediaSessionRef.current?.(), 1500);
            }
            if (s === 2) isPausedRef.current = true;
            if (s === 0 && !hasEndedRef.current) {
              hasEndedRef.current = true;
              onEndedRef.current?.();
            }
          },
          onError() { setEmbedError(true); },
        },
      });
      playerRef.current = player;
    });

    return () => { cancelled = true; };
  // Only re-run when id or platform changes — NOT on callback changes
  // (callbacks are kept fresh via refs above)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform, id]);

  // Destroy player only when component unmounts or platform changes away from youtube
  useEffect(() => {
    return () => {
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current    = null;
      playerReadyRef.current = false;
    };
  }, [platform]);

  // ── Commands helper (used by media session / visibility handlers) ─────────
  const sendCmd = useCallback((fn: string) => {
    const p = playerRef.current;
    if (!p) return;
    try { p[fn]?.(); } catch {}
  }, []);

  // Ref to the latest media-session registration so we can call it from YT events
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
        if (onNextTrackRef.current) {
          // Both nexttrack AND seekforward → whichever button iOS shows, ambos avanzan
          navigator.mediaSession.setActionHandler('nexttrack',   () => onNextTrackRef.current?.());
          try { navigator.mediaSession.setActionHandler('seekforward', () => onNextTrackRef.current?.()); } catch {}
        } else {
          try { navigator.mediaSession.setActionHandler('nexttrack',   null); } catch {}
          try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch {}
        }
        if (onPrevTrackRef.current) {
          navigator.mediaSession.setActionHandler('previoustrack',  () => onPrevTrackRef.current?.());
          try { navigator.mediaSession.setActionHandler('seekbackward', () => onPrevTrackRef.current?.()); } catch {}
        } else {
          try { navigator.mediaSession.setActionHandler('previoustrack', null); } catch {}
          try { navigator.mediaSession.setActionHandler('seekbackward',  null); } catch {}
        }
      } catch {}
    };

    applyMediaSessionRef.current = apply;
    apply();
  }, [platform, title, thumbnail, sendCmd, onNextTrack, onPrevTrack]);

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
