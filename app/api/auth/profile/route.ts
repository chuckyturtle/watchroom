import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { bio, avatarColor } = await req.json();

  const updated = await prisma.user.update({
    where: { id: me.userId },
    data: { bio, avatarColor },
    select: { id: true, email: true, username: true, avatarColor: true, bio: true },
  });

  return NextResponse.json({ user: updated });
}
