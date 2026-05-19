'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';
import { getHistory, buildTasteProfile } from '@/lib/watchHistory';

// ── Room constants ────────────────────────────────────────────────────────────
const ROOM_W    = 20;
const ROOM_D    = 16;
const ROOM_H    = 5;
const WALL_T    = 0.22;
const SCREEN_W  = 10;
const SCREEN_H  = SCREEN_W * (9 / 16);   // 5.625
const SCREEN_Y0 = 0.3;
const SCREEN_Y1 = SCREEN_Y0 + SCREEN_H;
const IFRAME_PX = 1600;
const IFRAME_SCALE = SCREEN_W / IFRAME_PX;
const MOVE_SPEED   = 6;
const EYE_H        = 1.7;
const EYE_H_SEATED = 0.72;
const PLAYER_R     = 0.4;
const SEAT_RADIUS  = 1.5;
const BUBBLE_LIFETIME = 5000;
const BUBBLE_H     = 0.44;
const HALF_W = ROOM_W / 2;   // 10
const HALF_D = ROOM_D / 2;   // 8

// Screen sits flush against the far wall (−z side), facing +z toward the player
const SCREEN_Z = -(HALF_D - WALL_T - 0.06);

// Theater-style tiered seating: 3 rows, each elevated higher than the previous
const ROW_CONFIGS = [
  { z: -1.0, y: 0.0 },  // front row — ground level
  { z:  1.5, y: 0.6 },  // middle row — first tier
  { z:  3.8, y: 1.2 },  // back row  — second tier
];
const SEATS: { x: number; z: number; y: number }[] = [];
for (const { z, y } of ROW_CONFIGS)
  for (let col = -2; col <= 2; col++)
    SEATS.push({ x: col * 1.7, z, y });

interface RoomUser  { socketId: string; userId: string; username: string; color: string; x: number; z: number }
interface ChatMsg   { userId: string; username: string; color: string; message: string; timestamp: number }
interface QueueItem { id: string; userId: string; username: string; color: string; videoId: string; videoTitle: string; thumbnail: string; platform: string }
interface Props     { platform: string; contentId: string; roomId: string; videoSrc: string }

function guestName() { return 'Espectador' + Math.floor(Math.random() * 9000 + 1000); }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);         ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeBubbleCanvas(message: string, color: string): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 340; cv.height = 64;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(8,8,25,0.92)'; roundRect(ctx, 2, 2, cv.width - 4, cv.height - 4, 12); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; roundRect(ctx, 2, 2, cv.width - 4, cv.height - 4, 12); ctx.stroke();
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(message.length > 28 ? message.slice(0, 28) + '…' : message, cv.width / 2, cv.height / 2);
  return cv;
}

function buildVideoUrl(platform: string, id: string): string {
  if (!id) return 'about:blank';
  switch (platform) {
    case 'twitch':
      return `https://player.twitch.tv/?channel=${encodeURIComponent(id)}&parent=${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}&autoplay=true`;
    case 'kick':
      return `https://player.kick.com/${encodeURIComponent(id)}?autoplay=true`;
    default: {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      return `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&origin=${encodeURIComponent(origin)}`;
    }
  }
}

export default function ImmersiveRoom3D({ platform, contentId, roomId }: Props) {
  const { user, token, updateUser } = useAuth();

  const containerRef    = useRef<HTMLDivElement>(null);
  const iframeRef       = useRef<HTMLIFrameElement | null>(null);
  const socketRef       = useRef<Socket | null>(null);
  const playerRef       = useRef({ x: 0, z: 3.5, yaw: 0, pitch: 0 });
  const chatInputRef    = useRef<HTMLInputElement>(null);
  const pendingUsersRef = useRef<RoomUser[]>([]);
  const chatModeRef     = useRef(false);
  const seatedRef       = useRef(false);
  const nearSeatRef     = useRef<{ x: number; z: number; y: number } | null>(null);
  const seatedSeatRef   = useRef<{ x: number; z: number; y: number } | null>(null);
  const jumpVelRef      = useRef(0);
  const airYRef         = useRef(0);
  const changeVideoRef  = useRef<((id: string) => void) | null>(null);

  // ── Points system ─────────────────────────────────────────────────────────
  const ptsTokenRef    = useRef(token);
  const ptsUpdateRef   = useRef(updateUser);
  const ptsTickRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const ptsAccRef      = useRef(0);        // accumulated seconds in current minute
  const ptsPlayingRef  = useRef(false);

  const pendingQueuePlayRef = useRef<QueueItem | null>(null);

  const addAvatarRef      = useRef<((u: RoomUser) => void) | null>(null);
  const removeAvatarRef   = useRef<((sid: string) => void) | null>(null);
  const addBubbleRef      = useRef<((sid: string, msg: string, color: string) => void) | null>(null);
  const addLocalBubbleRef = useRef<((msg: string, color: string) => void) | null>(null);
  const otherUsersRef = useRef<Map<string, {
    mesh: any; data: RoomUser; bubbles: { sprite: any; timer: ReturnType<typeof setTimeout> }[];
  }>>(new Map());
  const localBubblesRef = useRef<{ sprite: any; timer: ReturnType<typeof setTimeout> }[]>([]);

  // ── Mobile touch controls ─────────────────────────────────────────────────
  const isMobileRef        = useRef(false);
  const joystickTouchIdRef = useRef<number | null>(null);
  const joystickBaseRef    = useRef({ x: 0, y: 0 });
  const joystickDeltaRef   = useRef({ x: 0, y: 0 });
  const lookTouchIdRef     = useRef<number | null>(null);
  const lookLastRef        = useRef({ x: 0, y: 0 });
  const joystickRingRef    = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef    = useRef<HTMLDivElement | null>(null);

  const [locked,         setLocked]        = useState(false);
  const [isMobile,       setIsMobile]      = useState(false);
  const [chatting,       setChatting]      = useState(false);
  const [messages,       setMessages]      = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]     = useState('');
  const [online,         setOnline]        = useState(1);
  const [invite,         setInvite]        = useState<{ from: string; roomUrl: string } | null>(null);
  const [isMuted,        setIsMuted]       = useState(false);
  const [isPaused,       setIsPaused]      = useState(false);
  const [volume,         setVolume]        = useState(80);
  const [showSearch,     setShowSearch]    = useState(false);
  const [searchQuery,    setSearchQuery]   = useState('');
  const [searchResults,  setSearchResults]   = useState<any[]>([]);
  const [searching,      setSearching]       = useState(false);
  const [suggestions,    setSuggestions]     = useState<any[]>([]);
  const [loadingSuggs,   setLoadingSuggs]    = useState(false);
  const suggestionsLoaded = useRef(false);
  const suggestionsRef    = useRef<any[]>([]); // mirror for effects
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentSuggIdx,  setCurrentSuggIdx]  = useState(-1); // which suggestion is playing
  const onlineRef         = useRef(1);         // mirror for effects
  const [nearSeatPrompt, setNearSeatPrompt] = useState(false);
  const [seated,         setSeated]        = useState(false);
  const [roomPoints,     setRoomPoints]    = useState<number>(() => {
    try {
      if (typeof window === 'undefined') return 0;
      const saved = localStorage.getItem('wr_user');
      return saved ? (JSON.parse(saved)?.points ?? 0) : 0;
    } catch { return 0; }
  });
  const [secsInMin,      setSecsInMin]     = useState(0);
  const [pointsAnim,     setPointsAnim]    = useState<number | null>(null);

  // ── Queue system ──────────────────────────────────────────────────────────
  const [queue,          setQueue]         = useState<QueueItem[]>([]);
  const [showQueue,      setShowQueue]     = useState(false);
  const [queueMode,      setQueueMode]     = useState(false);   // search panel in "add to queue" mode
  const [queueAdding,    setQueueAdding]   = useState(false);
  const [queueMsg,       setQueueMsg]      = useState('');
  const queueRef = useRef<QueueItem[]>([]); // mirror for use in effects

  // Stable identity refs — initialized once from localStorage so the socket
  // never disconnects when the AuthContext finishes loading from localStorage.
  const stableIdRef   = useRef<string>('');
  const stableNameRef = useRef<string>('');
  const stableColorRef2 = useRef<string>('#6366f1');
  if (!stableIdRef.current) {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('wr_user') : null;
      const u = saved ? JSON.parse(saved) : null;
      stableIdRef.current   = u?.id          || 'guest-' + Math.random().toString(36).slice(2);
      stableNameRef.current = u?.username     || guestName();
      stableColorRef2.current = u?.avatarColor || '#6366f1';
    } catch {
      stableIdRef.current   = 'guest-' + Math.random().toString(36).slice(2);
      stableNameRef.current = guestName();
    }
  }
  // Keep refs up-to-date when auth context hydrates (but don't trigger socket reconnect)
  useEffect(() => {
    if (user?.id)          stableIdRef.current     = user.id;
    if (user?.username)    stableNameRef.current   = user.username;
    if (user?.avatarColor) stableColorRef2.current = user.avatarColor;
  }, [user?.id, user?.username, user?.avatarColor]);

  const myUsername = user?.username    || stableNameRef.current;
  const myColor    = user?.avatarColor || stableColorRef2.current;
  const myUserId   = user?.id          || stableIdRef.current;

  // Mobile detection
  useEffect(() => {
    const mobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsMobile(mobile);
    isMobileRef.current = mobile;
  }, []);

  // Keep refs fresh across renders
  useEffect(() => { ptsTokenRef.current  = token;      }, [token]);
  useEffect(() => { ptsUpdateRef.current = updateUser; }, [updateUser]);

  // When auth context finishes loading and we have a real userId, register it
  // with the socket so invites are delivered correctly (no reconnect needed)
  useEffect(() => {
    if (!user?.id || user.id.startsWith('guest-')) return;
    if (socketRef.current?.connected) {
      socketRef.current.emit('register-user', { userId: user.id });
    }
  }, [user?.id]);

  // Sync points from auth context (handles login/external updates)
  useEffect(() => { if (user?.points !== undefined) setRoomPoints(user.points); }, [user?.points]);

  // Track the actual visible-area bottom offset via visualViewport so bottom-anchored
  // elements clear the browser chrome (tabs bar) on BOTH Safari and Chrome mobile.
  // --vp-bottom is set on the container element and combined with safe-area-inset-bottom
  // via CSS max() so neither approach double-counts on any browser.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !containerRef.current) return;
    const el = containerRef.current;

    function sync() {
      if (!vv) return;
      const bottom = Math.max(0, window.innerHeight - vv.offsetTop - vv.height);
      el.style.setProperty('--vp-bottom', bottom + 'px');
    }

    vv.addEventListener('resize', sync);
    sync();
    return () => vv?.removeEventListener('resize', sync);
  }, []);

  // Fetch fresh points on mount — use localStorage token as fallback in case
  // the auth context hasn't propagated yet
  useEffect(() => {
    const tok = token || localStorage.getItem('wr_token');
    if (!tok) return;
    fetch('/api/points', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.points !== undefined) {
          setRoomPoints(d.points);
          ptsUpdateRef.current({ points: d.points });
        }
      })
      .catch(() => {});
  }, [token]);

  // Points ticking system — +10 pts every 60 s of active playback
  useEffect(() => {
    if (!token) return;

    function grantPoints() {
      // Always read the freshest token directly from localStorage as fallback
      const tok = ptsTokenRef.current || localStorage.getItem('wr_token') || '';
      if (!tok) return;

      fetch('/api/points/add', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      })
        .then(r => {
          if (r.status === 401) {
            // Token inválido — detener el ticking para evitar puntos fantasma
            stopTicking();
            return null;
          }
          return r.ok ? r.json() : null;
        })
        .then(d => {
          if (d?.points !== undefined) {
            // Solo actualizar cuando la BD confirma el guardado real
            setRoomPoints(d.points);
            ptsUpdateRef.current({ points: d.points });
            setPointsAnim(Date.now());
            setTimeout(() => setPointsAnim(null), 2200);
          }
        })
        .catch(() => {});
    }

    function startTicking() {
      if (ptsTickRef.current) return;
      ptsTickRef.current = setInterval(() => {
        ptsAccRef.current += 1;
        setSecsInMin(s => (s + 1) % 60);
        if (ptsAccRef.current >= 60) {
          ptsAccRef.current = 0;
          setSecsInMin(0);
          grantPoints();
        }
      }, 1000);
    }

    function stopTicking() {
      if (ptsTickRef.current) { clearInterval(ptsTickRef.current); ptsTickRef.current = null; }
    }

    function handleVideoState(e: Event) {
      const playing = (e as CustomEvent<{ playing: boolean }>).detail.playing;
      if (playing === ptsPlayingRef.current) return;
      ptsPlayingRef.current = playing;
      playing ? startTicking() : stopTicking();
    }

    window.addEventListener('wr-video-state', handleVideoState);

    // Video auto-plays when the room loads; start ticking immediately.
    // Future pause/resume is handled by handleVideoState above.
    ptsPlayingRef.current = true;
    startTicking();

    return () => { window.removeEventListener('wr-video-state', handleVideoState); stopTicking(); };
  }, [token]);

  // Keep mirrors in sync so effects always have fresh references
  useEffect(() => { queueRef.current       = queue;   }, [queue]);
  useEffect(() => { suggestionsRef.current = suggestions; }, [suggestions]);
  useEffect(() => { onlineRef.current      = online;  }, [online]);

  // Detect YouTube video ended → auto-advance queue
  useEffect(() => {
    // Debounce so the same end event doesn't fire twice from the same client
    let lastFired = 0;

    function onMessage(e: MessageEvent) {
      try {
        // e.data can be a string or already an object depending on browser/YouTube version
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (typeof data !== 'object' || data === null) return;
        // YouTube sends playerState 0 (ended) in two possible formats
        const state =
          data.event === 'infoDelivery'   ? data.info?.playerState :
          data.event === 'onStateChange'  ? data.info :
          undefined;
        const ended = state === 0 || state === '0';
        if (!ended) return;
        const now = Date.now();
        if (now - lastFired < 4000) return; // local debounce
        lastFired = now;

        if (queueRef.current.length > 0) {
          // Multi-user mode: advance the shared queue
          socketRef.current?.emit('queue-advance');
        } else if (onlineRef.current === 1 && suggestionsRef.current.length > 0) {
          // Solo mode: auto-play next suggestion
          setCurrentSuggIdx(prev => {
            const next = (prev + 1) % suggestionsRef.current.length;
            const sugg = suggestionsRef.current[next];
            if (iframeRef.current) {
              iframeRef.current.src = buildVideoUrl(sugg.platform || 'youtube', sugg.id);
            }
            return next;
          });
        }
      } catch {}
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const sendYTCmd = useCallback((func: string, args: any[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wr-video-state', { detail: { playing: !isPaused } }));
  }, [isPaused]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('wr-video-state', { detail: { playing: true } }));
    return () => { window.dispatchEvent(new CustomEvent('wr-video-state', { detail: { playing: false } })); };
  }, []);

  // ── Socket.io ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    // Use stable refs so this only runs once per roomId, not on every auth-context hydration
    socket.emit('join-room', {
      roomId,
      userId:   stableIdRef.current,
      username: stableNameRef.current,
      color:    stableColorRef2.current,
      x: playerRef.current.x, z: playerRef.current.z,
    });

    socket.on('room-users', (users: RoomUser[]) => {
      setOnline(users.length + 1);
      users.forEach(u => {
        if (addAvatarRef.current) addAvatarRef.current(u);
        else pendingUsersRef.current.push(u);
      });
    });

    socket.on('user-joined', (u: RoomUser) => {
      setOnline(c => c + 1);
      setMessages(m => [...m, { userId: 'system', username: '', color: '', message: `${u.username} entró a la sala`, timestamp: Date.now() }]);
      if (addAvatarRef.current) addAvatarRef.current(u);
      else pendingUsersRef.current.push(u);
    });

    socket.on('user-left', (payload: { socketId: string; username: string } | string) => {
      const socketId = typeof payload === 'string' ? payload : payload.socketId;
      const username = typeof payload === 'string' ? '' : payload.username;
      setOnline(c => Math.max(1, c - 1));
      if (username) setMessages(m => [...m, { userId: 'system', username: '', color: '', message: `${username} salió`, timestamp: Date.now() }]);
      removeAvatarRef.current?.(socketId);
    });

    socket.on('user-moved', (u: { socketId: string; x: number; z: number }) => {
      const entry = otherUsersRef.current.get(u.socketId);
      if (entry) { entry.data.x = u.x; entry.data.z = u.z; }
    });

    socket.on('chat-message', (msg: ChatMsg & { socketId: string }) => {
      setMessages(m => [...m.slice(-49), msg]);
      addBubbleRef.current?.(msg.socketId, msg.message, msg.color);
    });

    socket.on('video-changed', ({ videoId }: { videoId: string }) => {
      changeVideoRef.current?.(videoId);
    });

    socket.on('queue-updated', ({ queue: q }: { queue: QueueItem[] }) => {
      setQueue(q);
    });

    socket.on('queue-play', ({ item }: { item: QueueItem }) => {
      setIsPaused(false);
      if (iframeRef.current) {
        iframeRef.current.src = buildVideoUrl(item.platform || 'youtube', item.videoId);
        // Belt-and-suspenders: send playVideo after the embed initializes (mobile browsers
        // may not respect autoplay=1 on src changes triggered by non-user events).
        setTimeout(() => {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
          );
        }, 2000);
      } else {
        // Iframe not ready yet (Three.js still loading) — store and apply once it's mounted
        pendingQueuePlayRef.current = item;
      }
    });

    socket.on('receive-invite', (inv: { from: string; roomUrl: string }) => {
      setInvite(inv);
      setTimeout(() => setInvite(null), 15000);
    });

    if (stableIdRef.current && !stableIdRef.current.startsWith('guest-')) {
      socket.emit('register-user', { userId: stableIdRef.current });
    }

    return () => { socket.disconnect(); };
  }, [roomId]); // Only roomId — stable refs prevent reconnection when auth context loads

  // ── Three.js scene ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    const container = containerRef.current;

    (async () => {
      const [THREEmod, css3dMod] = await Promise.all([
        import('three'),
        import('three/examples/jsm/renderers/CSS3DRenderer.js'),
      ]);
      if (destroyed || !containerRef.current) return;

      const THREE = THREEmod;
      const { CSS3DRenderer, CSS3DObject } = css3dMod;

      const W = container.clientWidth || 800, H = container.clientHeight || 600;
      const scene = new THREE.Scene(), cssScene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x03030a, 0.022);

      const camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 60);
      camera.position.set(0, EYE_H, 3.5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      Object.assign(renderer.domElement.style, { position: 'absolute', top: '0', left: '0', zIndex: '2', background: 'transparent' });
      container.appendChild(renderer.domElement);

      const cssRenderer = new CSS3DRenderer();
      cssRenderer.setSize(W, H);
      Object.assign(cssRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', zIndex: '1', pointerEvents: 'auto' });
      container.appendChild(cssRenderer.domElement);

      // ── Lights ──
      scene.add(new THREE.AmbientLight(0x111122, 5));

      const mainLight = new THREE.PointLight(0x2244cc, 2.5, 28);
      mainLight.position.set(0, ROOM_H - 0.4, 0);
      scene.add(mainLight);

      const screenGlow = new THREE.PointLight(0x1133bb, 2.2, 14);
      screenGlow.position.set(0, SCREEN_Y0 + SCREEN_H / 2, SCREEN_Z + 1.5);
      scene.add(screenGlow);

      // ── Textures ──
      const texLoader = new THREE.TextureLoader();
      const floorTex = texLoader.load('/textures/floor.jpg');
      floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(6, 5);
      const wallTex = texLoader.load('/textures/wall.jpg');
      wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
      wallTex.repeat.set(5, 1);

      // ── Materials ──
      const floorMat    = new THREE.MeshLambertMaterial({ map: floorTex });
      const wallMat     = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
      const ceilMat     = new THREE.MeshLambertMaterial({ color: 0x05050f });
      const frameMat    = new THREE.MeshLambertMaterial({ color: 0x1a1a40, emissive: new THREE.Color(0x2233cc), emissiveIntensity: 0.6 });
      const seatMat     = new THREE.MeshLambertMaterial({ color: 0x15082a });
      const seatBackMat = new THREE.MeshLambertMaterial({ color: 0x1e0d35 });
      const accentMat   = new THREE.MeshLambertMaterial({ color: 0x6366f1, emissive: new THREE.Color(0x6366f1), emissiveIntensity: 0.4 });

      function addBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: any) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
      }

      // ── Room geometry ──
      addBox(ROOM_W, 0.1, ROOM_D, 0, -0.05,         0, floorMat);
      addBox(ROOM_W, 0.1, ROOM_D, 0, ROOM_H + 0.05, 0, ceilMat);
      addBox(WALL_T, ROOM_H, ROOM_D, -HALF_W - WALL_T / 2, ROOM_H / 2, 0, wallMat);
      addBox(WALL_T, ROOM_H, ROOM_D,  HALF_W + WALL_T / 2, ROOM_H / 2, 0, wallMat);
      addBox(ROOM_W + WALL_T * 2, ROOM_H, WALL_T, 0, ROOM_H / 2,  HALF_D + WALL_T / 2, wallMat);

      // Far wall (−z) with screen opening
      const sw2 = SCREEN_W / 2;
      const sideW = (ROOM_W - SCREEN_W) / 2;
      addBox(sideW, ROOM_H, WALL_T, -(sw2 + sideW / 2), ROOM_H / 2, -HALF_D, wallMat);
      addBox(sideW, ROOM_H, WALL_T,  (sw2 + sideW / 2), ROOM_H / 2, -HALF_D, wallMat);
      addBox(SCREEN_W, ROOM_H - SCREEN_Y1, WALL_T, 0, SCREEN_Y1 + (ROOM_H - SCREEN_Y1) / 2, -HALF_D, wallMat);
      if (SCREEN_Y0 > 0.05) addBox(SCREEN_W, SCREEN_Y0, WALL_T, 0, SCREEN_Y0 / 2, -HALF_D, wallMat);

      // Screen frame glow
      const bp = 0.09, sy = SCREEN_Y0 + SCREEN_H / 2;
      const fz = -HALF_D + WALL_T + 0.05;
      addBox(SCREEN_W + bp * 2, bp, 0.04, 0, SCREEN_Y1 + bp / 2,  fz, frameMat);
      addBox(SCREEN_W + bp * 2, bp, 0.04, 0, SCREEN_Y0 - bp / 2,  fz, frameMat);
      addBox(bp, SCREEN_H + bp * 2, 0.04, -(sw2 + bp / 2), sy,    fz, frameMat);
      addBox(bp, SCREEN_H + bp * 2, 0.04,  (sw2 + bp / 2), sy,    fz, frameMat);

      // Ceiling accent strip
      addBox(ROOM_W, 0.06, 0.06, 0, ROOM_H - 0.04, 0, accentMat);

      // ── Tiered platforms (theater-style stepped floor) ──
      const platformMat = new THREE.MeshLambertMaterial({ map: floorTex });
      // Tier 1: raises floor to y=0.6 from z=0.3 to back wall
      addBox(ROOM_W, 0.6, HALF_D - 0.3, 0, 0.3, (0.3 + HALF_D) / 2, platformMat);
      // Tier 2: raises floor to y=1.2 from z=2.8 to back wall (sits on top of tier 1)
      addBox(ROOM_W, 0.6, HALF_D - 2.8, 0, 0.9, (2.8 + HALF_D) / 2, platformMat);

      // LED accent strips on step edges
      const stepLedMat = new THREE.MeshLambertMaterial({ color: 0x3355ff, emissive: new THREE.Color(0x4466ff), emissiveIntensity: 1.2 });
      addBox(ROOM_W - 0.2, 0.04, 0.05, 0, 0.63, 0.30, stepLedMat);
      addBox(ROOM_W - 0.2, 0.04, 0.05, 0, 1.23, 2.80, stepLedMat);

      // ── Seats (y offset per tier) ──
      for (const { x, z, y } of SEATS) {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.62), seatMat);
        seat.position.set(x, y + 0.42, z); scene.add(seat);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.08), seatBackMat);
        back.position.set(x, y + 0.73, z + 0.30); scene.add(back);
      }

      // ── CSS3D Screen ──
      const iframe = document.createElement('iframe');
      iframe.style.width  = `${IFRAME_PX}px`;
      iframe.style.height = `${Math.round(IFRAME_PX * 9 / 16)}px`;
      iframe.style.border = 'none';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      (iframe as any).allowFullscreen = true;
      iframe.src = buildVideoUrl(platform, contentId);
      iframeRef.current = iframe;

      // Tell YouTube we're listening so it initialises the IFrame API and sends onStateChange events
      iframe.addEventListener('load', () => {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
      });

      // If a queue-play arrived before the iframe was ready, apply it now.
      // Use src here because the player just loaded and loadVideoById isn't ready yet.
      if (pendingQueuePlayRef.current) {
        iframe.src = buildVideoUrl(pendingQueuePlayRef.current.platform || 'youtube', pendingQueuePlayRef.current.videoId);
        pendingQueuePlayRef.current = null;
      }

      // CSS3D faces +z by default; player at z=3.5 is at +z relative to screen at z≈-7.7 ✓
      const screenObj = new CSS3DObject(iframe);
      screenObj.scale.setScalar(IFRAME_SCALE);
      screenObj.position.set(0, SCREEN_Y0 + SCREEN_H / 2, SCREEN_Z);
      cssScene.add(screenObj);

      changeVideoRef.current = (id: string) => {
        iframe.src = buildVideoUrl(platform, id);
      };

      // ── Avatar helpers ──
      function makeNameCanvas(username: string, color: string) {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 52;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = 'rgba(0,0,0,0.78)'; roundRect(ctx, 3, 3, 250, 46, 7); ctx.fill();
        ctx.fillStyle = color; ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(username.slice(0, 15), 128, 26);
        return new THREE.CanvasTexture(cv);
      }

      function createAvatar(username: string, color: string) {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 1.0, 12), mat);
        body.position.y = 0.78; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mat);
        head.position.y = 1.52; group.add(head);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeNameCanvas(username, color), transparent: true, depthTest: false }));
        sprite.scale.set(1.3, 0.28, 1); sprite.position.y = 2.05; group.add(sprite);
        return group;
      }

      addAvatarRef.current = (u: RoomUser) => {
        const mesh = createAvatar(u.username, u.color);
        mesh.position.set(u.x ?? 0, 0, u.z ?? 2);
        scene.add(mesh);
        otherUsersRef.current.set(u.socketId, { mesh, data: u, bubbles: [] });
      };
      pendingUsersRef.current.forEach(u => addAvatarRef.current!(u));
      pendingUsersRef.current = [];

      removeAvatarRef.current = (sid: string) => {
        const entry = otherUsersRef.current.get(sid);
        if (entry) {
          entry.bubbles.forEach(b => { clearTimeout(b.timer); scene.remove(b.sprite); });
          scene.remove(entry.mesh);
          otherUsersRef.current.delete(sid);
        }
      };

      function spawnBubble(message: string, color: string, x: number, y: number, z: number) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(makeBubbleCanvas(message, color)), transparent: true, depthTest: false }));
        sprite.scale.set(2.2, BUBBLE_H, 1); sprite.position.set(x, y, z); scene.add(sprite); return sprite;
      }

      addBubbleRef.current = (sid: string, msg: string, color: string) => {
        const entry = otherUsersRef.current.get(sid); if (!entry) return;
        entry.bubbles.forEach(b => { b.sprite.position.y += BUBBLE_H + 0.08; });
        const sprite = spawnBubble(msg, color, entry.mesh.position.x, 2.4, entry.mesh.position.z);
        const timer = setTimeout(() => { scene.remove(sprite); const i = entry.bubbles.findIndex(b => b.sprite === sprite); if (i !== -1) entry.bubbles.splice(i, 1); }, BUBBLE_LIFETIME);
        entry.bubbles.push({ sprite, timer });
      };

      addLocalBubbleRef.current = (msg: string, color: string) => {
        const p = playerRef.current;
        localBubblesRef.current.forEach(b => { b.sprite.position.y += BUBBLE_H + 0.08; });
        const sprite = spawnBubble(msg, color, p.x, EYE_H + 0.85, p.z);
        const timer = setTimeout(() => { scene.remove(sprite); const i = localBubblesRef.current.findIndex(b => b.sprite === sprite); if (i !== -1) localBubblesRef.current.splice(i, 1); }, BUBBLE_LIFETIME);
        localBubblesRef.current.push({ sprite, timer });
      };

      // ── Pointer lock ──
      renderer.domElement.addEventListener('click', () => { renderer.domElement.requestPointerLock(); });
      document.addEventListener('pointerlockchange', () => {
        const isLocked = document.pointerLockElement === renderer.domElement;
        setLocked(isLocked);
        cssRenderer.domElement.style.pointerEvents = isLocked ? 'none' : 'auto';
        if (!isLocked) {
          if (chatModeRef.current) { chatModeRef.current = false; setChatting(true); setTimeout(() => chatInputRef.current?.focus(), 80); }
          else setChatting(false);
        }
      });
      document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        const p = playerRef.current;
        p.yaw   -= e.movementX * 0.0018;
        p.pitch  = Math.max(-1.1, Math.min(0.8, p.pitch - e.movementY * 0.0018));
      });

      // ── Keyboard ──
      const keys: Record<string, boolean> = {};
      const onDown = (e: KeyboardEvent) => {
        if (e.code === 'Escape') { document.exitPointerLock(); chatModeRef.current = false; setChatting(false); return; }
        if (chatModeRef.current || chatInputRef.current === document.activeElement) return;
        if (e.code === 'KeyT') { chatModeRef.current = true; document.exitPointerLock(); return; }
        if (e.code === 'KeyE') {
          const seat = nearSeatRef.current;
          if (seat) {
            if (!seatedRef.current) { seatedRef.current = true; seatedSeatRef.current = seat; setSeated(true); playerRef.current.x = seat.x; playerRef.current.z = seat.z; airYRef.current = 0; jumpVelRef.current = 0; }
            else { seatedRef.current = false; seatedSeatRef.current = null; setSeated(false); }
          }
          return;
        }
        if (e.code === 'Space' && !seatedRef.current && airYRef.current < 0.05) { jumpVelRef.current = 4; return; }
        keys[e.code] = true;
      };
      const onUp = (e: KeyboardEvent) => { keys[e.code] = false; };
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);

      // ── Mobile touch controls ──
      const JOYSTICK_R = 52;

      function onTouchStart(e: TouchEvent) {
        const rect = container.getBoundingClientRect();
        for (const t of Array.from(e.changedTouches)) {
          const cx = t.clientX - rect.left;
          const cy = t.clientY - rect.top;
          if (cy > container.clientHeight - 72) continue; // let chat bar handle its own touches
          const isLeft = cx < container.clientWidth / 2;
          if (isLeft && joystickTouchIdRef.current === null) {
            joystickTouchIdRef.current = t.identifier;
            joystickBaseRef.current = { x: t.clientX, y: t.clientY };
            joystickDeltaRef.current = { x: 0, y: 0 };
            if (joystickRingRef.current) {
              joystickRingRef.current.style.left    = `${cx - 50}px`;
              joystickRingRef.current.style.top     = `${cy - 50}px`;
              joystickRingRef.current.style.opacity = '1';
            }
            if (joystickKnobRef.current)
              joystickKnobRef.current.style.transform = 'translate(-50%, -50%)';
          } else if (!isLeft && lookTouchIdRef.current === null) {
            lookTouchIdRef.current = t.identifier;
            lookLastRef.current = { x: t.clientX, y: t.clientY };
          }
        }
      }

      function onTouchMove(e: TouchEvent) {
        let consumed = false;
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === joystickTouchIdRef.current) {
            consumed = true;
            const dx = t.clientX - joystickBaseRef.current.x;
            const dy = t.clientY - joystickBaseRef.current.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const clamp = Math.min(dist, JOYSTICK_R);
            const ang = Math.atan2(dy, dx);
            const ox = Math.cos(ang) * clamp;
            const oy = Math.sin(ang) * clamp;
            joystickDeltaRef.current = { x: ox / JOYSTICK_R, y: oy / JOYSTICK_R };
            if (joystickKnobRef.current)
              joystickKnobRef.current.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
          } else if (t.identifier === lookTouchIdRef.current) {
            consumed = true;
            const dx = t.clientX - lookLastRef.current.x;
            const dy = t.clientY - lookLastRef.current.y;
            lookLastRef.current = { x: t.clientX, y: t.clientY };
            playerRef.current.yaw   -= dx * 0.005;
            playerRef.current.pitch  = Math.max(-1.1, Math.min(0.8, playerRef.current.pitch - dy * 0.005));
          }
        }
        if (consumed) e.preventDefault();
      }

      function onTouchEnd(e: TouchEvent) {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === joystickTouchIdRef.current) {
            joystickTouchIdRef.current = null;
            joystickDeltaRef.current = { x: 0, y: 0 };
            if (joystickRingRef.current) joystickRingRef.current.style.opacity = '0';
            if (joystickKnobRef.current) joystickKnobRef.current.style.transform = 'translate(-50%, -50%)';
          } else if (t.identifier === lookTouchIdRef.current) {
            lookTouchIdRef.current = null;
          }
        }
      }

      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchmove',  onTouchMove,  { passive: false });
      container.addEventListener('touchend',   onTouchEnd,   { passive: true });
      container.addEventListener('touchcancel', onTouchEnd,  { passive: true });

      const onResize = () => {
        const nw = container.clientWidth, nh = container.clientHeight;
        camera.aspect = nw / nh; camera.updateProjectionMatrix();
        renderer.setSize(nw, nh); cssRenderer.setSize(nw, nh);
      };
      window.addEventListener('resize', onResize);

      function getFloorY(pz: number): number {
        if (pz >= 2.8) return 1.2;
        if (pz >= 0.3) return 0.6;
        return 0.0;
      }

      function isValidPos(x: number, z: number): boolean {
        return x > -(HALF_W - PLAYER_R) && x < (HALF_W - PLAYER_R)
            && z > -(HALF_D - PLAYER_R) && z < (HALF_D - PLAYER_R);
      }

      // ── Animation loop ──
      const clock = new THREE.Clock();
      let lastEmit = 0, frame = 0, prevNearPrompt = false;

      function animate() {
        if (destroyed) return;
        frame = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const p  = playerRef.current;

        const isLocked = document.pointerLockElement === renderer.domElement;
        const jd = joystickDeltaRef.current;
        const joystickActive = Math.abs(jd.x) > 0.05 || Math.abs(jd.y) > 0.05;

        if (isLocked || joystickActive) {
          const fwd   = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
          const right = new THREE.Vector3( Math.cos(p.yaw), 0, -Math.sin(p.yaw));
          const move  = new THREE.Vector3();
          if (!seatedRef.current) {
            if (isLocked) {
              if (keys['KeyW'] || keys['ArrowUp'])    move.add(fwd);
              if (keys['KeyS'] || keys['ArrowDown'])  move.sub(fwd);
              if (keys['KeyA'] || keys['ArrowLeft'])  move.sub(right);
              if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
            }
            if (joystickActive) {
              move.add(fwd.clone().multiplyScalar(-jd.y));
              move.add(right.clone().multiplyScalar(jd.x));
            }
            if (move.length() > 0) {
              move.normalize().multiplyScalar(MOVE_SPEED * dt);
              const nx = p.x + move.x, nz = p.z + move.z;
              if      (isValidPos(nx, nz))  { p.x = nx; p.z = nz; }
              else if (isValidPos(nx, p.z)) { p.x = nx; }
              else if (isValidPos(p.x, nz)) { p.z = nz; }
            }
          } else {
            const moving = (isLocked && (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'])) || joystickActive;
            if (moving) { seatedRef.current = false; seatedSeatRef.current = null; setSeated(false); }
          }
        }

        if (!seatedRef.current) {
          jumpVelRef.current -= 20 * dt;
          airYRef.current = Math.max(0, airYRef.current + jumpVelRef.current * dt);
          if (airYRef.current === 0) jumpVelRef.current = 0;
        }

        if (!seatedRef.current) {
          let nearest: { x: number; z: number; y: number } | null = null, nearestDist = SEAT_RADIUS;
          for (const seat of SEATS) {
            const d = Math.sqrt((p.x - seat.x) ** 2 + (p.z - seat.z) ** 2);
            if (d < nearestDist) { nearestDist = d; nearest = seat; }
          }
          nearSeatRef.current = nearest;
          const show = nearest !== null;
          if (show !== prevNearPrompt) { prevNearPrompt = show; setNearSeatPrompt(show); }
        } else {
          nearSeatRef.current = null;
          if (prevNearPrompt) { prevNearPrompt = false; setNearSeatPrompt(false); }
        }

        const floorY = seatedRef.current ? (seatedSeatRef.current?.y ?? 0) : getFloorY(p.z);
        const eyeY = seatedRef.current ? floorY + EYE_H_SEATED : floorY + EYE_H + airYRef.current;
        camera.position.set(p.x, eyeY, p.z);
        camera.quaternion.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));

        const now = Date.now();
        if (now - lastEmit > 80 && socketRef.current) { socketRef.current.emit('move', { x: p.x, z: p.z }); lastEmit = now; }

        otherUsersRef.current.forEach(({ mesh, data, bubbles }) => {
          mesh.position.x += (data.x - mesh.position.x) * 0.15;
          mesh.position.z += (data.z - mesh.position.z) * 0.15;
          bubbles.forEach(b => {
            b.sprite.position.x += (mesh.position.x - b.sprite.position.x) * 0.15;
            b.sprite.position.z += (mesh.position.z - b.sprite.position.z) * 0.15;
          });
        });
        localBubblesRef.current.forEach(b => {
          b.sprite.position.x += (p.x - b.sprite.position.x) * 0.15;
          b.sprite.position.z += (p.z - b.sprite.position.z) * 0.15;
        });

        renderer.render(scene, camera);
        cssRenderer.render(cssScene, camera);
      }
      animate();

      return () => {
        destroyed = true; cancelAnimationFrame(frame); document.exitPointerLock();
        window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('resize', onResize);
        container.removeEventListener('touchstart', onTouchStart); container.removeEventListener('touchmove', onTouchMove); container.removeEventListener('touchend', onTouchEnd); container.removeEventListener('touchcancel', onTouchEnd);
        renderer.dispose(); localBubblesRef.current.forEach(b => clearTimeout(b.timer));
        iframe.src = 'about:blank';
        if (container.contains(renderer.domElement))    container.removeChild(renderer.domElement);
        if (container.contains(cssRenderer.domElement)) container.removeChild(cssRenderer.domElement);
        addAvatarRef.current = addBubbleRef.current = addLocalBubbleRef.current = removeAvatarRef.current = null;
      };
    })();

    return () => { destroyed = true; };
  }, [platform, contentId]);

  // ── Personalized suggestions from watch history ──────────────────────────
  const loadSuggestions = useCallback(async () => {
    if (suggestionsLoaded.current) return;
    suggestionsLoaded.current = true;
    const history = getHistory();
    if (history.length === 0) return;
    const profile = buildTasteProfile(history);
    if (profile.queries.length === 0) return;

    setLoadingSuggs(true);
    const watchedIds = new Set(history.map(h => h.id));
    const seen = new Set<string>();
    const recs: any[] = [];

    await Promise.all(
      profile.queries.slice(0, 3).map(async (q) => {
        try {
          const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          (data.results || []).forEach((r: any) => {
            if (!watchedIds.has(r.id) && !seen.has(r.id)) { seen.add(r.id); recs.push(r); }
          });
        } catch {}
      })
    );
    setSuggestions(recs.slice(0, 9));
    setLoadingSuggs(false);
  }, []);

  useEffect(() => { if (showSearch) loadSuggestions(); }, [showSearch, loadSuggestions]);
  // Also load suggestions eagerly in the background (needed for solo auto-advance)
  useEffect(() => { const t = setTimeout(loadSuggestions, 3000); return () => clearTimeout(t); }, [loadSuggestions]);

  // ── Search ────────────────────────────────────────────────────────────────
  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/search/youtube?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch { setSearchResults([]); }
    finally   { setSearching(false); }
  }

  async function handleAddToQueue(videoId: string, videoTitle: string, thumbnail: string, plat: string) {
    if (!token) {
      setQueueMsg('Debes iniciar sesión para agregar videos');
      setTimeout(() => setQueueMsg(''), 3000);
      return;
    }
    if (queueAdding) return;
    if (!socketRef.current?.connected) {
      setQueueMsg('Sin conexión a la sala, recarga la página');
      setTimeout(() => setQueueMsg(''), 3500);
      return;
    }
    setQueueAdding(true);
    try {
      const res = await fetch('/api/points/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 30 }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* JSON parse failed, keep empty object */ }

      if (!res.ok) {
        setQueueMsg(
          res.status === 402
            ? `Necesitas 30 🪙 · tienes ${roomPoints}`
            : res.status === 401
              ? 'Sesión expirada, vuelve a iniciar sesión'
              : `Error al agregar (${res.status})`
        );
        setTimeout(() => setQueueMsg(''), 3500);
        return;
      }

      // Points deducted successfully — update local state immediately
      const newPoints = data.points ?? roomPoints - 30;
      setRoomPoints(newPoints);
      updateUser({ points: newPoints });

      // Emit socket event to add to queue
      socketRef.current.emit('queue-add', { videoId, videoTitle, thumbnail, platform: plat });

      setShowSearch(false);
      setQueueMode(false);
      setSearchResults([]);
      setSearchQuery('');
      setShowQueue(true);
      setQueueMsg(`"${videoTitle.slice(0, 28)}" agregado · -30 🪙`);
      setTimeout(() => setQueueMsg(''), 3500);
    } catch {
      setQueueMsg('Error de red al conectar con el servidor');
      setTimeout(() => setQueueMsg(''), 3500);
    } finally {
      setQueueAdding(false);
    }
  }

  async function handleSkipVideo() {
    if (!token || queue.length === 0) return;
    if (!socketRef.current?.connected) {
      setQueueMsg('Sin conexión a la sala');
      setTimeout(() => setQueueMsg(''), 3000);
      return;
    }
    try {
      const res = await fetch('/api/points/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: 1000 }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* ignore */ }
      if (!res.ok) {
        setQueueMsg(res.status === 402 ? `Necesitas 1000 🪙 · tienes ${roomPoints}` : 'Error al omitir');
        setTimeout(() => setQueueMsg(''), 3500);
        return;
      }
      const newPoints = data.points ?? roomPoints - 1000;
      setRoomPoints(newPoints);
      updateUser({ points: newPoints });
      socketRef.current.emit('queue-advance');
    } catch {
      setQueueMsg('Error de red');
      setTimeout(() => setQueueMsg(''), 3000);
    }
  }

  function changeVideo(videoId: string, plat?: string, suggIdx?: number) {
    if (iframeRef.current) iframeRef.current.src = buildVideoUrl(plat || platform, videoId);
    socketRef.current?.emit('change-video', { roomId, videoId });
    setShowSearch(false); setSearchResults([]); setSearchQuery('');
    setIsPaused(false); // Reset pause state on every video change
    if (suggIdx !== undefined) setCurrentSuggIdx(suggIdx);
  }

  function sendMessage() {
    if (!chatInput.trim() || !socketRef.current) return;
    const msg: ChatMsg = { userId: myUserId, username: myUsername, color: myColor, message: chatInput.trim(), timestamp: Date.now() };
    socketRef.current.emit('chat-message', { roomId, ...msg });
    setMessages(m => [...m.slice(-49), msg]);
    addLocalBubbleRef.current?.(msg.message, myColor);
    setChatInput('');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black select-none"
      style={{ cursor: locked ? 'none' : 'default', touchAction: 'none' }}>

      {/* Invite toast */}
      {invite && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl"
          style={{ background: 'rgba(10,10,30,0.95)', border: '1px solid rgba(99,102,241,0.5)', backdropFilter: 'blur(12px)' }}>
          <span className="text-xl">👥</span>
          <div>
            <p className="text-white text-sm font-bold">{invite.from} te invita</p>
            <p className="text-slate-400 text-xs">a su sala inmersiva</p>
          </div>
          <button onClick={() => { window.location.href = invite.roomUrl; }}
            className="ml-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors">
            Unirse
          </button>
          <button onClick={() => setInvite(null)} className="text-slate-500 hover:text-white text-lg ml-1">×</button>
        </div>
      )}

      {/* ── Points HUD ── always visible when logged in ── */}
      {user && (
        <div className="absolute top-3 right-3 z-20 pointer-events-none flex flex-col items-end gap-1.5">

          {/* Coin badge */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl"
            style={{
              background: pointsAnim ? 'rgba(245,158,11,0.22)' : 'rgba(10,10,30,0.75)',
              border: `1px solid ${pointsAnim ? 'rgba(245,158,11,0.55)' : 'rgba(245,158,11,0.22)'}`,
              backdropFilter: 'blur(14px)',
              boxShadow: pointsAnim ? '0 0 18px rgba(245,158,11,0.35)' : 'none',
              transition: 'background 0.4s, border 0.4s, box-shadow 0.4s',
            }}>
            <span className="text-lg leading-none">🪙</span>
            <p className="text-amber-300 font-black text-base leading-none tabular-nums">{roomPoints.toLocaleString()}</p>
          </div>

          {/* Progress bar — seconds until next grant */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-amber-400/70 transition-all duration-1000 ease-linear"
                style={{ width: `${(secsInMin / 60) * 100}%` }} />
            </div>
            <span className="text-[10px] text-slate-500 tabular-nums whitespace-nowrap">
              +10 en {60 - secsInMin}s
            </span>
          </div>

          {/* +10 float animation */}
          {pointsAnim && (
            <div key={pointsAnim} className="text-amber-300 font-black text-sm"
              style={{ animation: 'slideUpFade 2.2s ease forwards' }}>
              +10 pts 🪙
            </div>
          )}
        </div>
      )}

      {/* Locked HUD */}
      {locked && (
        <>
          <div className="absolute top-3 left-3 z-20 glass rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 pointer-events-none">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {online} en la sala
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">ESC · T · E</span>
          </div>

          {(nearSeatPrompt || seated) && (
            <div className="absolute bottom-24 left-1/2 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }}>
              <span className="inline-flex items-center justify-center rounded-md text-xs font-bold px-1.5 py-0.5"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fbbf24', minWidth: '1.4rem' }}>E</span>
              {seated ? 'Levantarte' : 'Sentarte'}
            </div>
          )}

          <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center" style={{ paddingBottom: '80px' }}>
            <div className="relative w-4 h-4">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/50 -translate-y-1/2" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/50 -translate-x-1/2" />
            </div>
          </div>
        </>
      )}

      {/* ── Mobile joystick + look zones ── */}
      {isMobile && !showSearch && (
        <>
          {/* Zone hint labels — subtle, pointer-events-none */}
          <div className="absolute z-10 pointer-events-none flex flex-col items-center gap-0.5 opacity-20"
            style={{ left: '14px', bottom: 'calc(88px + max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px)))' }}>
            <span className="text-3xl">🕹</span>
            <span className="text-white text-[11px] font-semibold">Mover</span>
          </div>
          <div className="absolute z-10 pointer-events-none flex flex-col items-center gap-0.5 opacity-20"
            style={{ right: '14px', bottom: 'calc(88px + max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px)))' }}>
            <span className="text-3xl">👁</span>
            <span className="text-white text-[11px] font-semibold">Mirar</span>
          </div>
          {/* Dynamic joystick ring — appears where user touches */}
          <div ref={joystickRingRef}
            className="absolute z-20 pointer-events-none"
            style={{ width: '104px', height: '104px', opacity: 0, transition: 'opacity 0.12s' }}>
            <div className="absolute inset-0 rounded-full border-2 border-white/35 bg-black/25" />
            <div ref={joystickKnobRef}
              className="absolute w-11 h-11 rounded-full bg-white/45 border-2 border-white/65 shadow-lg"
              style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
          </div>
        </>
      )}

      {/* Queue message toast */}
      {queueMsg && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-xl text-sm font-medium text-white pointer-events-none"
          style={{ background: 'rgba(10,10,30,0.95)', border: '1px solid rgba(99,102,241,0.4)', backdropFilter: 'blur(12px)' }}>
          {queueMsg}
        </div>
      )}

      {/* Queue panel — wall-mounted list */}
      {showQueue && (
        <div className="absolute left-3 z-20 w-64 flex flex-col rounded-2xl overflow-hidden"
          style={{ top: '60px', maxHeight: 'calc(100% - 160px)', background: 'rgba(6,6,22,0.92)', border: '1px solid rgba(99,102,241,0.25)', backdropFilter: 'blur(16px)' }}
          onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <span className="text-white font-bold text-sm">Cola de videos</span>
              {queue.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-600/40 text-indigo-300">{queue.length}</span>
              )}
            </div>
            <button onClick={() => setShowQueue(false)} className="text-slate-500 hover:text-white text-lg leading-none px-1">×</button>
          </div>

          {/* Queue items */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5">
            {queue.length === 0 && (
              <div className="flex flex-col items-center py-6 text-center">
                <span className="text-3xl mb-2">🎬</span>
                <p className="text-slate-500 text-xs">Sin videos en cola</p>
                <p className="text-slate-600 text-[11px] mt-1">Agrega el tuyo por 30 🪙</p>
              </div>
            )}
            {queue.map((item, i) => (
              <div key={item.id}
                className="flex items-start gap-2 p-2 rounded-xl"
                style={{
                  background: i === 0 ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
                  border: i === 0 ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.04)',
                }}>
                {/* Position badge */}
                <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
                  {i === 0
                    ? <span className="text-[9px] font-black text-amber-400 leading-none">▶</span>
                    : <span className="text-[9px] font-bold text-slate-600 leading-none tabular-nums">{i + 1}</span>
                  }
                </div>
                {/* Thumbnail */}
                {item.thumbnail
                  ? <img src={item.thumbnail} alt="" className="w-14 h-9 rounded-lg object-cover shrink-0" />
                  : <div className="w-14 h-9 rounded-lg bg-white/5 shrink-0 flex items-center justify-center text-lg">▶</div>
                }
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-white text-[11px] font-medium leading-snug line-clamp-2">{item.videoTitle}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                    <p className="text-[10px] text-slate-500 truncate">{item.username}</p>
                  </div>
                  {i === 0 && <span className="text-[9px] font-bold text-amber-500/70 uppercase tracking-wide">Reproduciendo</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="px-2 py-2 border-t border-white/5 shrink-0 space-y-1.5">
            {/* Cuando hay 2+ personas, la cola es el único modo de poner videos */}
            {online >= 2 && user && token && (
              <p className="text-center text-indigo-400/60 text-[10px] font-semibold uppercase tracking-wide pb-0.5">
                👥 Sala con varios · usa la cola
              </p>
            )}
            {user && token && (
              <button
                onClick={() => { setQueueMode(true); setShowQueue(false); setShowSearch(true); }}
                disabled={queueAdding}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
                <span>+</span> Agregar video
                <span className="text-amber-400 font-black">30 🪙</span>
              </button>
            )}
            {user && token && queue.length > 0 && (
              <button
                onClick={handleSkipVideo}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                ⏭ Omitir video
                <span className="text-amber-400 font-black">1000 🪙</span>
              </button>
            )}
            {!user && (
              <p className="text-center text-slate-600 text-[11px] py-1">Inicia sesión para agregar videos</p>
            )}
          </div>
        </div>
      )}

      {/* ── Solo suggestions tray — appears above control bar when alone ── */}
      {online === 1 && showSuggestions && !showSearch && (
        <div
          className="absolute z-20 left-0 right-0 flex flex-col"
          style={{ bottom: 'calc(120px + max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px)))', background: 'rgba(6,6,22,0.93)', borderTop: '1px solid rgba(99,102,241,0.18)', borderBottom: '1px solid rgba(99,102,241,0.18)', backdropFilter: 'blur(16px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm">✨</span>
              <span className="text-indigo-300 font-semibold text-xs uppercase tracking-wide">Sugerencias para ti</span>
              {loadingSuggs && <span className="text-slate-500 text-[10px]">cargando…</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setQueueMode(false); setShowSearch(true); }}
                className="text-slate-400 hover:text-white text-[11px] px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
                🔍 Buscar
              </button>
              <button onClick={() => setShowSuggestions(false)} className="text-slate-500 hover:text-white text-lg leading-none px-1">×</button>
            </div>
          </div>

          {/* Scrollable horizontal strip */}
          <div className="flex gap-3 overflow-x-auto px-4 pb-3 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
            {loadingSuggs && Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shrink-0 w-32 rounded-xl bg-white/5 animate-pulse" style={{ height: '72px' }} />
            ))}
            {!loadingSuggs && suggestions.length === 0 && (
              <p className="text-slate-600 text-xs py-3">
                Ve más videos para recibir sugerencias personalizadas
              </p>
            )}
            {suggestions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => changeVideo(s.id, s.platform || 'youtube', i)}
                className="shrink-0 flex flex-col rounded-xl overflow-hidden transition-all text-left"
                style={{
                  width: '128px',
                  border: currentSuggIdx === i
                    ? '2px solid rgba(99,102,241,0.8)'
                    : '2px solid rgba(255,255,255,0.06)',
                  background: currentSuggIdx === i ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)',
                }}
              >
                {/* Thumbnail */}
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  {s.thumbnail
                    ? <img src={s.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    : <div className="absolute inset-0 bg-white/5 flex items-center justify-center text-xl">▶</div>
                  }
                  {currentSuggIdx === i && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-white text-lg">▶</span>
                    </div>
                  )}
                </div>
                {/* Title */}
                <div className="px-1.5 py-1">
                  <p className="text-white text-[10px] font-medium leading-snug line-clamp-2">{s.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Control panel — responsive: compact icons on mobile, full labels on desktop */}
      {!locked && !chatting && !showSearch && (
        <div
          className="absolute z-20 left-0 right-0 flex justify-center px-2"
          style={{ bottom: 'calc(64px + max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px)))' }}
          onClick={e => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5 rounded-2xl border border-white/10 overflow-x-auto"
            style={{ background: 'rgba(8,8,28,0.88)', backdropFilter: 'blur(14px)', scrollbarWidth: 'none', maxWidth: '100%' }}
          >
            {/* Play/Pause */}
            <button
              onClick={() => { isPaused ? sendYTCmd('playVideo') : sendYTCmd('pauseVideo'); setIsPaused(v => !v); }}
              className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm sm:text-base transition-colors">
              {isPaused ? '▶' : '⏸'}
            </button>
            {/* Mute */}
            <button
              onClick={() => { isMuted ? sendYTCmd('unMute') : sendYTCmd('mute'); setIsMuted(v => !v); }}
              className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-base sm:text-lg transition-colors">
              {isMuted ? '🔇' : '🔊'}
            </button>
            {/* Volume */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <span className="hidden sm:block text-xs text-slate-500 select-none">Vol</span>
              <input type="range" min="0" max="100" value={volume}
                onChange={e => { const v = Number(e.target.value); setVolume(v); sendYTCmd('setVolume', [v]); if (v > 0 && isMuted) { sendYTCmd('unMute'); setIsMuted(false); } }}
                className="w-16 sm:w-24 accent-indigo-500 cursor-pointer" />
              <span className="hidden sm:block text-xs text-slate-500 w-6 text-right select-none">{volume}</span>
            </div>
            <div className="w-px h-5 sm:h-6 bg-white/10 shrink-0" />
            {/* Queue toggle */}
            <button onClick={() => setShowQueue(v => !v)}
              className="relative shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-medium transition-colors">
              📋<span className="hidden sm:inline ml-1">Cola</span>
              {queue.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-[9px] font-black text-black flex items-center justify-center">
                  {queue.length > 9 ? '9+' : queue.length}
                </span>
              )}
            </button>
            {/* Solo mode: suggestions + search */}
            {online === 1 && (<>
              <button
                onClick={() => setShowSuggestions(v => !v)}
                className="shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: showSuggestions ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.15)',
                  border: showSuggestions ? '1px solid rgba(99,102,241,0.6)' : '1px solid transparent',
                  color: '#a5b4fc',
                }}>
                ✨<span className="hidden sm:inline ml-1">Sugerencias</span>
              </button>
              <button onClick={() => { setQueueMode(false); setShowSearch(true); }}
                className="shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-medium transition-colors">
                🔍<span className="hidden sm:inline ml-1">Buscar</span>
              </button>
            </>)}
            {/* Multi-user: add to queue */}
            {online >= 2 && user && (
              <button onClick={() => { setQueueMode(true); setShowSearch(true); }}
                className="shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-medium transition-colors">
                🎵<span className="hidden sm:inline ml-1">+ Cola</span>
                <span className="hidden sm:inline text-amber-400 font-bold ml-0.5">30🪙</span>
              </button>
            )}
            {/* Skip */}
            {queue.length > 0 && user && (
              <button onClick={handleSkipVideo}
                className="shrink-0 flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors">
                ⏭<span className="hidden sm:inline ml-1">Omitir</span>
                <span className="hidden sm:inline text-amber-400 font-bold ml-0.5">1000🪙</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search overlay */}
      {showSearch && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'rgba(4,4,20,0.97)', paddingBottom: 'calc(68px + max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px)))' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 shrink-0">
            <span className="text-xl">{queueMode ? '📋' : '🔍'}</span>
            <div>
              <h2 className="text-white font-bold">{queueMode ? 'Agregar a la cola' : 'Buscar video'}</h2>
              {queueMode
                ? <p className="text-amber-400/70 text-xs font-semibold">Selecciona un video · cuesta <span className="text-amber-300">30 🪙</span></p>
                : <p className="text-slate-400 text-xs">Cambia el video que se reproduce en la sala</p>
              }
            </div>
            <div className="flex-1" />
            <button onClick={() => { setShowSearch(false); setQueueMode(false); setSearchResults([]); setSearchQuery(''); }}
              className="text-slate-500 hover:text-white text-xl px-2">×</button>
          </div>
          <div className="flex gap-2 px-5 py-3 shrink-0">
            <input className="flex-1 input" placeholder="Buscar en YouTube..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()} autoFocus />
            <button onClick={doSearch} disabled={searching} className="btn-primary px-4 disabled:opacity-50">
              {searching ? '...' : 'Buscar'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4">

            {/* Personalized suggestions — shown when query is empty */}
            {!searchQuery && (
              <>
                {loadingSuggs && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="aspect-video bg-white/5 rounded-xl animate-pulse" />
                    ))}
                  </div>
                )}
                {!loadingSuggs && suggestions.length > 0 && (
                  <>
                    <p className="text-xs text-indigo-400/70 font-semibold uppercase tracking-wide mb-3">✨ Para ti</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {suggestions.map((r, i) => (
                        <button key={r.id}
                          onClick={() => queueMode
                            ? handleAddToQueue(r.id, r.title || '', r.thumbnail || '', r.platform || 'youtube')
                            : changeVideo(r.id, r.platform, i)}
                          disabled={queueMode && queueAdding}
                          className="flex flex-col rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/60 bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left disabled:opacity-60">
                          {r.thumbnail
                            ? <div className="relative w-full" style={{ paddingBottom: '56.25%' }}><img src={r.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /></div>
                            : <div className="w-full bg-white/5 relative" style={{ paddingBottom: '56.25%' }}><span className="absolute inset-0 flex items-center justify-center text-2xl">▶</span></div>
                          }
                          <div className="p-2.5">
                            <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{r.title}</p>
                            {r.channel && <p className="text-slate-500 text-[11px] mt-1 truncate">{r.channel}</p>}
                            {queueMode && <p className="text-amber-400 text-[10px] font-bold mt-1">+ Agregar · 30 🪙</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {!loadingSuggs && suggestions.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <span className="text-4xl mb-3">🔍</span>
                    <p className="text-slate-400 text-sm">Busca un video para {queueMode ? 'agregar a la cola' : 'reproducir en la sala'}</p>
                    <p className="text-slate-600 text-xs mt-1">Tus sugerencias aparecerán aquí cuando hayas visto más videos</p>
                  </div>
                )}
              </>
            )}

            {/* Search results */}
            {(searchResults.length > 0 || (searching && searchQuery)) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                {searchResults.map(result => (
                  <button key={result.id}
                    onClick={() => queueMode
                      ? handleAddToQueue(result.id, result.title || '', result.thumbnail || '', result.platform || 'youtube')
                      : changeVideo(result.id, result.platform)}
                    disabled={queueMode && queueAdding}
                    className="flex flex-col rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/60 bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left disabled:opacity-60">
                    {result.thumbnail
                      ? <div className="relative w-full" style={{ paddingBottom: '56.25%' }}><img src={result.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /></div>
                      : <div className="w-full bg-white/5 relative" style={{ paddingBottom: '56.25%' }}><span className="absolute inset-0 flex items-center justify-center text-2xl">▶</span></div>
                    }
                    <div className="p-2.5">
                      <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{result.title}</p>
                      {result.channel && <p className="text-slate-500 text-[11px] mt-1 truncate">{result.channel}</p>}
                      {queueMode && <p className="text-amber-400 text-[10px] font-bold mt-1">+ Agregar · 30 🪙</p>}
                    </div>
                  </button>
                ))}
                {!searching && searchQuery && searchResults.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-600">No se encontraron resultados</div>
                )}
              </div>
            )}

          </div>
        </div>
      )}

      {/* Chat bar — padded for mobile browser chrome (safe-area-inset-bottom) */}
      <div className="absolute bottom-0 left-0 right-0 z-20"
        style={{ background: 'rgba(4,4,18,0.82)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--vp-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}>
        {messages.length > 0 && (
          <div className="px-4 pt-1.5 pb-0 space-y-0.5">
            {messages.slice(-3).map((msg, i) =>
              msg.userId === 'system'
                ? <p key={i} className="text-slate-600 text-[11px] italic">{msg.message}</p>
                : <p key={i} className="text-xs leading-snug"><span className="font-bold" style={{ color: msg.color }}>{msg.username}: </span><span className="text-slate-300">{msg.message}</span></p>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            style={{ background: myColor }}>{myUsername[0].toUpperCase()}</div>
          <input ref={chatInputRef}
            className="flex-1 bg-transparent text-white placeholder-slate-600 text-sm outline-none"
            placeholder={locked ? 'Presiona T para chatear…' : 'Escribe un mensaje y pulsa Enter…'}
            value={chatInput} readOnly={locked && !chatting}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !locked) { sendMessage(); }
              else if (e.key === 'Enter' && chatting) { sendMessage(); setChatting(false); containerRef.current?.querySelector('canvas')?.requestPointerLock(); }
              else if (e.key === 'Escape') { setChatting(false); }
            }} maxLength={200} />
          <span className="text-slate-700 text-xs shrink-0">{online} en línea</span>
          <button onClick={() => { sendMessage(); if (chatting) { setChatting(false); containerRef.current?.querySelector('canvas')?.requestPointerLock(); } }}
            disabled={!chatInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs transition-colors shrink-0">
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
