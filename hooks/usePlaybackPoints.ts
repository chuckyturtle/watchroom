'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Options {
  token: string | null;
  onPointsGranted?: (total: number) => void;
}

export function usePlaybackPoints({ token, onPointsGranted }: Options) {
  const accSecondsRef = useRef(0);
  const isPlayingRef  = useRef(false);
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef      = useRef(token);
  tokenRef.current = token;

  const grantPoints = useCallback(async () => {
    if (!tokenRef.current) return;
    try {
      const res = await fetch('/api/points/add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      if (res.ok) {
        const data = await res.json();
        onPointsGranted?.(data.points);
      }
    } catch {}
  }, [onPointsGranted]);

  const startTicking = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      accSecondsRef.current += 1;
      if (accSecondsRef.current >= 60) {
        accSecondsRef.current -= 60;
        grantPoints();
      }
    }, 1000);
  }, [grantPoints]);

  const stopTicking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    // Escucha el evento personalizado que emite ImmersiveRoom3D
    function handleRoomState(e: Event) {
      const playing = (e as CustomEvent<{ playing: boolean }>).detail.playing;
      if (playing === isPlayingRef.current) return;
      isPlayingRef.current = playing;
      playing ? startTicking() : stopTicking();
    }

    // Fallback: también escucha postMessage de YouTube por si acaso
    function handleYTMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      const state: number | undefined =
        msg.event === 'onStateChange' ? msg.info :
        msg.event === 'infoDelivery'  ? msg.info?.playerState :
        undefined;

      if (state === undefined) return;
      const playing = state === 1;
      if (playing === isPlayingRef.current) return;
      isPlayingRef.current = playing;
      playing ? startTicking() : stopTicking();
    }

    window.addEventListener('wr-video-state', handleRoomState);
    window.addEventListener('message', handleYTMessage);

    return () => {
      window.removeEventListener('wr-video-state', handleRoomState);
      window.removeEventListener('message', handleYTMessage);
      stopTicking();
    };
  }, [token, startTicking, stopTicking]);
}
