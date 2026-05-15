'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveToHistory } from '@/lib/watchHistory';

interface VideoCardProps {
  id: string;
  platform: 'youtube' | 'twitch' | 'kick';
  title: string;
  thumbnail?: string;
  channel: string;
  duration?: number;
  views?: number;
  watchedAt?: number;
}

export default function VideoCard({ id, platform, title, thumbnail, channel, duration, views, watchedAt }: VideoCardProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseEnter = useCallback(() => {
    setHovered(true);
    hoverTimer.current = setTimeout(() => setShowPreview(true), 600);
  }, []);

  const onMouseLeave = useCallback(() => {
    setHovered(false);
    setShowPreview(false);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  function handleClick() {
    saveToHistory({ id, platform, title, thumbnail: thumbnail || '', channel, duration, views });
    router.push(`/watch/${platform}/${id}`);
  }

  const embedSrc = platform === 'youtube'
    ? `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${id}`
    : null;

  const timeAgo = watchedAt ? formatTimeAgo(watchedAt) : null;

  return (
    <button
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group text-left bg-white/3 border border-white/5 rounded-xl overflow-hidden transition-all duration-300 w-full"
      style={{
        transform: hovered ? 'scale(1.06)' : 'scale(1)',
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.5)' : 'none',
        zIndex: hovered ? 10 : 1,
        position: 'relative',
      }}
    >
      <div className="aspect-video relative bg-black overflow-hidden">
        {showPreview && embedSrc ? (
          <iframe
            src={embedSrc}
            className="absolute inset-0 w-full h-full"
            allow="autoplay"
            style={{ pointerEvents: 'none', border: 'none' }}
          />
        ) : thumbnail ? (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-slate-600">▶</div>
        )}

        {!showPreview && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 rounded-full p-2.5">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-white text-xs font-medium line-clamp-2 mb-1 leading-snug">{title}</p>
        <p className="text-slate-500 text-[11px] truncate">{channel}</p>
        <div className="flex items-center gap-2 mt-1">
          {views && <p className="text-slate-600 text-[10px]">{formatViews(views)}</p>}
          {timeAgo && <p className="text-slate-600 text-[10px]">{timeAgo}</p>}
        </div>
      </div>
    </button>
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M vistas';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K vistas';
  return n + ' vistas';
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Hace ${days}d`;
  return `Hace ${Math.floor(days / 7)}sem`;
}
