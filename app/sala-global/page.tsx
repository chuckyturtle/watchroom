'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import Link from 'next/link';

const ImmersiveRoom3D = dynamic(() => import('@/components/ImmersiveRoom3D'), { ssr: false });

interface Friend { friendshipId: string; id: string; username: string; avatarColor: string }

const GLOBAL_ROOM_ID = 'sala-global-world';

export default function SalaGlobalPage() {
  const router = useRouter();
  const { user, token } = useAuth();

  const [friends,    setFriends]    = useState<Friend[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    if (user) socket.emit('register-user', { userId: user.id });
    return () => { socket.disconnect(); };
  }, [user]);

  useEffect(() => {
    if (!user || !token) return;
    fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setFriends(d.friends || []))
      .catch(() => {});
  }, [user, token]);

  async function inviteFriend(friend: Friend) {
    if (!token) return;
    const res = await fetch('/api/rooms/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        friendUsername: friend.username,
        platform: 'youtube',
        contentId: GLOBAL_ROOM_ID,
        roomTitle: 'Sala Inmersiva Global',
      }),
    });
    const data = await res.json();
    if (res.ok && data.invite && socketRef.current) {
      socketRef.current.emit('send-invite', {
        ...data.invite,
        roomUrl: `${window.location.origin}/sala-global`,
      });
      setInviteSent(s => new Set(s).add(friend.id));
    }
  }

  return (
    <div className="bg-surface-900 flex flex-col" style={{ height: '100vh' }}>
      <Navbar />

      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/5 glass">
          <button
            onClick={() => router.push('/')}
            className="text-slate-400 hover:text-white text-sm transition-colors shrink-0"
          >
            ←
          </button>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}>
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse inline-block" />
            Sala Inmersiva Global
          </div>

          <span className="text-slate-600 text-xs hidden sm:block">Todo el mundo · mismo lugar</span>

          <div className="flex-1" />

          {user && (
            <div className="relative">
              <button
                onClick={() => setInviteOpen(o => !o)}
                className="btn-primary text-xs py-1.5 px-3 gap-1.5"
              >
                👥 Invitar amigos
              </button>

              {inviteOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 glass rounded-xl shadow-2xl border border-white/5 py-2 z-50">
                  <p className="text-xs text-slate-500 px-3 py-1.5 font-semibold uppercase">Tus amigos</p>
                  {friends.length === 0 ? (
                    <div className="px-3 py-4 text-center">
                      <p className="text-slate-500 text-xs">No tienes amigos aún</p>
                      <Link href="/friends" className="text-indigo-400 text-xs hover:underline">Agregar amigos →</Link>
                    </div>
                  ) : friends.map(f => (
                    <div key={f.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white/5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: f.avatarColor }}>
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

          {!user && (
            <Link href="/login"
              className="text-xs px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 transition-colors border border-indigo-500/30">
              Iniciar sesión
            </Link>
          )}
        </div>

        {/* 3D World */}
        <div className="flex-1 min-h-0 relative">
          <ImmersiveRoom3D
            platform="youtube"
            contentId=""
            roomId={GLOBAL_ROOM_ID}
            videoSrc=""
          />
        </div>
      </div>
    </div>
  );
}
