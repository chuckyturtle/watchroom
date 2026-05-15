import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { points: true },
  });

  return NextResponse.json({ points: user?.points ?? 0 });
}
