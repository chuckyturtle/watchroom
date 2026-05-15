import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// 15 points per minute of playback
const POINTS_PER_GRANT = 15;

export async function POST(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const updated = await prisma.user.update({
    where: { id: me.userId },
    data: { points: { increment: POINTS_PER_GRANT } },
    select: { points: true },
  });

  return NextResponse.json({ points: updated.points });
}
