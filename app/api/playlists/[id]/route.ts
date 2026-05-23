import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/playlists/[id] — playlist + items
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const playlist = await prisma.playlist.findFirst({
    where: { id: params.id, userId: user.userId },
    include: { items: { orderBy: { position: 'asc' } }, published: { select: { id: true } } },
  });
  if (!playlist) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  return NextResponse.json({ playlist });
}

// PATCH /api/playlists/[id] — rename
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

  const playlist = await prisma.playlist.updateMany({
    where: { id: params.id, userId: user.userId },
    data: { name: name.trim(), updatedAt: new Date() },
  });
  if (playlist.count === 0) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/playlists/[id] — delete playlist
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  await prisma.playlist.deleteMany({ where: { id: params.id, userId: user.userId } });
  return NextResponse.json({ ok: true });
}
