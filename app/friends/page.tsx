'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';

interface FriendEntry { friendshipId: string; id: string; username: string; avatarColor: string; bio?: string }

export default function FriendsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [sentReqs, setSentReqs] = useState<FriendEntry[]>([]);
  const [receivedReqs, setReceivedReqs] = useState<FriendEntry[]>([]);
  const [addUsername, setAddUsername] = useState('');
  const [addMsg, setAddMsg] = useState('');
  const [addError, setAddError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  async function loadFriends() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/friends', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setFriends(data.friends || []);
      setSentReqs(data.sentRequests || []);
      setReceivedReqs(data.receivedRequests || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadFriends(); }, [token]);

  async function sendRequest() {
    if (!addUsername.trim() || !token) return;
    setAddMsg(''); setAddError('');
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: addUsername.trim() }),
    });
    const data = await res.json();
    if (res.ok) { setAddMsg(data.message); setAddUsername(''); loadFriends(); }
    else setAddError(data.error);
  }

  async function respond(friendshipId: string, action: 'accept' | 'decline') {
    if (!token) return;
    await fetch(`/api/friends/${friendshipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    loadFriends();
  }

  async function removeFriend(friendshipId: string) {
    if (!token) return;
    await fetch(`/api/friends/${friendshipId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadFriends();
  }

  if (isLoading || !user) return null;

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">👥 Amigos</h1>

        {/* Add friend */}
        <div className="card p-5 mb-6">
          <h2 className="font-semibold mb-3 text-slate-300">Agregar amigo</h2>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="Nombre de usuario exacto..."
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
            />
            <button onClick={sendRequest} disabled={!addUsername.trim()} className="btn-primary px-5">
              Agregar
            </button>
          </div>
          {addMsg && <p className="text-green-400 text-sm mt-2">✓ {addMsg}</p>}
          {addError && <p className="text-red-400 text-sm mt-2">✗ {addError}</p>}
        </div>

        {/* Received requests */}
        {receivedReqs.length > 0 && (
          <div className="card p-5 mb-6">
            <h2 className="font-semibold mb-3 text-slate-300">
              Solicitudes recibidas{' '}
              <span className="bg-indigo-600 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
                {receivedReqs.length}
              </span>
            </h2>
            <div className="space-y-2">
              {receivedReqs.map((u) => (
                <div key={u.friendshipId} className="flex items-center gap-3 p-2 rounded-xl bg-white/3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                    style={{ background: u.avatarColor }}
                  >
                    {u.username[0].toUpperCase()}
                  </div>
                  <Link href={`/profile/${u.username}`} className="flex-1 text-white hover:text-indigo-300 font-medium">
                    {u.username}
                  </Link>
                  <button onClick={() => respond(u.friendshipId, 'accept')} className="btn-primary text-xs py-1 px-3">
                    ✓ Aceptar
                  </button>
                  <button onClick={() => respond(u.friendshipId, 'decline')} className="btn-danger text-xs py-1 px-3">
                    ✗
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Friends list */}
        <div className="card p-5">
          <h2 className="font-semibold mb-3 text-slate-300">
            Amigos ({friends.length})
          </h2>

          {loading ? (
            <div className="text-center py-8 text-slate-500">Cargando...</div>
          ) : friends.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">😊</div>
              <p className="text-slate-500">Aún no tienes amigos en WatchRoom</p>
              <p className="text-slate-600 text-sm mt-1">¡Agrega uno con el buscador de arriba!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <div key={f.friendshipId} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/3 transition-colors">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shrink-0"
                    style={{ background: f.avatarColor }}
                  >
                    {f.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/profile/${f.username}`} className="text-white font-medium hover:text-indigo-300">
                      {f.username}
                    </Link>
                    {f.bio && <p className="text-slate-500 text-xs truncate">{f.bio}</p>}
                  </div>
                  <button
                    onClick={() => removeFriend(f.friendshipId)}
                    className="text-slate-600 hover:text-red-400 text-xs transition-colors"
                    title="Eliminar amigo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sent requests */}
        {sentReqs.length > 0 && (
          <div className="card p-5 mt-4">
            <h2 className="font-semibold mb-3 text-slate-500 text-sm">Solicitudes enviadas (pendientes)</h2>
            <div className="space-y-2">
              {sentReqs.map((u) => (
                <div key={u.friendshipId} className="flex items-center gap-3 p-2 rounded-xl bg-white/2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ background: u.avatarColor }}
                  >
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className="text-slate-400 text-sm flex-1">{u.username}</span>
                  <span className="text-xs text-slate-600">Pendiente</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
