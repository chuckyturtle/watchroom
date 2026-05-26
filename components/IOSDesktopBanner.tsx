'use client';

import { useEffect, useState } from 'react';

export default function IOSDesktopBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('wr-desktop-banner-v2')) return;
    const isChromeIOS = /CriOS/.test(navigator.userAgent) && /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isMobileViewport = window.innerWidth < 768;
    if (isChromeIOS && isMobileViewport) setShow(true);
  }, []);

  function dismiss() {
    localStorage.setItem('wr-desktop-banner-v2', '1');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-6"
      style={{ background: 'rgba(15,15,19,0.97)', borderTop: '1px solid rgba(99,102,241,0.3)' }}
    >
      <div className="max-w-lg mx-auto">
        <p className="text-white font-semibold text-sm mb-1">
          🎵 ¿Quieres escuchar con la pantalla bloqueada?
        </p>
        <p className="text-slate-400 text-xs mb-3 leading-snug">
          En Chrome toca <span className="text-white font-medium">⋯ → Sitio de escritorio</span> y
          actívalo. Luego borra este acceso directo y vuelve a agregarlo desde Chrome.
          Así el audio seguirá sonando cuando bloquees el celular.
        </p>
        <button
          onClick={dismiss}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
