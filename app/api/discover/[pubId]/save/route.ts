import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// POST — save a copy of a public playlist to your library
export async function POST(req: NextRequest, { params }: { params: { pubId: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const pub = await prisma.publishedPlaylist.findUnique({
    where: { id: params.pubId },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!pub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  const existing = await prisma.savedPlaylist.findUnique({
    where: { userId_publishedPlaylistId: { userId: user.userId, publishedPlaylistId: params.pubId } },
  });
  if (existing) return NextResponse.json({ error: 'Ya guardada', localPlaylistId: existing.localPlaylistId }, { status: 409 });

  // Create a local copy playlist
  const localPlaylistId = randomUUID();
  await prisma.playlist.create({
    data: {
      id: localPlaylistId,
      userId: user.userId,
      name: pub.name,
      items: {
        create: pub.items.map(item => ({
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

  await prisma.savedPlaylist.create({
    data: {
      id: randomUUID(),
      userId: user.userId,
      publishedPlaylistId: params.pubId,
      localPlaylistId,
      lastSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ localPlaylistId });
}
