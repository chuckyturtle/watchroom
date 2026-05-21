import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// POST /api/playlists/[id]/items — add video to playlist
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Verify playlist belongs to user
  const playlist = await prisma.playlist.findFirst({
    where: { id: params.id, userId: user.userId },
  });
  if (!playlist) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });

  const { videoId, platform = 'youtube', title, thumbnail = '', channel = '' } = await req.json();
  if (!videoId || !title) return NextResponse.json({ error: 'Faltan datos del video' }, { status: 400 });

  // Check duplicate
  const exists = await prisma.playlistItem.findFirst({ where: { playlistId: params.id, videoId } });
  if (exists) return NextResponse.json({ error: 'Ya está en esta lista' }, { status: 409 });

  const maxPos = await prisma.playlistItem.aggregate({
    where: { playlistId: params.id },
    _max: { position: true },
  });
  const position = (maxPos._max.position ?? -1) + 1;

  const item = await prisma.playlistItem.create({
    data: { id: randomUUID(), playlistId: params.id, videoId, platform, title, thumbnail, channel, position },
  });

  // Update playlist updatedAt
  await prisma.playlist.update({ where: { id: params.id }, data: { updatedAt: new Date() } });

  return NextResponse.json({ item });
}
