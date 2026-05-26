'use client';

import { useEffect, useState } from 'react';

/**
 * Shows a one-time banner on iOS Chrome (mobile viewport) explaining how to
 * enable permanent desktop mode so YouTube audio continues when screen is locked.
 */
export default function IOSDesktopBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('wr-desktop-banner-dismissed');
    if (dismissed) return;

    const isChromeIOS = /CriOS/.test(navigator.userAgent) && /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isMobileViewport = window.innerWidth < 768;

    if (isChromeIOS && isMobileViewport) setShow(true);
  }, []);

  function dismiss() {
    localStorage.setItem('wr-desktop-banner-dismissed', '1');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4"
      style={{ background: 'rgba(15,15,19,0.97)', borderTop: '1px solid rgba(99,102,241,0.3)' }}
    >
      <div className="max-w-lg mx-auto">
        <p className="text-white font-semibold text-sm mb-1">
          🎵 Activa reproducción con pantalla bloqueada
        </p>
        <p className="text-slate-400 text-xs mb-3 leading-snug">
          En Chrome toca <span className="text-white font-medium">⋯ → Sitio de escritorio</span> y
          actívalo. Luego vuelve a agregar WatchRoom a tu pantalla de inicio. Así el audio seguirá
          sonando cuando bloquees el celular.
        </p>
        <div className="flex gap-2">
          <button
            onClick={dismiss}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Entendido
          </button>
          <button
            onClick={dismiss}
            className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-400 transition-colors"
          >
            No mostrar
          </button>
        </div>
      </div>
    </div>
  );
}
