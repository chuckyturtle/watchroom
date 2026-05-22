'use client';

import { useEffect, useRef, useState } from 'react';

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

export default function VideoPlayer({ platform, id, onEnded, blocked, title, thumbnail, autoplay }: VideoPlayerProps) {
  const [embedError, setEmbedError] = useState(false);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const isPausedRef  = useRef(false);
  const hasEndedRef  = useRef(false); // guard: fire onEnded at most once per video id
  const appHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  // Reset guard whenever a new video loads
  useEffect(() => {
    hasEndedRef.current = false;
  }, [id]);

  function getSrc(): string {
    switch (platform) {
      case 'youtube':
        return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&color=white&iv_load_policy=3&enablejsapi=1${autoplay ? '&autoplay=1' : ''}`;
      case 'twitch':
        return `https://player.twitch.tv/?channel=${id}&parent=${appHost}&autoplay=false`;
      case 'kick':
        return `https://player.kick.com/${id}`;
      default:
        return '';
    }
  }

  function sendCmd(func: string) {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args: [] }), '*'
    );
  }

  // Track YouTube player state (playing/paused) and fire onEnded
  useEffect(() => {
    if (platform !== 'youtube') return;
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      // When player is ready: trigger playVideo if autoplay requested.
      // This handles browsers that block autoplay=1 in the URL.
      if (msg.event === 'onReady' && autoplay) {
        sendCmd('playVideo');
      }

      const state: number | undefined =
        msg.event === 'onStateChange' ? msg.info :
        msg.event === 'infoDelivery'  ? msg.info?.playerState :
        undefined;
      if (state === 1) isPausedRef.current = false; // playing
      if (state === 2) isPausedRef.current = true;  // paused
      if (state === 0 && onEnded && !hasEndedRef.current) {
        hasEndedRef.current = true;
        onEnded();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [platform, id, onEnded, autoplay]);

  // Media Session API — shows media controls on lock screen and registers play/pause
  useEffect(() => {
    if (platform !== 'youtube' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'WatchRoom',
        artist: 'WatchRoom',
        artwork: thumbnail
          ? [{ src: thumbnail, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => {
        sendCmd('playVideo');
        isPausedRef.current = false;
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        sendCmd('pauseVideo');
        isPausedRef.current = true;
      });
    } catch {}
  }, [platform, title, thumbnail]);

  // Resume playback when returning from lock screen or switching back to the tab
  useEffect(() => {
    if (platform !== 'youtube') return;
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && !isPausedRef.current) {
        setTimeout(() => sendCmd('playVideo'), 700);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [platform]);

  const src = getSrc();

  if (embedError && platform === 'youtube') {
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
    <div className="w-full aspect-video bg-black rounded-xl overflow-hidden">
      <iframe
        ref={iframeRef}
        key={src}
        src={src}
        className={`w-full h-full${blocked ? ' pointer-events-none' : ''}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title="Video player"
        onError={() => setEmbedError(true)}
      />
    </div>
  );
}
