'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/contexts/AuthContext';

interface RoomUser {
  socketId: string;
  userId: string;
  username: string;
  color: string;
  x: number;
  y: number;
}

interface ChatMsg {
  userId: string;
  username: string;
  color: string;
  message: string;
  timestamp: number;
}

interface ImmersiveRoomProps {
  platform: string;
  contentId: string;
  roomId: string;
}

// Room dimensions (logical)
const ROOM_W = 800;
const ROOM_H = 560;
const PLAYER_R = 16;
const SPEED = 3;
// Screen area at top
const SCREEN_X = 160;
const SCREEN_Y = 40;
const SCREEN_W = 480;
const SCREEN_H = 200;

function getGuestName() {
  const names = ['Invitado', 'Espectador', 'Visitante'];
  return names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 9000 + 1000);
}

function drawRoom(ctx: CanvasRenderingContext2D, cw: number, ch: number, scale: number) {
  const sx = (cw - ROOM_W * scale) / 2;
  const sy = (ch - ROOM_H * scale) / 2;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scale, scale);

  // Floor
  ctx.fillStyle = '#12122a';
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);

  // Floor tiles
  ctx.strokeStyle = '#1a1a3a';
  ctx.lineWidth = 1;
  for (let x = 0; x <= ROOM_W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, SCREEN_Y + SCREEN_H + 10); ctx.lineTo(x, ROOM_H); ctx.stroke();
  }
  for (let y = SCREEN_Y + SCREEN_H + 10; y <= ROOM_H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ROOM_W, y); ctx.stroke();
  }

  // Walls
  ctx.strokeStyle = '#2d2d5a';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ROOM_W - 4, ROOM_H - 4);

  // Screen glow
  const grad = ctx.createRadialGradient(
    SCREEN_X + SCREEN_W / 2, SCREEN_Y + SCREEN_H / 2, 10,
    SCREEN_X + SCREEN_W / 2, SCREEN_Y + SCREEN_H / 2, SCREEN_W * 0.8
  );
  grad.addColorStop(0, 'rgba(99,102,241,0.15)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ROOM_W, SCREEN_Y + SCREEN_H + 80);

  // Screen frame
  ctx.fillStyle = '#1a1a3a';
  ctx.beginPath();
  ctx.roundRect(SCREEN_X - 12, SCREEN_Y - 12, SCREEN_W + 24, SCREEN_H + 24, 8);
  ctx.fill();

  // Screen body (placeholder — real video shown in iframe overlay)
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath();
  ctx.roundRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, 4);
  ctx.fill();

  // Screen glow border
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#6366f1';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, 4);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // "PANTALLA" label
  ctx.fillStyle = '#6366f1';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▶ PANTALLA PRINCIPAL', SCREEN_X + SCREEN_W / 2, SCREEN_Y + SCREEN_H / 2 + 5);

  // Seats / dots decoration
  ctx.fillStyle = '#1e1e3a';
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 8; col++) {
      const sx2 = 60 + col * 96;
      const sy2 = SCREEN_Y + SCREEN_H + 50 + row * 55;
      ctx.beginPath();
      ctx.arc(sx2, sy2, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  return { sx, sy, scale };
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  user: { x: number; y: number; username: string; color: string },
  sx: number,
  sy: number,
  scale: number,
  isMe: boolean
) {
  const rx = sx + user.x * scale;
  const ry = sy + user.y * scale;
  const r = PLAYER_R * scale;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(rx, ry + r * 0.9, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body circle
  ctx.fillStyle = user.color;
  ctx.beginPath();
  ctx.arc(rx, ry, r, 0, Math.PI * 2);
  ctx.fill();

  // Glow for self
  if (isMe) {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * scale;
    ctx.shadowColor = user.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Initial letter
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(r * 0.9)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(user.username[0].toUpperCase(), rx, ry);

  // Name tag
  const tag = isMe ? `${user.username} (tú)` : user.username;
  const fontSize = Math.max(10, 11 * scale);
  ctx.font = `${fontSize}px sans-serif`;
  const tw = ctx.measureText(tag).width + 10;
  const th = fontSize + 6;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.beginPath();
  ctx.roundRect(rx - tw / 2, ry - r - th - 4, tw, th, 4);
  ctx.fill();
  ctx.fillStyle = isMe ? '#a5b4fc' : '#e2e8f0';
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tag, rx, ry - r - th / 2 - 4);
  ctx.textBaseline = 'alphabetic';
}

export default function ImmersiveRoom({ platform, contentId, roomId }: ImmersiveRoomProps) {
  const { user } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const meRef = useRef({ x: ROOM_W / 2, y: ROOM_H * 0.72 });
  const otherUsersRef = useRef<Map<string, RoomUser>>(new Map());
  const animFrameRef = useRef<number>(0);
  const lastEmitRef = useRef(0);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const [onlineCount, setOnlineCount] = useState(1);
  const [invite, setInvite] = useState<{ from: string; roomUrl: string } | null>(null);

  const myUsername = user?.username || getGuestName();
  const myColor = user?.avatarColor || '#6366f1';
  const myUserId = user?.id || 'guest-' + Math.random().toString(36).slice(2);

  // Set up canvas and game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function resize() {
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    function getScale() {
      const cw = canvas!.width;
      const ch = canvas!.height;
      return Math.min(cw / ROOM_W, ch / ROOM_H) * 0.95;
    }

    function loop() {
      // Movement
      const speed = SPEED;
      let { x, y } = meRef.current;
      if (keysRef.current['ArrowUp'] || keysRef.current['w'] || keysRef.current['W']) y -= speed;
      if (keysRef.current['ArrowDown'] || keysRef.current['s'] || keysRef.current['S']) y += speed;
      if (keysRef.current['ArrowLeft'] || keysRef.current['a'] || keysRef.current['A']) x -= speed;
      if (keysRef.current['ArrowRight'] || keysRef.current['d'] || keysRef.current['D']) x += speed;

      x = Math.max(PLAYER_R + 4, Math.min(ROOM_W - PLAYER_R - 4, x));
      y = Math.max(SCREEN_Y + SCREEN_H + PLAYER_R + 20, Math.min(ROOM_H - PLAYER_R - 4, y));

      meRef.current = { x, y };

      // Emit position
      const now = Date.now();
      if (now - lastEmitRef.current > 80 && socketRef.current) {
        socketRef.current.emit('move', { x, y });
        lastEmitRef.current = now;
      }

      // Draw
      const ctx = canvas!.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(loop); return; }

      const cw = canvas!.width;
      const ch = canvas!.height;
      const scale = getScale();

      ctx.clearRect(0, 0, cw, ch);
      ctx.fillStyle = '#07070f';
      ctx.fillRect(0, 0, cw, ch);

      const { sx, sy } = drawRoom(ctx, cw, ch, scale);

      // Draw other users
      otherUsersRef.current.forEach((u) => {
        drawAvatar(ctx, u, sx, sy, scale, false);
      });

      // Draw self
      drawAvatar(ctx, { x: meRef.current.x, y: meRef.current.y, username: myUsername, color: myColor }, sx, sy, scale, true);

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
    };
  }, [myUsername, myColor]);

  // Keyboard
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      keysRef.current[e.key] = true;
    }
    function up(e: KeyboardEvent) { keysRef.current[e.key] = false; }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Socket.io
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.emit('join-room', { roomId, userId: myUserId, username: myUsername, color: myColor });

    socket.on('room-users', (users: RoomUser[]) => {
      users.forEach((u) => otherUsersRef.current.set(u.socketId, u));
      setOnlineCount(users.length + 1);
    });

    socket.on('user-joined', (u: RoomUser) => {
      otherUsersRef.current.set(u.socketId, u);
      setOnlineCount((n) => n + 1);
      setMessages((m) => [
        ...m,
        { userId: 'system', username: 'Sistema', color: '#64748b', message: `${u.username} entró a la sala`, timestamp: Date.now() },
      ]);
    });

    socket.on('user-moved', ({ socketId, x, y }: { socketId: string; x: number; y: number }) => {
      const u = otherUsersRef.current.get(socketId);
      if (u) otherUsersRef.current.set(socketId, { ...u, x, y });
    });

    socket.on('user-left', (socketId: string) => {
      const u = otherUsersRef.current.get(socketId);
      if (u) {
        setMessages((m) => [
          ...m,
          { userId: 'system', username: 'Sistema', color: '#64748b', message: `${u.username} salió de la sala`, timestamp: Date.now() },
        ]);
      }
      otherUsersRef.current.delete(socketId);
      setOnlineCount((n) => Math.max(1, n - 1));
    });

    socket.on('new-message', (msg: ChatMsg) => {
      setMessages((m) => [...m.slice(-99), msg]);
    });

    socket.on('room-invite', ({ from, roomUrl }: { from: string; roomUrl: string }) => {
      setInvite({ from, roomUrl });
    });

    return () => { socket.disconnect(); };
  }, [roomId, myUserId, myUsername, myColor]);

  const sendMessage = useCallback(() => {
    if (!chatInput.trim() || !socketRef.current) return;
    socketRef.current.emit('chat-message', { message: chatInput.trim() });
    setChatInput('');
  }, [chatInput]);

  // Mobile touch movement
  const touchRef = useRef<{ id: number; sx: number; sy: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchRef.current = { id: t.identifier, sx: t.clientX, sy: t.clientY };
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return;
    const t = Array.from(e.touches).find((x) => x.identifier === touchRef.current!.id);
    if (!t) return;
    const dx = t.clientX - touchRef.current.sx;
    const dy = t.clientY - touchRef.current.sy;
    touchRef.current.sx = t.clientX;
    touchRef.current.sy = t.clientY;
    meRef.current = {
      x: Math.max(PLAYER_R + 4, Math.min(ROOM_W - PLAYER_R - 4, meRef.current.x + dx * 2)),
      y: Math.max(SCREEN_Y + SCREEN_H + PLAYER_R + 20, Math.min(ROOM_H - PLAYER_R - 4, meRef.current.y + dy * 2)),
    };
  }
  function handleTouchEnd() { touchRef.current = null; }

  return (
    <div className="flex flex-col h-full">
      {/* Room invite notification */}
      {invite && (
        <div className="absolute top-20 right-4 z-50 glass rounded-xl p-4 shadow-2xl border border-indigo-500/30 max-w-xs">
          <p className="text-sm font-semibold text-white mb-1">🎉 Invitación de sala</p>
          <p className="text-slate-400 text-xs mb-3">
            <span style={{ color: '#a5b4fc' }}>{invite.from}</span> te invita a ver juntos
          </p>
          <div className="flex gap-2">
            <a href={invite.roomUrl} className="btn-primary text-xs py-1.5 px-3">Unirse</a>
            <button onClick={() => setInvite(null)} className="btn-ghost text-xs py-1.5 px-3">Ignorar</button>
          </div>
        </div>
      )}

      <div className="flex gap-0 flex-1 min-h-0">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative rounded-xl overflow-hidden cursor-crosshair select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <canvas ref={canvasRef} className="w-full h-full" />

          {/* Online count */}
          <div className="absolute top-3 left-3 glass rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            {onlineCount} {onlineCount === 1 ? 'persona' : 'personas'}
          </div>

          {/* Controls hint */}
          <div className="absolute bottom-3 left-3 text-xs text-slate-600">
            WASD / flechas para moverte · toca y arrastra en móvil
          </div>
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="w-72 flex flex-col border-l border-white/5 bg-surface-800">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-400">CHAT DE LA SALA</span>
              <button onClick={() => setChatOpen(false)} className="text-slate-600 hover:text-white text-xs">✕</button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
              {messages.length === 0 && (
                <p className="text-slate-600 text-center mt-4">¡Sé el primero en escribir!</p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={msg.userId === 'system' ? 'text-slate-600 italic text-center' : ''}>
                  {msg.userId !== 'system' && (
                    <>
                      <span className="font-bold" style={{ color: msg.color }}>{msg.username}</span>
                      <span className="text-slate-300 ml-1.5 break-words">{msg.message}</span>
                    </>
                  )}
                  {msg.userId === 'system' && <span>{msg.message}</span>}
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-2 border-t border-white/5 flex gap-1.5">
              <input
                className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-slate-600 text-xs outline-none focus:border-indigo-500"
                placeholder="Mensaje..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                maxLength={200}
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim()}
                className="px-2.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs transition-colors"
              >
                ➤
              </button>
            </div>
          </div>
        )}

        {/* Chat toggle when hidden */}
        {!chatOpen && (
          <button
            onClick={() => setChatOpen(true)}
            className="absolute bottom-16 right-4 glass rounded-xl px-3 py-2 text-xs text-slate-300 hover:text-white flex items-center gap-2"
          >
            💬 Chat
          </button>
        )}
      </div>
    </div>
  );
}
