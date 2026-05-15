'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

// ── World constants ───────────────────────────────────────────────────────────
const SCREEN_W     = 8;
const SCREEN_H     = SCREEN_W * (9 / 16);   // 4.5
const SCREEN_Y0    = 0.4;
const SCREEN_Y1    = SCREEN_Y0 + SCREEN_H;  // 4.9
const IFRAME_PX    = 1600;
const IFRAME_SCALE = SCREEN_W / IFRAME_PX;
const MOVE_SPEED   = 6;
const EYE_H        = 1.7;
const EYE_H_SEATED = 0.72;
const BUBBLE_LIFETIME = 5000;
const BUBBLE_H     = 0.44;
const SEAT_RADIUS  = 1.5;
const WALL_T       = 0.22;

const HALL_HW  = 4;    // hallway half-width → total 8 units
const HALL_H   = 5;
const HALL_Z0  = -5;
const HALL_Z1  = 90;

const ROOM_W   = 16;
const ROOM_D   = 14;
const ROOM_H   = 5;
const DOOR_W   = 4.4;
const DOOR_H   = 3.5;

const LEFT_X_CTR = -(HALL_HW + ROOM_W / 2);   // -12
const RIGHT_X_CTR =  HALL_HW + ROOM_W / 2;    //  12
const LEFT_X_FAR  = -(HALL_HW + ROOM_W);      // -20
const RIGHT_X_FAR =  HALL_HW + ROOM_W;        //  20

const ROOM_Z_CENTERS = [9, 27, 45, 63];
const GLOBAL_ROOM_Z  = 81;  // Sala Global (right side, after all genre rows)

interface GenreRoom {
  id: string; name: string; emoji: string;
  wallColor: number; accentColor: number;
  query: string; side: 'left' | 'right'; row: number;
}

const GENRE_ROOMS: GenreRoom[] = [
  { id: 'trap',      name: 'Trap / Hip-Hop',    emoji: '🎤', wallColor: 0x0d0020, accentColor: 0x7c3aed, query: 'trap hip hop 2024',      side: 'left',  row: 0 },
  { id: 'reggaeton', name: 'Reggaeton',          emoji: '🎵', wallColor: 0x001a0a, accentColor: 0x16a34a, query: 'reggaeton 2024',         side: 'right', row: 0 },
  { id: 'edm',       name: 'Electronic / EDM',  emoji: '🎛', wallColor: 0x00081c, accentColor: 0x0891b2, query: 'electronic edm music',   side: 'left',  row: 1 },
  { id: 'rock',      name: 'Rock',              emoji: '🎸', wallColor: 0x160000, accentColor: 0xdc2626, query: 'rock hits music',        side: 'right', row: 1 },
  { id: 'rnb',       name: 'R&B / Soul',        emoji: '💜', wallColor: 0x0d0012, accentColor: 0xdb2777, query: 'rnb soul music',         side: 'left',  row: 2 },
  { id: 'pop',       name: 'Pop',               emoji: '⭐', wallColor: 0x150e00, accentColor: 0xd97706, query: 'pop music hits 2024',    side: 'right', row: 2 },
  { id: 'latinpop',  name: 'Latin Pop',         emoji: '🌴', wallColor: 0x001212, accentColor: 0x0d9488, query: 'latin pop musica 2024',  side: 'left',  row: 3 },
  { id: 'corridos',  name: 'Corridos Tumbados', emoji: '🤠', wallColor: 0x100900, accentColor: 0xea580c, query: 'corridos tumbados 2024', side: 'right', row: 3 },
];

const roomXCtr  = (r: GenreRoom) => r.side === 'left' ? LEFT_X_CTR  : RIGHT_X_CTR;
const roomXFar  = (r: GenreRoom) => r.side === 'left' ? LEFT_X_FAR  : RIGHT_X_FAR;
const roomXHall = (r: GenreRoom) => r.side === 'left' ? -HALL_HW    : HALL_HW;
const roomZCtr  = (r: GenreRoom) => ROOM_Z_CENTERS[r.row];

// All seats in the world (2 rows × 5 cols per genre room)
const SEATS: { x: number; z: number; elevation: number }[] = [];
for (const room of GENRE_ROOMS) {
  const xc = roomXCtr(room), zc = roomZCtr(room);
  for (let row = 0; row < 2; row++)
    for (let col = -2; col <= 2; col++)
      SEATS.push({ x: xc + col * 1.7, z: zc - 2.5 + row * 3.0, elevation: 0 });
}

function detectGenreRoom(px: number, pz: number): GenreRoom | null {
  for (const room of GENRE_ROOMS) {
    const xFar = roomXFar(room), xHall = roomXHall(room), zc = roomZCtr(room);
    const inX = room.side === 'left'
      ? (px < xHall - 0.2 && px > xFar + WALL_T)
      : (px > xHall + 0.2 && px < xFar - WALL_T);
    if (inX && Math.abs(pz - zc) < ROOM_D / 2 - 0.2) return room;
  }
  return null;
}

interface RoomUser { socketId: string; userId: string; username: string; color: string; x: number; z: number }
interface ChatMsg  { userId: string; username: string; color: string; message: string; timestamp: number }
interface Props    { platform: string; contentId: string; roomId: string; videoSrc: string }

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
  const t = message.length > 28 ? message.slice(0, 28) + '…' : message;
  ctx.fillText(t, cv.width / 2, cv.height / 2);
  return cv;
}

export default function ImmersiveRoom3D({ platform, contentId, roomId, videoSrc }: Props) {
  const { user } = useAuth();
  const router   = useRouter();

  const containerRef    = useRef<HTMLDivElement>(null);
  const iframeRef       = useRef<HTMLIFrameElement | null>(null);
  const socketRef       = useRef<Socket | null>(null);
  const playerRef       = useRef({ x: 0, z: 2, yaw: 0, pitch: 0 });
  const chatInputRef    = useRef<HTMLInputElement>(null);
  const pendingUsersRef = useRef<RoomUser[]>([]);
  const chatModeRef     = useRef(false);
  const seatedRef       = useRef(false);
  const nearSeatRef     = useRef<{ x: number; z: number; elevation: number } | null>(null);
  const seatElevRef     = useRef(0);
  const jumpVelRef      = useRef(0);
  const airYRef         = useRef(0);

  const addAvatarRef      = useRef<((u: RoomUser) => void) | null>(null);
  const removeAvatarRef   = useRef<((sid: string) => void) | null>(null);
  const addBubbleRef      = useRef<((sid: string, msg: string, color: string) => void) | null>(null);
  const addLocalBubbleRef = useRef<((msg: string, color: string) => void) | null>(null);
  const otherUsersRef     = useRef<Map<string, { mesh: any; data: RoomUser; bubbles: { sprite: any; timer: ReturnType<typeof setTimeout> }[] }>>(new Map());
  const localBubblesRef   = useRef<{ sprite: any; timer: ReturnType<typeof setTimeout> }[]>([]);

  const [locked,         setLocked]         = useState(false);
  const [chatting,       setChatting]       = useState(false);
  const [messages,       setMessages]       = useState<ChatMsg[]>([]);
  const [chatInput,      setChatInput]      = useState('');
  const [online,         setOnline]         = useState(1);
  const [invite,         setInvite]         = useState<{ from: string; roomUrl: string } | null>(null);
  const [isMuted,        setIsMuted]        = useState(false);
  const [isPaused,       setIsPaused]       = useState(false);
  const [volume,         setVolume]         = useState(80);
  const [showSearch,     setShowSearch]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState<any[]>([]);
  const [searching,      setSearching]      = useState(false);
  const [nearSeatPrompt, setNearSeatPrompt] = useState(false);
  const [seated,         setSeated]         = useState(false);
  const [activeRoom,     setActiveRoom]     = useState<GenreRoom | null>(null);
  const [inGlobalRoom,   setInGlobalRoom]   = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQ,  setGlobalSearchQ]  = useState('');
  const [globalResults,  setGlobalResults]  = useState<any[]>([]);
  const [globalSearching,setGlobalSearching]= useState(false);
  const inGlobalRoomRef   = useRef(false);
  const setGlobalVideoRef = useRef<((videoId: string) => void) | null>(null);

  const myUsername = useMemo(() => user?.username    || guestName(),                                    [user?.username]);
  const myColor    = useMemo(() => user?.avatarColor || '#6366f1',                                      [user?.avatarColor]);
  const myUserId   = useMemo(() => user?.id          || 'guest-' + Math.random().toString(36).slice(2), [user?.id]);

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
      scene.fog = new THREE.FogExp2(0x03030a, 0.014);

      const camera = new THREE.PerspectiveCamera(75, W / H, 0.05, 120);
      camera.position.set(0, EYE_H, 2);

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
      // Hallway ceiling lights
      for (let z = 5; z < HALL_Z1; z += 16) {
        const l = new THREE.PointLight(0x2233aa, 1.5, 22);
        l.position.set(0, HALL_H - 0.3, z);
        scene.add(l);
      }
      // Per-room accent lights (always on for ambience)
      for (const room of GENRE_ROOMS) {
        const l = new THREE.PointLight(room.accentColor, 2.5, 22);
        l.position.set(roomXCtr(room), ROOM_H - 0.4, roomZCtr(room));
        scene.add(l);
      }

      // ── Textures ──
      const texLoader = new THREE.TextureLoader();
      const floorTex = texLoader.load('/textures/floor.jpg');
      floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
      floorTex.repeat.set(5, 4);
      floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const wallTex = texLoader.load('/textures/wall.jpg');
      wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
      wallTex.repeat.set(3, 1);
      wallTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

      // ── Materials ──
      const hallFloorMat = new THREE.MeshLambertMaterial({ map: floorTex });
      const hallWallMat  = new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide });
      const hallCeilMat  = new THREE.MeshLambertMaterial({ color: 0x06060f });
      const seatMat      = new THREE.MeshLambertMaterial({ color: 0x15082a });
      const seatBackMat  = new THREE.MeshLambertMaterial({ color: 0x1e0d35 });
      const frameMat     = new THREE.MeshLambertMaterial({ color: 0x1a1a40, emissive: new THREE.Color(0x2233cc), emissiveIntensity: 0.6 });

      // ── Geometry helpers ──
      function addBox(w: number, h: number, d: number, x: number, y: number, z: number, mat: any) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
      }

      // Build a wall along Z axis with door/window holes
      function wallAlongZ(
        x: number, z0: number, z1: number, height: number, thickness: number,
        holes: { z: number; hw: number; holeH: number }[], mat: any
      ) {
        const events = [z0, ...holes.flatMap(h => [h.z - h.hw, h.z + h.hw]), z1].sort((a, b) => a - b);
        const holeMap = new Map(holes.map(h => [`${h.z - h.hw}`, h]));
        let i = 0;
        while (i < events.length - 1) {
          const a = events[i], b = events[i + 1], mid = (a + b) / 2, len = b - a;
          const hole = holeMap.get(String(a));
          if (hole) {
            const lintelH = height - hole.holeH;
            if (lintelH > 0.01) addBox(thickness, lintelH, len, x, hole.holeH + lintelH / 2, mid, mat);
          } else {
            if (len > 0.01) addBox(thickness, height, len, x, height / 2, mid, mat);
          }
          i++;
        }
      }

      // ── Hallway ──
      const hallLen = HALL_Z1 - HALL_Z0;
      const hallMid = (HALL_Z0 + HALL_Z1) / 2;
      addBox(HALL_HW * 2, 0.1, hallLen, 0, -0.05, hallMid, hallFloorMat);
      addBox(HALL_HW * 2, 0.1, hallLen, 0, HALL_H + 0.05, hallMid, hallCeilMat);
      // Hallway end caps
      addBox(HALL_HW * 2, HALL_H, WALL_T, 0, HALL_H / 2, HALL_Z0 - WALL_T / 2, hallWallMat);
      addBox(HALL_HW * 2, WALL_T, HALL_HW * 2, 0, HALL_H + WALL_T / 2, hallMid, hallCeilMat); // ceiling strip

      const leftHoles  = GENRE_ROOMS.filter(r => r.side === 'left').map(r => ({ z: roomZCtr(r), hw: DOOR_W / 2, holeH: DOOR_H }));
      const rightHoles = [
        ...GENRE_ROOMS.filter(r => r.side === 'right').map(r => ({ z: roomZCtr(r), hw: DOOR_W / 2, holeH: DOOR_H })),
        { z: GLOBAL_ROOM_Z, hw: DOOR_W / 2, holeH: DOOR_H },  // Sala Global
      ];
      wallAlongZ(-HALL_HW - WALL_T / 2, HALL_Z0, HALL_Z1, HALL_H, WALL_T, leftHoles,  hallWallMat);
      wallAlongZ( HALL_HW + WALL_T / 2, HALL_Z0, HALL_Z1, HALL_H, WALL_T, rightHoles, hallWallMat);

      // Hallway floor aisle dots
      for (let z = 2; z < HALL_Z1 - 4; z += 4) {
        [-2.8, 2.8].forEach(x => {
          const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), new THREE.MeshBasicMaterial({ color: 0x3344cc }));
          dot.rotation.x = -Math.PI / 2; dot.position.set(x, 0.02, z); scene.add(dot);
        });
      }

      // ── Genre rooms ──
      for (const room of GENRE_ROOMS) {
        const xc = roomXCtr(room), xf = roomXFar(room), xh = roomXHall(room);
        const zc = roomZCtr(room), zMin = zc - ROOM_D / 2, zMax = zc + ROOM_D / 2;
        const xfPos = room.side === 'left' ? xf - WALL_T / 2 : xf + WALL_T / 2;
        const xhPos = room.side === 'left' ? xh - WALL_T / 2 : xh + WALL_T / 2;

        const roomWallMat = new THREE.MeshLambertMaterial({ color: room.wallColor, side: THREE.DoubleSide });
        const roomCeilMat = new THREE.MeshLambertMaterial({ color: room.wallColor });
        const roomFloorMat = new THREE.MeshLambertMaterial({ map: floorTex });
        const accentMat  = new THREE.MeshLambertMaterial({ color: room.accentColor, emissive: new THREE.Color(room.accentColor), emissiveIntensity: 0.3 });

        // Floor + ceiling
        addBox(ROOM_W, 0.1, ROOM_D, xc, -0.05, zc, roomFloorMat);
        addBox(ROOM_W, 0.1, ROOM_D, xc, ROOM_H + 0.05, zc, roomCeilMat);

        // Z-direction side walls (back/front of room)
        addBox(ROOM_W + WALL_T * 2, ROOM_H, WALL_T, xc, ROOM_H / 2, zMin - WALL_T / 2, roomWallMat);
        addBox(ROOM_W + WALL_T * 2, ROOM_H, WALL_T, xc, ROOM_H / 2, zMax + WALL_T / 2, roomWallMat);

        // Hallway-side wall with door hole
        const doorHole = [{ z: zc, hw: DOOR_W / 2, holeH: DOOR_H }];
        wallAlongZ(xhPos, zMin, zMax, ROOM_H, WALL_T, doorHole, roomWallMat);

        // Far wall with screen hole (segments around screen)
        const sw2 = SCREEN_W / 2;
        // Sides of screen
        addBox(WALL_T, ROOM_H, (ROOM_D - SCREEN_W) / 2, xfPos, ROOM_H / 2, zMin + (ROOM_D - SCREEN_W) / 4, roomWallMat);
        addBox(WALL_T, ROOM_H, (ROOM_D - SCREEN_W) / 2, xfPos, ROOM_H / 2, zMax - (ROOM_D - SCREEN_W) / 4, roomWallMat);
        // Above screen
        addBox(WALL_T, ROOM_H - SCREEN_Y1, SCREEN_W, xfPos, SCREEN_Y1 + (ROOM_H - SCREEN_Y1) / 2, zc, roomWallMat);
        // Below screen
        if (SCREEN_Y0 > 0.05) addBox(WALL_T, SCREEN_Y0, SCREEN_W, xfPos, SCREEN_Y0 / 2, zc, roomWallMat);

        // Screen frame glow
        const bp = 0.1;
        const sy = SCREEN_Y0 + SCREEN_H / 2;
        const fxOff = room.side === 'left' ? 0.06 : -0.06;
        addBox(WALL_T + 0.02, bp, SCREEN_W + bp * 2, xfPos + fxOff, SCREEN_Y1 + bp / 2, zc, frameMat);
        addBox(WALL_T + 0.02, bp, SCREEN_W + bp * 2, xfPos + fxOff, SCREEN_Y0 - bp / 2, zc, frameMat);
        addBox(WALL_T + 0.02, SCREEN_H + bp * 2, bp, xfPos + fxOff, sy, zc - sw2 - bp / 2, frameMat);
        addBox(WALL_T + 0.02, SCREEN_H + bp * 2, bp, xfPos + fxOff, sy, zc + sw2 + bp / 2, frameMat);

        // Accent strip along top of hallway wall
        addBox(WALL_T + 0.02, 0.08, ROOM_D, xhPos, ROOM_H - 0.04, zc, accentMat);

        // Seats (2 rows × 5 cols)
        for (let row = 0; row < 2; row++) {
          for (let col = -2; col <= 2; col++) {
            const sx = xc + col * 1.7, sz = zc - 2.5 + row * 3.0;
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.62), seatMat);
            seat.position.set(sx, 0.42, sz); scene.add(seat);
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.08), seatBackMat);
            back.position.set(sx, 0.73, sz + 0.30); scene.add(back);
          }
        }

        // Genre label sprite above door in hallway
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 256; labelCanvas.height = 80;
        const lctx = labelCanvas.getContext('2d')!;
        lctx.fillStyle = `rgba(${(room.wallColor >> 16) & 0xff},${(room.wallColor >> 8) & 0xff},${room.wallColor & 0xff},0.9)`;
        roundRect(lctx, 4, 4, 248, 72, 10); lctx.fill();
        const hexColor = '#' + room.accentColor.toString(16).padStart(6, '0');
        lctx.strokeStyle = hexColor; lctx.lineWidth = 2.5;
        roundRect(lctx, 4, 4, 248, 72, 10); lctx.stroke();
        lctx.fillStyle = '#ffffff'; lctx.font = 'bold 15px Arial'; lctx.textAlign = 'center'; lctx.textBaseline = 'middle';
        lctx.fillText(`${room.emoji}  ${room.name}`, 128, 40);
        const labelTex = new THREE.CanvasTexture(labelCanvas);
        const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false }));
        labelSprite.scale.set(2.6, 0.85, 1);
        labelSprite.position.set(xhPos + (room.side === 'left' ? 0.3 : -0.3), DOOR_H + 0.55, zc);
        scene.add(labelSprite);
      }

      // ── Sala Global room ──
      {
        const gZC = GLOBAL_ROOM_Z;
        const xc = RIGHT_X_CTR, xf = RIGHT_X_FAR;
        const xfPos = xf + WALL_T / 2, xhPos = HALL_HW + WALL_T / 2;
        const zMin = gZC - ROOM_D / 2, zMax = gZC + ROOM_D / 2;

        const gWallMat = new THREE.MeshLambertMaterial({ color: 0x080818, side: THREE.DoubleSide });
        const gCeilMat = new THREE.MeshLambertMaterial({ color: 0x060616 });
        const gAccMat  = new THREE.MeshLambertMaterial({ color: 0x6366f1, emissive: new THREE.Color(0x6366f1), emissiveIntensity: 0.4 });

        addBox(ROOM_W, 0.1, ROOM_D, xc, -0.05, gZC, hallFloorMat);
        addBox(ROOM_W, 0.1, ROOM_D, xc, ROOM_H + 0.05, gZC, gCeilMat);
        addBox(ROOM_W + WALL_T * 2, ROOM_H, WALL_T, xc, ROOM_H / 2, zMin - WALL_T / 2, gWallMat);
        addBox(ROOM_W + WALL_T * 2, ROOM_H, WALL_T, xc, ROOM_H / 2, zMax + WALL_T / 2, gWallMat);
        wallAlongZ(xhPos, zMin, zMax, ROOM_H, WALL_T, [{ z: gZC, hw: DOOR_W / 2, holeH: DOOR_H }], gWallMat);

        const sw2 = SCREEN_W / 2;
        addBox(WALL_T, ROOM_H, (ROOM_D - SCREEN_W) / 2, xfPos, ROOM_H / 2, zMin + (ROOM_D - SCREEN_W) / 4, gWallMat);
        addBox(WALL_T, ROOM_H, (ROOM_D - SCREEN_W) / 2, xfPos, ROOM_H / 2, zMax - (ROOM_D - SCREEN_W) / 4, gWallMat);
        addBox(WALL_T, ROOM_H - SCREEN_Y1, SCREEN_W, xfPos, SCREEN_Y1 + (ROOM_H - SCREEN_Y1) / 2, gZC, gWallMat);
        if (SCREEN_Y0 > 0.05) addBox(WALL_T, SCREEN_Y0, SCREEN_W, xfPos, SCREEN_Y0 / 2, gZC, gWallMat);

        const bp = 0.1, sy = SCREEN_Y0 + SCREEN_H / 2;
        addBox(WALL_T + 0.02, bp, SCREEN_W + bp * 2, xfPos + 0.06, SCREEN_Y1 + bp / 2, gZC, frameMat);
        addBox(WALL_T + 0.02, bp, SCREEN_W + bp * 2, xfPos + 0.06, SCREEN_Y0 - bp / 2, gZC, frameMat);
        addBox(WALL_T + 0.02, SCREEN_H + bp * 2, bp, xfPos + 0.06, sy, gZC - sw2 - bp / 2, frameMat);
        addBox(WALL_T + 0.02, SCREEN_H + bp * 2, bp, xfPos + 0.06, sy, gZC + sw2 + bp / 2, frameMat);
        addBox(WALL_T + 0.02, 0.08, ROOM_D, xhPos + 0.02, ROOM_H - 0.04, gZC, gAccMat);

        // Seats
        for (let row = 0; row < 2; row++) for (let col = -2; col <= 2; col++) {
          const sx = xc + col * 1.7, sz = gZC - 2.5 + row * 3.0;
          const s = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.62), seatMat); s.position.set(sx, 0.42, sz); scene.add(s);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.62, 0.08), seatBackMat); b.position.set(sx, 0.73, sz + 0.30); scene.add(b);
        }

        // Door label + search hint billboard
        const mkLabel = (text: string, bg: string, border: string, w: number, h: number) => {
          const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d')!;
          ctx.fillStyle = bg; roundRect(ctx, 3, 3, w - 6, h - 6, 10); ctx.fill();
          ctx.strokeStyle = border; ctx.lineWidth = 2.5; roundRect(ctx, 3, 3, w - 6, h - 6, 10); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(text, w / 2, h / 2);
          return new THREE.CanvasTexture(cv);
        };
        const doorLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkLabel('🌍  Sala Global', 'rgba(8,8,24,0.9)', '#6366f1', 256, 80), transparent: true, depthTest: false }));
        doorLabel.scale.set(2.6, 0.85, 1); doorLabel.position.set(xhPos + 0.3, DOOR_H + 0.55, gZC); scene.add(doorLabel);
        const hintLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: mkLabel('🔍 ESC → Buscar canción para todos', 'rgba(99,102,241,0.8)', '#818cf8', 380, 64), transparent: true, depthTest: false }));
        hintLabel.scale.set(3.5, 0.65, 1); hintLabel.position.set(xc, 3.6, gZC); scene.add(hintLabel);

        // Point light
        const gl = new THREE.PointLight(0x6366f1, 3, 22); gl.position.set(xc, ROOM_H - 0.4, gZC); scene.add(gl);
      }

      // ── CSS3D iframe (single, teleports to active room screen) ──
      const iframe = document.createElement('iframe');
      iframeRef.current = iframe;
      iframe.src = 'about:blank';
      iframe.style.width  = `${IFRAME_PX}px`;
      iframe.style.height = `${Math.round(IFRAME_PX * 9 / 16)}px`;
      iframe.style.border = 'none';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      (iframe as any).allowFullscreen = true;

      const css3d = new CSS3DObject(iframe);
      css3d.scale.setScalar(IFRAME_SCALE);
      css3d.position.set(-999, -999, -999);
      cssScene.add(css3d);

      // Video cache per room
      const roomVideoCache = new Map<string, string>();

      async function activateGenreRoom(room: GenreRoom) {
        const xf = roomXFar(room);
        const screenX = room.side === 'left' ? xf + WALL_T + 0.08 : xf - WALL_T - 0.08;
        css3d.position.set(screenX, SCREEN_Y0 + SCREEN_H / 2, roomZCtr(room));
        css3d.rotation.y = room.side === 'left' ? -Math.PI / 2 : Math.PI / 2;

        const cached = roomVideoCache.get(room.id);
        if (cached) {
          iframe.src = `https://www.youtube.com/embed/${cached}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1`;
          return;
        }
        try {
          const res  = await fetch(`/api/search/youtube?q=${encodeURIComponent(room.query)}`);
          const data = await res.json();
          const results: any[] = data.results || [];
          if (results.length > 0) {
            const pick = results[Math.floor(Math.random() * Math.min(5, results.length))];
            roomVideoCache.set(room.id, pick.id);
            iframe.src = `https://www.youtube.com/embed/${pick.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1`;
          }
        } catch {}
      }

      function deactivateRoom() {
        iframe.src = 'about:blank';
        css3d.position.set(-999, -999, -999);
      }

      function activateGlobalRoom() {
        const screenX = RIGHT_X_FAR + WALL_T + 0.08;
        css3d.position.set(screenX, SCREEN_Y0 + SCREEN_H / 2, GLOBAL_ROOM_Z);
        css3d.rotation.y = Math.PI / 2;
        css3d.scale.setScalar(IFRAME_SCALE);
        const cached = roomVideoCache.get('global');
        if (cached) iframe.src = `https://www.youtube.com/embed/${cached}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1`;
      }

      // Bridge: called from socket handler when another user changes Sala Global video
      setGlobalVideoRef.current = (videoId: string) => {
        roomVideoCache.set('global', videoId);
        if (inGlobalRoomRef.current) {
          const screenX = RIGHT_X_FAR + WALL_T + 0.08;
          css3d.position.set(screenX, SCREEN_Y0 + SCREEN_H / 2, GLOBAL_ROOM_Z);
          css3d.rotation.y = Math.PI / 2;
          css3d.scale.setScalar(IFRAME_SCALE);
          iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1`;
        }
      };

      // ── Avatar helpers ──
      function makeNameCanvas(username: string, color: string) {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 52;
        const ctx = cv.getContext('2d')!;
        ctx.fillStyle = 'rgba(0,0,0,0.78)'; roundRect(ctx, 3, 3, 250, 46, 7); ctx.fill();
        ctx.fillStyle = color; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(username.slice(0, 15), 128, 26);
        return new THREE.CanvasTexture(cv);
      }

      function createAvatar(username: string, color: string) {
        const group = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.25 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 1.0, 12), mat); body.position.y = 0.78; group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), mat); head.position.y = 1.52; group.add(head);
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
        if (entry) { entry.bubbles.forEach(b => { clearTimeout(b.timer); scene.remove(b.sprite); }); scene.remove(entry.mesh); otherUsersRef.current.delete(sid); }
      };

      function spawnBubble(message: string, color: string, x: number, y: number, z: number) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(makeBubbleCanvas(message, color)), transparent: true, depthTest: false }));
        sprite.scale.set(2.2, BUBBLE_H, 1); sprite.position.set(x, y, z); scene.add(sprite); return sprite;
      }

      addBubbleRef.current = (sid: string, msg: string, color: string) => {
        const entry = otherUsersRef.current.get(sid); if (!entry) return;
        entry.bubbles.forEach(b => { b.sprite.position.y += BUBBLE_H + 0.08; });
        const sprite = spawnBubble(msg, color, entry.mesh.position.x, 2.4, entry.mesh.position.z);
        const timer = setTimeout(() => { scene.remove(sprite); const idx = entry.bubbles.findIndex(b => b.sprite === sprite); if (idx !== -1) entry.bubbles.splice(idx, 1); }, BUBBLE_LIFETIME);
        entry.bubbles.push({ sprite, timer });
      };

      addLocalBubbleRef.current = (msg: string, color: string) => {
        const p = playerRef.current;
        localBubblesRef.current.forEach(b => { b.sprite.position.y += BUBBLE_H + 0.08; });
        const sprite = spawnBubble(msg, color, p.x, EYE_H + 0.85, p.z);
        const timer = setTimeout(() => { scene.remove(sprite); const idx = localBubblesRef.current.findIndex(b => b.sprite === sprite); if (idx !== -1) localBubblesRef.current.splice(idx, 1); }, BUBBLE_LIFETIME);
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
        playerRef.current.yaw   -= e.movementX * 0.002;
        playerRef.current.pitch -= e.movementY * 0.002;
        playerRef.current.pitch  = Math.max(-1.1, Math.min(1.1, playerRef.current.pitch));
      });

      // ── Keyboard ──
      const keys: Record<string, boolean> = {};
      const onDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.code === 'KeyT' && document.pointerLockElement === renderer.domElement) { chatModeRef.current = true; document.exitPointerLock(); return; }
        if (e.code === 'KeyE' && document.pointerLockElement === renderer.domElement) {
          if (seatedRef.current) { seatedRef.current = false; setSeated(false); }
          else if (nearSeatRef.current) {
            const seat = nearSeatRef.current;
            playerRef.current.x = seat.x; playerRef.current.z = seat.z;
            playerRef.current.yaw = 0; playerRef.current.pitch = 0;
            seatedRef.current = true; seatElevRef.current = 0;
            airYRef.current = 0; jumpVelRef.current = 0;
            setSeated(true); setNearSeatPrompt(false);
          }
          return;
        }
        if (e.code === 'Space' && document.pointerLockElement === renderer.domElement) {
          if (!seatedRef.current && airYRef.current === 0) jumpVelRef.current = 5.2;
          e.preventDefault(); return;
        }
        keys[e.code] = true;
      };
      const onUp = (e: KeyboardEvent) => { keys[e.code] = false; };
      window.addEventListener('keydown', onDown);
      window.addEventListener('keyup', onUp);

      const onResize = () => {
        if (!containerRef.current) return;
        const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
        camera.aspect = w / h; camera.updateProjectionMatrix();
        renderer.setSize(w, h); cssRenderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      // ── Animation loop ──
      const clock = new THREE.Clock();
      let lastEmit = 0, frame = 0, prevNearPrompt = false;
      let activeRoomId: string | null = null;

      function animate() {
        if (destroyed) return;
        frame = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const p  = playerRef.current;

        if (document.pointerLockElement === renderer.domElement) {
          const fwd   = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
          const right = new THREE.Vector3( Math.cos(p.yaw), 0, -Math.sin(p.yaw));
          const move  = new THREE.Vector3();

          if (!seatedRef.current) {
            if (keys['KeyW'] || keys['ArrowUp'])    move.add(fwd);
            if (keys['KeyS'] || keys['ArrowDown'])  move.sub(fwd);
            if (keys['KeyA'] || keys['ArrowLeft'])  move.sub(right);
            if (keys['KeyD'] || keys['ArrowRight']) move.add(right);
            if (move.length() > 0) {
              move.normalize().multiplyScalar(MOVE_SPEED * dt);
              p.x = Math.max(-19.4, Math.min(19.4, p.x + move.x));
              p.z = Math.max(HALL_Z0 + 0.6, Math.min(HALL_Z1 - 0.6, p.z + move.z));
            }
          } else {
            const moving = keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] ||
                           keys['ArrowUp'] || keys['ArrowDown'] || keys['ArrowLeft'] || keys['ArrowRight'];
            if (moving) { seatedRef.current = false; setSeated(false); }
          }
        }

        // Jump physics
        if (!seatedRef.current) {
          jumpVelRef.current -= 20 * dt;
          airYRef.current = Math.max(0, airYRef.current + jumpVelRef.current * dt);
          if (airYRef.current === 0) jumpVelRef.current = 0;
        }

        // Zone detection → switch video
        const nowInGlobal = p.x > HALL_HW + 0.2 && p.x < RIGHT_X_FAR - WALL_T
          && Math.abs(p.z - GLOBAL_ROOM_Z) < ROOM_D / 2 - 0.2;
        const nowRoom   = nowInGlobal ? null : detectGenreRoom(p.x, p.z);
        const nowRoomId = nowInGlobal ? 'global' : (nowRoom?.id ?? null);

        if (nowRoomId !== activeRoomId) {
          activeRoomId = nowRoomId;
          if (nowInGlobal) {
            inGlobalRoomRef.current = true;
            setInGlobalRoom(true);
            setActiveRoom(null);
            activateGlobalRoom();
          } else {
            inGlobalRoomRef.current = false;
            setInGlobalRoom(false);
            setActiveRoom(nowRoom);
            if (nowRoom) activateGenreRoom(nowRoom);
            else deactivateRoom();
          }
        }

        // Seat proximity
        if (!seatedRef.current) {
          let nearest: { x: number; z: number; elevation: number } | null = null, nearestDist = SEAT_RADIUS;
          for (const seat of SEATS) {
            const dx = p.x - seat.x, dz = p.z - seat.z, dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < nearestDist) { nearestDist = dist; nearest = seat; }
          }
          nearSeatRef.current = nearest;
          const show = nearest !== null;
          if (show !== prevNearPrompt) { prevNearPrompt = show; setNearSeatPrompt(show); }
        } else {
          nearSeatRef.current = null;
          if (prevNearPrompt) { prevNearPrompt = false; setNearSeatPrompt(false); }
        }

        const eyeY = seatedRef.current ? EYE_H_SEATED : EYE_H + airYRef.current;
        camera.position.set(p.x, eyeY, p.z);
        camera.quaternion.setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));

        const now = Date.now();
        if (now - lastEmit > 80 && socketRef.current) { socketRef.current.emit('move', { x: p.x, z: p.z }); lastEmit = now; }

        otherUsersRef.current.forEach(({ mesh, data, bubbles }) => {
          mesh.position.x += (data.x - mesh.position.x) * 0.15;
          mesh.position.z += (data.z - mesh.position.z) * 0.15;
          bubbles.forEach(b => { b.sprite.position.x += (mesh.position.x - b.sprite.position.x) * 0.15; b.sprite.position.z += (mesh.position.z - b.sprite.position.z) * 0.15; });
        });
        localBubblesRef.current.forEach(b => { b.sprite.position.x += (p.x - b.sprite.position.x) * 0.15; b.sprite.position.z += (p.z - b.sprite.position.z) * 0.15; });

        renderer.render(scene, camera);
        cssRenderer.render(cssScene, camera);
      }
      animate();

      return () => {
        destroyed = true; cancelAnimationFrame(frame); document.exitPointerLock();
        window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('resize', onResize);
        renderer.dispose(); localBubblesRef.current.forEach(b => clearTimeout(b.timer));
        if (container.contains(renderer.domElement))    container.removeChild(renderer.domElement);
        if (container.contains(cssRenderer.domElement)) container.removeChild(cssRenderer.domElement);
        addAvatarRef.current = addBubbleRef.current = addLocalBubbleRef.current = removeAvatarRef.current = null;
      };
    })();

    return () => { destroyed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket.io ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('register-user', { userId: myUserId });
    socket.emit('join-room', { roomId, userId: myUserId, username: myUsername, color: myColor });

    socket.on('room-users', (users: RoomUser[]) => {
      setOnline(users.length + 1);
      users.forEach(u => { if (addAvatarRef.current) addAvatarRef.current(u); else pendingUsersRef.current.push(u); });
    });
    socket.on('user-joined', (u: RoomUser) => {
      setOnline(n => n + 1);
      addAvatarRef.current?.(u);
      setMessages(m => [...m, { userId: 'system', username: 'Sistema', color: '#64748b', message: `${u.username} entró al mundo`, timestamp: Date.now() }]);
    });
    socket.on('user-moved', ({ socketId, x, z }: { socketId: string; x: number; z: number }) => {
      const e = otherUsersRef.current.get(socketId); if (e) e.data = { ...e.data, x, z };
    });
    socket.on('user-left', (sid: string) => {
      const e = otherUsersRef.current.get(sid);
      if (e) setMessages(m => [...m, { userId: 'system', username: 'Sistema', color: '#64748b', message: `${e.data.username} salió`, timestamp: Date.now() }]);
      removeAvatarRef.current?.(sid);
      setOnline(n => Math.max(1, n - 1));
    });
    socket.on('new-message', (msg: ChatMsg) => {
      setMessages(m => [...m.slice(-99), msg]);
      const sender = Array.from(otherUsersRef.current.entries()).find(([, e]) => e.data.userId === msg.userId);
      if (sender) addBubbleRef.current?.(sender[0], msg.message, msg.color);
    });
    socket.on('room-invite', ({ from, roomUrl }: { from: string; roomUrl: string }) => { setInvite({ from, roomUrl }); });
    socket.on('video-changed', ({ platform: p, contentId: c }: { platform: string; contentId: string }) => { router.push(`/room/${p}/${c}`); });
    socket.on('global-video-changed', ({ videoId }: { videoId: string }) => {
      setGlobalVideoRef.current?.(videoId);
    });

    return () => { socket.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUserId, myUsername, myColor]);

  const sendMessage = useCallback(() => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { message: chatInput.trim() });
    addLocalBubbleRef.current?.(chatInput.trim(), myColor);
    setChatInput('');
  }, [chatInput, myColor]);

  const doSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try { const r = await fetch(`/api/search/${platform}?q=${encodeURIComponent(searchQuery)}`); const d = await r.json(); setSearchResults(d.results || []); }
    catch { setSearchResults([]); } finally { setSearching(false); }
  }, [searchQuery, platform]);

  const changeVideo = useCallback((newId: string, newPlatform = platform) => {
    socketRef.current?.emit('change-video', { platform: newPlatform, contentId: newId });
    router.push(`/room/${newPlatform}/${newId}`);
  }, [platform, router]);

  const doGlobalSearch = useCallback(async () => {
    if (!globalSearchQ.trim()) return;
    setGlobalSearching(true);
    try { const r = await fetch(`/api/search/youtube?q=${encodeURIComponent(globalSearchQ)}`); const d = await r.json(); setGlobalResults(d.results || []); }
    catch { setGlobalResults([]); } finally { setGlobalSearching(false); }
  }, [globalSearchQ]);

  const changeGlobalVideo = useCallback((videoId: string) => {
    socketRef.current?.emit('change-global-video', { videoId });
    setGlobalVideoRef.current?.(videoId);
    setShowGlobalSearch(false);
    setGlobalResults([]);
    setGlobalSearchQ('');
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#03030a', overflow: 'hidden' }}>
      {invite && (
        <div className="absolute top-4 right-4 z-30 glass rounded-xl p-4 shadow-2xl border border-indigo-500/30 max-w-xs">
          <p className="text-sm font-semibold text-white mb-1">🎉 Invitación de sala</p>
          <p className="text-slate-400 text-xs mb-3"><span style={{ color: '#a5b4fc' }}>{invite.from}</span> te invita a ver juntos</p>
          <div className="flex gap-2">
            <a href={invite.roomUrl} className="btn-primary text-xs py-1.5 px-3">Unirse</a>
            <button onClick={() => setInvite(null)} className="btn-ghost text-xs py-1.5 px-3">Ignorar</button>
          </div>
        </div>
      )}

      <div ref={containerRef} className="absolute inset-0" />

      {/* Click-to-enter overlay */}
      {!locked && !chatting && !showSearch && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.5)', paddingBottom: '80px' }}
          onClick={() => containerRef.current?.querySelector('canvas')?.requestPointerLock()}>
          <div className="glass rounded-2xl px-8 py-6 text-center border border-indigo-500/30 shadow-2xl">
            <div className="text-5xl mb-3">🏙️</div>
            <p className="text-white font-bold text-lg mb-1">Mundo Musical</p>
            <p className="text-slate-400 text-sm mb-4">Explora salas por género · Entra y escucha</p>
            <div className="text-xs text-slate-500 space-y-1">
              <p>🖱 Ratón — mirar &nbsp;|&nbsp; WASD — caminar &nbsp;|&nbsp; Espacio — saltar</p>
              <p>T — chat &nbsp;|&nbsp; E — sentarse &nbsp;|&nbsp; ESC — salir del modo inmersivo</p>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {GENRE_ROOMS.map(r => (
                <div key={r.id} className="text-center px-1 py-1 rounded-lg text-xs" style={{ background: `rgba(${(r.wallColor >> 16) & 0xff},${(r.wallColor >> 8) & 0xff},${r.wallColor & 0xff},0.6)`, border: `1px solid #${ r.accentColor.toString(16).padStart(6,'0')}44`, color: '#' + r.accentColor.toString(16).padStart(6,'0') }}>
                  {r.emoji} {r.name.split('/')[0].trim()}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active room HUD */}
      {locked && activeRoom && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold"
          style={{ background: `rgba(${(activeRoom.wallColor >> 16) & 0xff},${(activeRoom.wallColor >> 8) & 0xff},${activeRoom.wallColor & 0xff},0.85)`, border: `1px solid #${activeRoom.accentColor.toString(16).padStart(6,'0')}88`, color: '#' + activeRoom.accentColor.toString(16).padStart(6,'0'), backdropFilter: 'blur(8px)' }}>
          {activeRoom.emoji} {activeRoom.name}
        </div>
      )}
      {locked && inGlobalRoom && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold"
          style={{ background: 'rgba(8,8,24,0.85)', border: '1px solid #6366f188', color: '#818cf8', backdropFilter: 'blur(8px)' }}>
          🌍 Sala Global · ESC para buscar
        </div>
      )}

      {locked && (
        <>
          <div className="absolute top-3 left-3 z-20 glass rounded-lg px-3 py-1.5 text-xs flex items-center gap-2 pointer-events-none">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {online} en el mundo
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">ESC · T · E</span>
          </div>

          {(nearSeatPrompt || seated) && (
            <div className="absolute bottom-24 left-1/2 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', color: '#e2e8f0' }}>
              <span className="inline-flex items-center justify-center rounded-md text-xs font-bold px-1.5 py-0.5" style={{ background: 'rgba(255,255,255,0.15)', color: '#fbbf24', minWidth: '1.4rem' }}>E</span>
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

      {/* Control panel */}
      {!locked && !chatting && !showSearch && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/10"
          style={{ bottom: '72px', background: 'rgba(8,8,28,0.88)', backdropFilter: 'blur(14px)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { isPaused ? sendYTCmd('playVideo') : sendYTCmd('pauseVideo'); setIsPaused(v => !v); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white text-base transition-colors">
            {isPaused ? '▶' : '⏸'}
          </button>
          <button onClick={() => { isMuted ? sendYTCmd('unMute') : sendYTCmd('mute'); setIsMuted(v => !v); }}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-lg transition-colors">
            {isMuted ? '🔇' : '🔊'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 select-none">Vol</span>
            <input type="range" min="0" max="100" value={volume}
              onChange={e => { const v = Number(e.target.value); setVolume(v); sendYTCmd('setVolume', [v]); if (v > 0 && isMuted) { sendYTCmd('unMute'); setIsMuted(false); } }}
              className="w-24 accent-indigo-500 cursor-pointer" />
            <span className="text-xs text-slate-500 w-6 text-right select-none">{volume}</span>
          </div>
          <div className="w-px h-6 bg-white/10 mx-1" />
          {inGlobalRoom ? (
            <button onClick={() => setShowGlobalSearch(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/50 hover:bg-indigo-600/70 text-white text-xs font-bold transition-colors border border-indigo-500/40">
              🌍 Buscar para Sala Global
            </button>
          ) : (
            <button onClick={() => setShowSearch(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-medium transition-colors">
              🔍 Buscar video
            </button>
          )}
        </div>
      )}

      {/* Chat bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20"
        style={{ background: 'rgba(4,4,18,0.82)', borderTop: '1px solid rgba(255,255,255,0.06)' }}
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
          <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: myColor }}>{myUsername[0].toUpperCase()}</div>
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

      {/* ── Sala Global search panel ── */}
      {showGlobalSearch && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'rgba(4,4,20,0.97)', paddingBottom: '68px' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-indigo-500/20 shrink-0">
            <span className="text-2xl">🌍</span>
            <div>
              <h2 className="text-white font-bold">Sala Global</h2>
              <p className="text-slate-400 text-xs">El video que elijas se reproducirá para todos en esta sala</p>
            </div>
            <div className="flex-1" />
            <button onClick={() => { setShowGlobalSearch(false); setGlobalResults([]); setGlobalSearchQ(''); }}
              className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">✕</button>
          </div>

          <div className="flex gap-2 px-5 py-3 shrink-0">
            <input autoFocus
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
              placeholder="Buscar canción, artista o álbum..."
              value={globalSearchQ}
              onChange={e => setGlobalSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doGlobalSearch()} />
            <button onClick={doGlobalSearch} disabled={globalSearching || !globalSearchQ.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
              {globalSearching ? '…' : 'Buscar'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
            {globalResults.map(result => (
              <button key={result.id}
                onClick={() => changeGlobalVideo(result.id)}
                className="flex flex-col rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/60 bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left group">
                {result.thumbnail
                  ? <div className="relative w-full" style={{ paddingBottom: '56.25%' }}><img src={result.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /></div>
                  : <div className="w-full bg-white/5 relative" style={{ paddingBottom: '56.25%' }}><span className="absolute inset-0 flex items-center justify-center text-2xl">▶</span></div>
                }
                <div className="p-2.5">
                  <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{result.title}</p>
                  {result.channel && <p className="text-slate-500 text-[11px] mt-1 truncate">{result.channel}</p>}
                </div>
              </button>
            ))}
            {!globalSearching && globalSearchQ && globalResults.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-600">No se encontraron resultados</div>
            )}
          </div>
        </div>
      )}

      {/* Search panel */}
      {showSearch && (
        <div className="absolute inset-0 z-30 flex flex-col" style={{ background: 'rgba(4,4,20,0.97)', paddingBottom: '68px' }}>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5 shrink-0">
            <span className="text-xl">🔍</span>
            <div><h2 className="text-white font-bold">Buscar video</h2><p className="text-slate-500 text-xs">Cambia el video en la sala actual</p></div>
            <div className="flex-1" />
            <button onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }} className="text-slate-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5">✕</button>
          </div>
          <div className="flex gap-2 px-5 py-3 shrink-0">
            <input autoFocus className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
              placeholder="Buscar en YouTube..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} />
            <button onClick={doSearch} disabled={searching || !searchQuery.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors">
              {searching ? '…' : 'Buscar'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
            {searchResults.map(result => (
              <button key={result.id}
                onClick={() => { setShowSearch(false); setSearchResults([]); changeVideo(result.id, result.platform); }}
                className="flex flex-col rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/60 bg-white/[0.03] hover:bg-white/[0.06] transition-all text-left group">
                {result.thumbnail
                  ? <div className="relative w-full" style={{ paddingBottom: '56.25%' }}><img src={result.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" /></div>
                  : <div className="w-full bg-white/5 flex items-center justify-center text-2xl relative" style={{ paddingBottom: '56.25%' }}><span className="absolute inset-0 flex items-center justify-center">▶</span></div>
                }
                <div className="p-2.5"><p className="text-white text-xs font-medium line-clamp-2 leading-snug">{result.title}</p>{result.channel && <p className="text-slate-500 text-[11px] mt-1 truncate">{result.channel}</p>}</div>
              </button>
            ))}
            {!searching && searchQuery && searchResults.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-600">No se encontraron resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
