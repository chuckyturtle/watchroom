'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { AVATAR_COLORS } from '@/lib/constants';

interface ProfileUser {
  id: string;
  username: string;
  avatarColor: string;
  bio?: string | null;
  createdAt: string;
  points: number;
}

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { user, token, updateUser } = useAuth();

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [isMe, setIsMe] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [points, setPoints] = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return 0;
      const saved = localStorage.getItem('wr_user');
      return saved ? (JSON.parse(saved)?.points ?? 0) : 0;
    } catch { return 0; }
  });

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Cargar perfil
  useEffect(() => {
    setLoadError(false);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    fetch(`/api/users/${username}`, { headers })
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) throw new Error('error');
        return r.json();
      })
      .then((d) => {
        if (!d?.user) return;
        setProfile({ ...d.user, points: 0 });
        setFriendshipStatus(d.friendshipStatus);
        setIsMe(d.isMe);
        setEditBio(d.user.bio || '');
        setEditColor(d.user.avatarColor);
      })
      .catch(() => setLoadError(true));
  }, [username, token]);

  // Cargar puntos por separado (sólo para perfil propio)
  useEffect(() => {
    if (!isMe || !token) return;
    fetch('/api/points', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.points !== undefined) setPoints(d.points); })
      .catch(() => {});
  }, [isMe, token]);

  // Sincronizar puntos en tiempo real cuando se ganan reproduciendo
  useEffect(() => {
    if (user?.points !== undefined) setPoints(user.points);
  }, [user?.points]);

  async function addFriend() {
    if (!token || !profile) return;
    const res = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: profile.username }),
    });
    if (res.ok) setFriendshipStatus('sent');
  }

  async function saveProfile() {
    if (!token) return;
    setSaving(true);
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bio: editBio, avatarColor: editColor }),
    });
    const data = await res.json();
    if (res.ok) {
      setProfile((p) => p ? { ...p, bio: data.user.bio, avatarColor: data.user.avatarColor } : p);
      updateUser({ bio: data.user.bio, avatarColor: data.user.avatarColor });
      setSaveMsg('¡Perfil actualizado!');
      setEditing(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setSaving(false);
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">👤</div>
          <p className="text-slate-400 text-lg">Usuario no encontrado</p>
          <Link href="/" className="btn-primary mt-4 inline-flex">Ir al inicio</Link>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-slate-400 text-lg">No se pudo cargar el perfil</p>
          <button onClick={() => { setLoadError(false); setProfile(null); }} className="btn-primary mt-4">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-surface-900 flex items-center justify-center">
        <div className="animate-pulse text-slate-500">Cargando perfil...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-10">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white shadow-2xl mb-4"
            style={{
              background: editing ? editColor : profile.avatarColor,
              boxShadow: `0 0 40px ${(editing ? editColor : profile.avatarColor)}66`,
            }}
          >
            {profile.username[0].toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold">{profile.username}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Miembro desde {new Date(profile.createdAt).toLocaleDateString('es', { year: 'numeric', month: 'long' })}
          </p>
          {saveMsg && <p className="text-green-400 text-sm mt-2">✓ {saveMsg}</p>}
        </div>

        {/* Points card — solo visible en perfil propio */}
        {isMe && <div
          className="mb-4 rounded-2xl p-4 flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.05))',
            border: '1px solid rgba(245,158,11,0.2)',
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)' }}
          >
            🪙
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-400/70 font-semibold uppercase tracking-wide">WatchCoins</p>
            <p className="text-2xl font-black text-amber-300">
              {points.toLocaleString()}
            </p>
            <p className="text-[11px] text-amber-500/60 mt-0.5">
              +10 pts/min reproduciendo · próximamente canjeables en la sala 3D
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-amber-600/50 font-medium">
              {Math.floor(points / 10)} min
            </p>
            <p className="text-[10px] text-amber-700/40">escuchados</p>
          </div>
        </div>}

        <div className="card p-6">
          {/* Bio */}
          {editing ? (
            <>
              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-1.5">Sobre mí</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="Escribe algo sobre ti..."
                  maxLength={160}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                />
                <p className="text-xs text-slate-600 mt-1 text-right">{editBio.length}/160</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-2">Color de avatar</label>
                <div className="flex flex-wrap gap-2">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditColor(c)}
                      className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                      style={{
                        background: c,
                        outline: editColor === c ? `3px solid white` : 'none',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={saveProfile} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button onClick={() => { setEditing(false); setEditBio(profile.bio || ''); setEditColor(profile.avatarColor); }} className="btn-ghost">
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-sm text-slate-400 mb-1">Sobre mí</p>
                <p className="text-slate-300">{profile.bio || 'Sin descripción aún.'}</p>
              </div>

              {/* Actions */}
              {isMe && (
                <button onClick={() => setEditing(true)} className="btn-ghost w-full">
                  ✏️ Editar perfil
                </button>
              )}

              {!isMe && user && (
                <div className="flex gap-2">
                  {friendshipStatus === null && (
                    <button onClick={addFriend} className="btn-primary flex-1">
                      👤 Agregar amigo
                    </button>
                  )}
                  {friendshipStatus === 'sent' && (
                    <div className="btn-ghost flex-1 text-center text-sm text-slate-400 cursor-default">
                      ⏳ Solicitud enviada
                    </div>
                  )}
                  {friendshipStatus === 'received' && (
                    <Link href="/friends" className="btn-primary flex-1 text-center text-sm">
                      Ver solicitud pendiente →
                    </Link>
                  )}
                  {friendshipStatus === 'friends' && (
                    <div className="flex-1 text-center text-green-400 text-sm font-medium py-2">
                      ✓ Son amigos
                    </div>
                  )}
                </div>
              )}

              {!user && (
                <Link href="/login" className="btn-ghost w-full text-center text-sm mt-2">
                  Inicia sesión para agregar como amigo
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
