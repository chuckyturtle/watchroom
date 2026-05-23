const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

// ── Database bootstrap ────────────────────────────────────────────────────────
// Strip 'channel_binding' from DATABASE_URL — Prisma's engine doesn't support it
// and Neon adds it by default.
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL
    .replace(/[?&]channel_binding=[^&]*/g, '')
    .replace(/\?$/, '');
}

async function ensureSchema() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: ['error'] });
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id"                TEXT         NOT NULL,
        "email"             TEXT         NOT NULL,
        "username"          TEXT         NOT NULL,
        "password"          TEXT         NOT NULL,
        "bio"               TEXT,
        "avatarColor"       TEXT         NOT NULL DEFAULT '#6366f1',
        "points"            INTEGER      NOT NULL DEFAULT 0,
        "isVerified"        BOOLEAN      NOT NULL DEFAULT false,
        "verificationToken" TEXT,
        "resetToken"        TEXT,
        "resetTokenExpiry"  TIMESTAMP(3),
        "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key"    ON "User"("email");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");`);

    // Add points column if it was missing from a manually-created table
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0;
      EXCEPTION WHEN others THEN NULL; END; $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Friendship" (
        "id"          TEXT         NOT NULL,
        "requesterId" TEXT         NOT NULL,
        "addresseeId" TEXT         NOT NULL,
        "status"      TEXT         NOT NULL DEFAULT 'PENDING',
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Friendship_requesterId_addresseeId_key"
        ON "Friendship"("requesterId", "addresseeId");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Friendship"
          ADD CONSTRAINT "Friendship_requesterId_fkey"
          FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Friendship"
          ADD CONSTRAINT "Friendship_addresseeId_fkey"
          FOREIGN KEY ("addresseeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Playlist" (
        "id"        TEXT         NOT NULL,
        "userId"    TEXT         NOT NULL,
        "name"      TEXT         NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "Playlist"
          ADD CONSTRAINT "Playlist_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlaylistItem" (
        "id"         TEXT         NOT NULL,
        "playlistId" TEXT         NOT NULL,
        "videoId"    TEXT         NOT NULL,
        "platform"   TEXT         NOT NULL DEFAULT 'youtube',
        "title"      TEXT         NOT NULL,
        "thumbnail"  TEXT         NOT NULL DEFAULT '',
        "channel"    TEXT         NOT NULL DEFAULT '',
        "position"   INTEGER      NOT NULL DEFAULT 0,
        "addedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PlaylistItem"
          ADD CONSTRAINT "PlaylistItem_playlistId_fkey"
          FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    // ── PublishedPlaylist ──────────────────────────────────────────────────
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PublishedPlaylist" (
        "id"          TEXT         NOT NULL,
        "playlistId"  TEXT         NOT NULL,
        "userId"      TEXT         NOT NULL,
        "name"        TEXT         NOT NULL,
        "rating"      INTEGER      NOT NULL DEFAULT 0,
        "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PublishedPlaylist_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PublishedPlaylist_playlistId_key" ON "PublishedPlaylist"("playlistId");`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublishedPlaylist" ADD CONSTRAINT "PublishedPlaylist_playlistId_fkey"
          FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublishedPlaylist" ADD CONSTRAINT "PublishedPlaylist_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PublishedPlaylistItem" (
        "id"                  TEXT    NOT NULL,
        "publishedPlaylistId" TEXT    NOT NULL,
        "videoId"             TEXT    NOT NULL,
        "platform"            TEXT    NOT NULL DEFAULT 'youtube',
        "title"               TEXT    NOT NULL,
        "thumbnail"           TEXT    NOT NULL DEFAULT '',
        "channel"             TEXT    NOT NULL DEFAULT '',
        "position"            INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "PublishedPlaylistItem_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PublishedPlaylistItem" ADD CONSTRAINT "PublishedPlaylistItem_publishedPlaylistId_fkey"
          FOREIGN KEY ("publishedPlaylistId") REFERENCES "PublishedPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PlaylistVote" (
        "id"                  TEXT         NOT NULL,
        "publishedPlaylistId" TEXT         NOT NULL,
        "userId"              TEXT         NOT NULL,
        "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PlaylistVote_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PlaylistVote_publishedPlaylistId_userId_key" ON "PlaylistVote"("publishedPlaylistId","userId");`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PlaylistVote" ADD CONSTRAINT "PlaylistVote_publishedPlaylistId_fkey"
          FOREIGN KEY ("publishedPlaylistId") REFERENCES "PublishedPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "PlaylistVote" ADD CONSTRAINT "PlaylistVote_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SavedPlaylist" (
        "id"                  TEXT         NOT NULL,
        "userId"              TEXT         NOT NULL,
        "publishedPlaylistId" TEXT         NOT NULL,
        "localPlaylistId"     TEXT,
        "lastSyncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SavedPlaylist_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "SavedPlaylist_userId_publishedPlaylistId_key" ON "SavedPlaylist"("userId","publishedPlaylistId");`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "SavedPlaylist" ADD CONSTRAINT "SavedPlaylist_publishedPlaylistId_fkey"
          FOREIGN KEY ("publishedPlaylistId") REFERENCES "PublishedPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "SavedPlaylist" ADD CONSTRAINT "SavedPlaylist_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL; END; $$;
    `);

    console.log('✅ Database schema verified');
  } catch (err) {
    console.error('❌ Schema bootstrap failed:', err.message);
    // Don't exit — maybe the tables already exist and we can still serve traffic
  } finally {
    await prisma.$disconnect();
  }
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

ensureSchema().then(() => app.prepare()).then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  // rooms: roomId -> Map<socketId, userData>
  const rooms = new Map();
  // userIndex: userId -> socketId (for invite delivery)
  const userIndex = new Map();
  // queues: roomId -> QueueItem[]
  const queues = new Map();
  // lastAdvance: roomId -> timestamp — deduplicates simultaneous queue-advance from multiple clients
  const lastAdvance = new Map();

  function getQueue(roomId) {
    if (!queues.has(roomId)) queues.set(roomId, []);
    return queues.get(roomId);
  }

  io.on('connection', (socket) => {
    let currentRoom = null;
    let currentUser = null;
    let registeredUserId = null;

    socket.on('register-user', ({ userId }) => {
      registeredUserId = userId;
      userIndex.set(userId, socket.id);
    });

    socket.on('join-room', ({ roomId, userId, username, color }) => {
      currentRoom = roomId;
      currentUser = { userId, username, color, x: 0, z: 4 };
      socket.join(roomId);
      if (!rooms.has(roomId)) rooms.set(roomId, new Map());
      rooms.get(roomId).set(socket.id, currentUser);

      const existing = Array.from(rooms.get(roomId).entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, u]) => ({ socketId: id, ...u }));

      socket.emit('room-users', existing);
      socket.to(roomId).emit('user-joined', { socketId: socket.id, ...currentUser });

      // Send current queue to the joining user, and play the current video if one is active
      const currentQueue = getQueue(roomId);
      socket.emit('queue-updated', { queue: currentQueue });
      if (currentQueue.length > 0) {
        socket.emit('queue-play', { item: currentQueue[0], queue: currentQueue });
      }
    });

    socket.on('move', ({ x, z }) => {
      if (!currentRoom || !currentUser) return;
      currentUser.x = x;
      currentUser.z = z;
      rooms.get(currentRoom)?.set(socket.id, currentUser);
      socket.to(currentRoom).emit('user-moved', { socketId: socket.id, x, z });
    });

    socket.on('chat-message', ({ message }) => {
      if (!currentRoom || !currentUser) return;
      // Broadcast to everyone else; sender already updates their own UI immediately
      socket.to(currentRoom).emit('chat-message', {
        socketId: socket.id,
        userId: currentUser.userId,
        username: currentUser.username,
        color: currentUser.color,
        message,
        timestamp: Date.now(),
      });
    });

    socket.on('change-video', ({ platform, contentId }) => {
      if (!currentRoom) return;
      socket.to(currentRoom).emit('video-changed', { platform, contentId });
    });

    socket.on('change-global-video', ({ videoId }) => {
      if (!currentRoom) return;
      io.to(currentRoom).emit('global-video-changed', { videoId });
    });

    // ── Queue events ──────────────────────────────────────────────────────────

    // Client already deducted 30 pts via /api/points/deduct before emitting this
    socket.on('queue-add', ({ videoId, videoTitle, thumbnail, platform }) => {
      if (!currentRoom || !currentUser) return;
      const queue = getQueue(currentRoom);
      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        userId: currentUser.userId,
        username: currentUser.username,
        color: currentUser.color,
        videoId,
        videoTitle: videoTitle || 'Video sin título',
        thumbnail: thumbnail || '',
        platform: platform || 'youtube',
      };
      queue.push(item);
      io.to(currentRoom).emit('queue-updated', { queue: [...queue] });
      // If this is the only item, play it immediately
      if (queue.length === 1) {
        io.to(currentRoom).emit('queue-play', { item, queue: [...queue] });
      }
    });

    // Advance to next video in queue (video ended or skip paid)
    socket.on('queue-advance', () => {
      if (!currentRoom) return;
      const queue = getQueue(currentRoom);
      if (queue.length === 0) return;

      // Deduplicate: all clients detect video-end simultaneously, only process once per 5 s
      const now = Date.now();
      if (now - (lastAdvance.get(currentRoom) || 0) < 5000) return;
      lastAdvance.set(currentRoom, now);

      queue.shift(); // Remove now-playing item
      io.to(currentRoom).emit('queue-updated', { queue: [...queue] });
      if (queue.length > 0) {
        io.to(currentRoom).emit('queue-play', { item: queue[0], queue: [...queue] });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────

    socket.on('send-invite', (invite) => {
      const targetSocketId = userIndex.get(invite.toUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('room-invite', {
          from: invite.from.username,
          roomUrl: invite.roomUrl,
          platform: invite.platform,
          contentId: invite.contentId,
        });
      }
    });

    socket.on('disconnect', () => {
      if (registeredUserId) userIndex.delete(registeredUserId);
      if (currentRoom) {
        rooms.get(currentRoom)?.delete(socket.id);
        if (rooms.get(currentRoom)?.size === 0) {
          rooms.delete(currentRoom);
          queues.delete(currentRoom);
          lastAdvance.delete(currentRoom);
        }
        io.to(currentRoom).emit('user-left', { socketId: socket.id, username: currentUser?.username || '' });
      }
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let localIp = 'tu-ip-local';
    for (const iface of Object.values(nets)) {
      for (const net of iface) {
        if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
      }
    }
    console.log(`\n🎬 WatchRoom listo en:`);
    console.log(`   PC:     http://localhost:${port}`);
    console.log(`   Móvil:  http://${localIp}:${port}\n`);
  });
});
