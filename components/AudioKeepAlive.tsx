'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the iOS WKWebView audio session alive so the YouTube iframe
 * continues playing when the screen is locked in PWA/standalone mode.
 *
 * Strategy: on the FIRST touchstart/click on the page (a direct user
 * gesture), create an AudioContext and play white noise at -60 dBFS
 * (inaudible but above iOS's "silence" threshold). This registers our
 * page as the active audio producer so iOS doesn't suspend WKWebView
 * when the screen locks.
 *
 * Using window touchstart guarantees we're inside a real user-gesture
 * chain — AudioContext + resume() called from postMessage (iframe
 * events) do NOT count and start suspended.
 */
export default function AudioKeepAlive() {
  const ctxRef    = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    function start() {
      if (ctxRef.current) return;
      try {
        const ctx = new AudioContext();

        // White noise at -60 dBFS: inaudible in practice but iOS sees
        // it as real audio output and keeps the session active.
        const rate       = ctx.sampleRate;
        const seconds    = 3;
        const buf        = ctx.createBuffer(1, rate * seconds, rate);
        const data       = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.001; // ≈ -60 dBFS
        }

        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop   = true;
        src.connect(ctx.destination);
        src.start(0);

        // resume() needed if browser auto-suspended the context
        ctx.resume().catch(() => {});

        ctxRef.current    = ctx;
        sourceRef.current = src;
      } catch {}
    }

    // Re-resume when the user returns to the app (e.g. unlocks screen)
    function onVisible() {
      if (ctxRef.current?.state === 'suspended') {
        ctxRef.current.resume().catch(() => {});
      }
    }

    window.addEventListener('touchstart', start, { once: true, passive: true });
    window.addEventListener('click',      start, { once: true });
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('touchstart', start);
      window.removeEventListener('click',      start);
      document.removeEventListener('visibilitychange', onVisible);
      try { sourceRef.current?.stop(); } catch {}
      ctxRef.current?.close().catch(() => {});
      ctxRef.current    = null;
      sourceRef.current = null;
    };
  }, []);

  return null;
}
