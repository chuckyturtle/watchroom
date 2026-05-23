import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// POST — publish playlist for the first time
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const playlist = await prisma.playlist.findFirst({
    where: { id: params.id, userId: user.userId },
    include: { items: { orderBy: { position: 'asc' } }, published: true },
  });
  if (!playlist) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });
  if (playlist.published) return NextResponse.json({ error: 'Ya publicada', pubId: playlist.published.id }, { status: 409 });
  if (playlist.items.length === 0) return NextResponse.json({ error: 'La lista no tiene canciones' }, { status: 400 });

  const pub = await prisma.publishedPlaylist.create({
    data: {
      id: randomUUID(),
      playlistId: params.id,
      userId: user.userId,
      name: playlist.name,
      items: {
        create: playlist.items.map(item => ({
          id: randomUUID(),
          videoId: item.videoId,
          platform: item.platform,
          title: item.title,
          thumbnail: item.thumbnail,
          channel: item.channel,
          position: item.position,
        })),
      },
    },
  });

  return NextResponse.json({ pubId: pub.id });
}

// PATCH — owner updates the published snapshot
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const playlist = await prisma.playlist.findFirst({
    where: { id: params.id, userId: user.userId },
    include: { items: { orderBy: { position: 'asc' } }, published: true },
  });
  if (!playlist) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });
  if (!playlist.published) return NextResponse.json({ error: 'No publicada aún' }, { status: 404 });
  if (playlist.items.length === 0) return NextResponse.json({ error: 'La lista no tiene canciones' }, { status: 400 });

  const pubId = playlist.published.id;

  // Delete old items and replace with current snapshot
  await prisma.publishedPlaylistItem.deleteMany({ where: { publishedPlaylistId: pubId } });
  await prisma.publishedPlaylist.update({
    where: { id: pubId },
    data: {
      name: playlist.name,
      updatedAt: new Date(),
      items: {
        create: playlist.items.map(item => ({
          id: randomUUID(),
          videoId: item.videoId,
          platform: item.platform,
          title: item.title,
          thumbnail: item.thumbnail,
          channel: item.channel,
          position: item.position,
        })),
      },
    },
  });

  return NextResponse.json({ ok: true });
}
