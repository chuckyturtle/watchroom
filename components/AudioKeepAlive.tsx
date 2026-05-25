'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the iOS audio session alive while a YouTube video is playing.
 *
 * iOS suspends audio from cross-origin iframes (YouTube embed) when the screen
 * locks in standalone/PWA mode. By running a near-silent AudioContext oscillator
 * at 1 Hz (below human hearing) on our own page, we hold the WKWebView audio
 * session open and iOS keeps the YouTube iframe playing in the background.
 *
 * Must be started from a user gesture — pass `active={true}` after the user
 * has tapped play for the first time.
 */
export default function AudioKeepAlive({ active }: { active: boolean }) {
  const ctxRef  = useRef<AudioContext | null>(null);
  const oscRef  = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;
    if (ctxRef.current) return; // already running

    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      // 1 Hz oscillator — completely inaudible (below 20 Hz human threshold)
      // but counts as "active audio" for iOS's background session manager.
      osc.frequency.value = 1;
      gain.gain.value     = 0.00001;   // essentially silent

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      ctxRef.current  = ctx;
      oscRef.current  = osc;
      gainRef.current = gain;
    } catch {}

    return () => {
      try { oscRef.current?.stop(); } catch {}
      try { ctxRef.current?.close(); } catch {}
      ctxRef.current  = null;
      oscRef.current  = null;
      gainRef.current = null;
    };
  }, [active]);

  return null;
}
