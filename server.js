const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true);
    await handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  // rooms: roomId -> Map<socketId, userData>
  const rooms = new Map();
  // userIndex: userId -> socketId (for invite delivery)
  const userIndex = new Map();

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
      io.to(currentRoom).emit('new-message', {
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
        if (rooms.get(currentRoom)?.size === 0) rooms.delete(currentRoom);
        io.to(currentRoom).emit('user-left', socket.id);
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
