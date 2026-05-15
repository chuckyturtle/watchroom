import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// POST /api/rooms/invite — invite a friend to a room (triggers Socket.io event)
// The actual real-time delivery is handled in server.js via a REST->socket bridge
export async function POST(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { friendUsername, platform, contentId, roomTitle } = await req.json();
  if (!friendUsername || !platform || !contentId) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const friend = await prisma.user.findUnique({ where: { username: friendUsername } });
  if (!friend) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  // Verify friendship
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { requesterId: me.userId, addresseeId: friend.id },
        { requesterId: friend.id, addresseeId: me.userId },
      ],
    },
  });
  if (!friendship) return NextResponse.json({ error: 'No son amigos' }, { status: 403 });

  // The invite is delivered via Socket.io in server.js
  // We return the invite payload for the client to emit via socket
  return NextResponse.json({
    invite: {
      from: { username: me.username, avatarColor: me.avatarColor },
      to: friendUsername,
      toUserId: friend.id,
      platform,
      contentId,
      roomTitle,
      roomUrl: `/room/${platform}/${contentId}`,
    },
  });
}
