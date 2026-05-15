'use client';

import { useState, useCallback } from 'react';
import { usePlaybackPoints } from '@/hooks/usePlaybackPoints';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  showToast?: boolean;
  onPointsGranted?: (total: number) => void;
}

export default function PlaybackPointsTracker({ showToast = true, onPointsGranted }: Props) {
  const { token, updateUser } = useAuth();
  const [toast, setToast] = useState<{ id: number; total: number } | null>(null);

  const handlePoints = useCallback((total: number) => {
    updateUser({ points: total });
    onPointsGranted?.(total);
    if (showToast) {
      setToast({ id: Date.now(), total });
      setTimeout(() => setToast(null), 2500);
    }
  }, [updateUser, showToast, onPointsGranted]);

  usePlaybackPoints({ token, onPointsGranted: handlePoints });

  if (!toast || !showToast) return null;

  return (
    <div
      key={toast.id}
      className="fixed bottom-24 right-4 z-[999] flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold shadow-2xl"
      style={{
        background: 'linear-gradient(135deg, #f59e0b22, #f59e0b44)',
        border: '1px solid #f59e0b66',
        color: '#fbbf24',
        backdropFilter: 'blur(12px)',
        animation: 'slideUpFade 2.5s ease forwards',
      }}
    >
      <span style={{ fontSize: '1.1rem' }}>🪙</span>
      <span>+15 pts · <span style={{ color: '#fde68a' }}>{toast.total.toLocaleString()} total</span></span>
    </div>
  );
}
