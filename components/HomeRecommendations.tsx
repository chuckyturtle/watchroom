'use client';

import { useEffect, useState } from 'react';
import VideoCard from './VideoCard';
import { getHistory, clearHistory, buildTasteProfile, HistoryItem } from '@/lib/watchHistory';

interface SearchResult {
  id: string;
  title: string;
  thumbnail?: string;
  channel: string;
  views?: number;
  platform: 'youtube';
}

export default function HomeRecommendations() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recs, setRecs] = useState<SearchResult[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    const h = getHistory();
    setHistory(h);

    if (h.length === 0) return;
    const profile = buildTasteProfile(h);
    if (profile.queries.length === 0) return;

    fetchRecs(profile.queries, new Set(h.map(x => x.id)));
  }, []);

  async function fetchRecs(queries: string[], watchedIds: Set<string>) {
    setLoadingRecs(true);
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    await Promise.all(
      queries.slice(0, 3).map(async (q) => {
        try {
          const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          (data.results || []).forEach((r: SearchResult) => {
            if (!watchedIds.has(r.id) && !seen.has(r.id)) {
              seen.add(r.id);
              results.push(r);
            }
          });
        } catch {}
      })
    );

    setRecs(results.slice(0, 12));
    setLoadingRecs(false);
  }

  if (history.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 pb-10 space-y-10">
      {/* Recently watched */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-base flex items-center gap-2">
            <span className="text-slate-400">🕐</span> Vistos recientemente
          </h2>
          <button
            onClick={() => {
              if (confirm('¿Borrar historial?')) {
                clearHistory();
                setHistory([]);
                setRecs([]);
              }
            }}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            Limpiar
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {history.slice(0, 12).map((item) => (
            <VideoCard
              key={`${item.platform}-${item.id}`}
              id={item.id}
              platform={item.platform as 'youtube' | 'twitch' | 'kick'}
              title={item.title}
              thumbnail={item.thumbnail}
              channel={item.channel}
              views={item.views}
              watchedAt={item.watchedAt}
            />
          ))}
        </div>
      </section>

      {/* Recommendations */}
      {(recs.length > 0 || loadingRecs) && (
        <section>
          <h2 className="text-white font-semibold text-base flex items-center gap-2 mb-4">
            <span className="text-slate-400">✨</span> Para ti
          </h2>
          {loadingRecs ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {recs.map((r, i) => (
                <VideoCard
                  key={`rec-${r.id}-${i}`}
                  id={r.id}
                  platform="youtube"
                  title={r.title}
                  thumbnail={r.thumbnail}
                  channel={r.channel}
                  views={r.views}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
