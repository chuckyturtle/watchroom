import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// GET /api/playlists — list user's playlists
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const playlists = await prisma.playlist.findMany({
    where: { userId: user.userId },
    include: { _count: { select: { items: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ playlists: playlists.map(p => ({
    id: p.id,
    name: p.name,
    itemCount: p._count.items,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }))});
}

// POST /api/playlists — create playlist
export async function POST(req: NextRequest) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
  if (name.trim().length > 60) return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 });

  const playlist = await prisma.playlist.create({
    data: { id: randomUUID(), userId: user.userId, name: name.trim() },
  });

  return NextResponse.json({ playlist: { id: playlist.id, name: playlist.name, itemCount: 0 } });
}
