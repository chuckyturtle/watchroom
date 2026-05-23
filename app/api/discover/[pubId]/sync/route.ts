import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// POST — sync saved local playlist with updated published version
export async function POST(req: NextRequest, { params }: { params: { pubId: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [pub, savedRecord] = await Promise.all([
    prisma.publishedPlaylist.findUnique({
      where: { id: params.pubId },
      include: { items: { orderBy: { position: 'asc' } } },
    }),
    prisma.savedPlaylist.findUnique({
      where: { userId_publishedPlaylistId: { userId: user.userId, publishedPlaylistId: params.pubId } },
    }),
  ]);

  if (!pub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (!savedRecord) return NextResponse.json({ error: 'No tienes este playlist guardado' }, { status: 404 });

  const localId = savedRecord.localPlaylistId;
  if (!localId) return NextResponse.json({ error: 'Sin copia local' }, { status: 400 });

  // Replace local playlist items with the updated published items
  await prisma.playlistItem.deleteMany({ where: { playlistId: localId } });
  await prisma.playlist.update({
    where: { id: localId },
    data: {
      name: pub.name,
      updatedAt: new Date(),
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

  await prisma.savedPlaylist.update({
    where: { id: savedRecord.id },
    data: { lastSyncedAt: new Date() },
  });

  return NextResponse.json({ ok: true, localPlaylistId: localId });
}
