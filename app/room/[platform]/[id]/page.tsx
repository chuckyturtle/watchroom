'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import { saveToHistory } from '@/lib/watchHistory';

const ImmersiveRoom3D = dynamic(() => import('@/components/ImmersiveRoom3D'), { ssr: false });

type Platform = 'youtube' | 'twitch' | 'kick';

interface Friend { friendshipId: string; id: string; username: string; avatarColor: string }

const PLATFORM_LABELS: Record<Platform, { name: string; color: string; icon: string }> = {
  youtube: { name: 'YouTube', color: '#ff0000', icon: '▶' },
  twitch: { name: 'Twitch', color: '#9146ff', icon: '🟣' },
  kick: { name: 'Kick', color: '#53fc18', icon: '🟢' },
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token } = useAuth();
  const platform = params.platform as Platform;
  const id = params.id as string;
  const roomId = `${platform}:${id}`;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  const cfg = PLATFORM_LABELS[platform] || PLATFORM_LABELS.youtube;

  // Save to watch history when entering a YouTube room
  useEffect(() => {
    if (platform !== 'youtube') return;
    fetch(`/api/videoinfo/${id}`)
      .then(r => r.json())
      .then(info => {
        saveToHistory({
          id: info.id || id,
          platform,
          title: info.title || id,
          thumbnail: info.thumbnail || '',
          channel: info.channel || '',
          views: info.views,
          duration: info.duration,
        });
      })
      .catch(() => {
        saveToHistory({ id, platform, title: id, thumbnail: '', channel: '' });
      });
  }, [id, platform]);

  // Load friends
  useEffect(() => {
    if (!user || !token) return;
    fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setFriends(d.friends || []))
      .catch(() => {});
  }, [user, token]);

  // Socket for invite delivery
  useEffect(() => {
    if (!user) return;
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('register-user', { userId: user.id });
    return () => { socket.disconnect(); };
  }, [user]);

  async function inviteFriend(friend: Friend) {
    if (!token) return;
    const res = await fetch('/api/rooms/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        friendUsername: friend.username,
        platform,
        contentId: id,
        roomTitle: `Sala de ${platform}/${id}`,
      }),
    });
    const data = await res.json();
    if (res.ok && data.invite && socketRef.current) {
      socketRef.current.emit('send-invite', data.invite);
      setInviteSent((s) => new Set(s).add(friend.id));
    }
  }

  if (!['youtube', 'twitch', 'kick'].includes(platform)) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <p className="text-red-400">Plataforma no válida</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-900 flex flex-col" style={{ height: '100vh' }}>
      <Navbar />

      <div className="flex-1 flex flex-col max-w-full min-h-0">
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/5 glass">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white text-sm transition-colors">
            ←
          </button>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: cfg.color + '22', color: cfg.color, border: `1px solid ${cfg.color}44` }}
          >
            {cfg.icon} {cfg.name}
          </span>
          <span className="text-slate-400 text-sm truncate flex-1">
            Sala inmersiva · {id}
          </span>

          {/* Invite friends */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setInviteOpen((o) => !o)}
                className="btn-primary text-xs py-1.5 px-3 gap-1.5"
              >
                👥 Invitar amigos
              </button>

              {inviteOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 glass rounded-xl shadow-2xl border border-white/5 py-2 z-50">
                  <p className="text-xs text-slate-500 px-3 py-1.5 font-semibold uppercase">Tus amigos</p>
                  {friends.length === 0 && (
                    <div className="px-3 py-4 text-center">
                      <p className="text-slate-500 text-xs">No tienes amigos aún</p>
                      <Link href="/friends" className="text-indigo-400 text-xs hover:underline">
                        Agregar amigos →
                      </Link>
                    </div>
                  )}
                  {friends.map((f) => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: f.avatarColor }}
                      >
                        {f.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm text-white flex-1 truncate">{f.username}</span>
                      <button
                        onClick={() => inviteFriend(f)}
                        disabled={inviteSent.has(f.id)}
                        className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                          inviteSent.has(f.id)
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400'
                        }`}
                      >
                        {inviteSent.has(f.id) ? '✓ Enviado' : 'Invitar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 3D Immersive room — fills remaining space */}
        <div className="flex-1 min-h-0 relative">
          <ImmersiveRoom3D
            platform={platform}
            contentId={id}
            roomId={roomId}
            videoSrc={`https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`}
          />
        </div>
      </div>
    </div>
  );
}
