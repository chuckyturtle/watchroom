import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// PATCH /api/friends/[id] — accept/decline
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { action } = await req.json(); // 'accept' | 'decline'

  const friendship = await prisma.friendship.findUnique({ where: { id: params.id } });
  if (!friendship || friendship.addresseeId !== me.userId) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  if (action === 'accept') {
    await prisma.friendship.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED' },
    });
    return NextResponse.json({ message: 'Solicitud aceptada' });
  }

  await prisma.friendship.delete({ where: { id: params.id } });
  return NextResponse.json({ message: 'Solicitud rechazada' });
}

// DELETE /api/friends/[id] — remove friend
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const me = getUserFromRequest(req);
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const friendship = await prisma.friendship.findUnique({ where: { id: params.id } });
  if (!friendship || (friendship.requesterId !== me.userId && friendship.addresseeId !== me.userId)) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: params.id } });
  return NextResponse.json({ message: 'Amigo eliminado' });
}
