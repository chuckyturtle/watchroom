'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface PubPlaylist {
  id: string;
  name: string;
  rating: number;
  owner: { username: string };
  itemCount: number;
  saveCount: number;
  preview: { thumbnail: string; title: string }[];
  voted: boolean;
  saved: boolean;
}

export default function HomeDiscoverPlaylists() {
  const { token } = useAuth();
  const [playlists, setPlaylists] = useState<PubPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/discover?sort=featured&page=0', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => { setPlaylists((d.playlists || []).slice(0, 6)); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (!loading && playlists.length === 0) return null;

  return (
    <div className="mt-12">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-white">Playlists de la comunidad</h2>
          <p className="text-slate-500 text-sm mt-0.5">Los más votados por la comunidad</p>
        </div>
        <Link href="/discover" className="text-indigo-400 hover:underline text-sm shrink-0 ml-4">
          Ver todos →
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {playlists.map(p => (
              <Link key={p.id} href={`/discover/${p.id}`}
                className="group rounded-2xl bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 transition-all p-3 block">
                <div className="grid grid-cols-2 gap-0.5 mb-2 rounded-lg overflow-hidden h-14">
                  {p.preview.slice(0, 4).map((item, i) => (
                    item.thumbnail
                      ? <img key={i} src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                      : <div key={i} className="w-full h-full bg-white/5 flex items-center justify-center text-slate-600 text-xs">▶</div>
                  ))}
                  {Array(Math.max(0, 4 - p.preview.length)).fill(0).map((_, i) => (
                    <div key={`e${i}`} className="w-full h-full bg-white/5" />
                  ))}
                </div>
                <p className="text-white font-semibold text-xs line-clamp-1 mb-0.5">{p.name}</p>
                <p className="text-slate-500 text-[11px] truncate mb-1">{p.owner.username} · {p.itemCount} canciones</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className={p.voted ? 'text-amber-400' : ''}>⭐ {p.rating}</span>
                  <span>💾 {p.saveCount}</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 text-center">
            <Link href="/discover"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-sm font-medium transition-all">
              🔍 Explorar todos los playlists
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
