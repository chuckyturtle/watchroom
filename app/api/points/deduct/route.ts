import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { amount } = await req.json();
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: me.userId }, select: { points: true } });
  if (!user || user.points < amount) {
    return NextResponse.json({ error: 'Puntos insuficientes' }, { status: 402 });
  }

  const updated = await prisma.user.update({
    where: { id: me.userId },
    data: { points: { decrement: amount } },
    select: { points: true },
  });

  return NextResponse.json({ points: updated.points });
}
