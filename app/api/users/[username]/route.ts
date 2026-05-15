import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { username: string } }) {
  const me = getUserFromRequest(req);

  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: { id: true, username: true, avatarColor: true, bio: true, createdAt: true },
  });

  if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  let friendshipStatus: string | null = null;
  if (me && me.userId !== user.id) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: me.userId, addresseeId: user.id },
          { requesterId: user.id, addresseeId: me.userId },
        ],
      },
    });
    if (friendship) {
      friendshipStatus = friendship.status === 'ACCEPTED'
        ? 'friends'
        : friendship.requesterId === me.userId
        ? 'sent'
        : 'received';
    }
  }

  return NextResponse.json({ user, friendshipStatus, isMe: me?.userId === user.id });
}
