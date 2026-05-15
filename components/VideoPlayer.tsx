'use client';

import { useEffect, useRef, useState } from 'react';

type Platform = 'youtube' | 'twitch' | 'kick';

interface VideoPlayerProps {
  platform: Platform;
  id: string;
  onEnded?: () => void;
}

export default function VideoPlayer({ platform, id, onEnded }: VideoPlayerProps) {
  const [embedError, setEmbedError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const appHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  function getSrc(): string {
    switch (platform) {
      case 'youtube':
        return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&color=white&iv_load_policy=3&enablejsapi=1`;
      case 'twitch':
        return `https://player.twitch.tv/?channel=${id}&parent=${appHost}&autoplay=false`;
      case 'kick':
        return `https://player.kick.com/${id}`;
      default:
        return '';
    }
  }

  // Detectar fin de video desde postMessage del iframe de YouTube
  useEffect(() => {
    if (platform !== 'youtube' || !onEnded) return;
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }
      const state: number | undefined =
        msg.event === 'onStateChange' ? msg.info :
        msg.event === 'infoDelivery'  ? msg.info?.playerState :
        undefined;
      if (state === 0) onEnded!();
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [platform, id, onEnded]);

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
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title="Video player"
        onError={() => setEmbedError(true)}
      />
    </div>
  );
}
