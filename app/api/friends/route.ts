import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/friends — list all accepted friends + pending requests
export async function GET(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [accepted, pending, received] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me.userId }, { addresseeId: me.userId }],
      },
      include: {
        requester: { select: { id: true, username: true, avatarColor: true, bio: true } },
        addressee: { select: { id: true, username: true, avatarColor: true, bio: true } },
      },
    }),
    prisma.friendship.findMany({
      where: { requesterId: me.userId, status: 'PENDING' },
      include: {
        addressee: { select: { id: true, username: true, avatarColor: true } },
      },
    }),
    prisma.friendship.findMany({
      where: { addresseeId: me.userId, status: 'PENDING' },
      include: {
        requester: { select: { id: true, username: true, avatarColor: true } },
      },
    }),
  ]);

  const friends = accepted.map((f) => {
    const friend = f.requesterId === me.userId ? f.addressee : f.requester;
    return { friendshipId: f.id, ...friend };
  });

  return NextResponse.json({
    friends,
    sentRequests: pending.map((f) => ({ friendshipId: f.id, ...f.addressee })),
    receivedRequests: received.map((f) => ({ friendshipId: f.id, ...f.requester })),
  });
}

// POST /api/friends — send friend request by username
export async function POST(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { username } = await req.json();
  if (!username) return NextResponse.json({ error: 'Username requerido' }, { status: 400 });

  if (username === me.username) {
    return NextResponse.json({ error: 'No puedes agregarte a ti mismo' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { username } });
  if (!target) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: me.userId },
      ],
    },
  });

  if (existing) {
    const msg =
      existing.status === 'ACCEPTED'
        ? 'Ya son amigos'
        : existing.status === 'PENDING'
        ? 'Ya existe una solicitud pendiente'
        : 'Solicitud no disponible';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: me.userId, addresseeId: target.id },
  });

  return NextResponse.json({ message: 'Solicitud enviada', friendshipId: friendship.id });
}
