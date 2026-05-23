import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/discover/[pubId] — full details + items
export async function GET(req: NextRequest, { params }: { params: { pubId: string } }) {
  const user = getUserFromRequest(req);

  const pub = await prisma.publishedPlaylist.findUnique({
    where: { id: params.pubId },
    include: {
      user: { select: { username: true, avatarColor: true } },
      items: { orderBy: { position: 'asc' } },
      _count: { select: { saves: true } },
    },
  });
  if (!pub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });

  let voted = false;
  let saved: { id: string; localPlaylistId: string | null; lastSyncedAt: Date } | null = null;
  let isOwner = false;
  let hasUpdates = false;

  if (user) {
    isOwner = pub.userId === user.userId;
    const [vote, save] = await Promise.all([
      prisma.playlistVote.findUnique({
        where: { publishedPlaylistId_userId: { publishedPlaylistId: params.pubId, userId: user.userId } },
      }),
      prisma.savedPlaylist.findUnique({
        where: { userId_publishedPlaylistId: { userId: user.userId, publishedPlaylistId: params.pubId } },
      }),
    ]);
    voted = !!vote;
    if (save) {
      saved = { id: save.id, localPlaylistId: save.localPlaylistId, lastSyncedAt: save.lastSyncedAt };
      hasUpdates = pub.updatedAt > save.lastSyncedAt;
    }
  }

  return NextResponse.json({
    playlist: {
      id: pub.id,
      name: pub.name,
      rating: pub.rating,
      publishedAt: pub.publishedAt,
      updatedAt: pub.updatedAt,
      owner: pub.user,
      saveCount: pub._count.saves,
      items: pub.items,
    },
    isOwner,
    voted,
    saved,
    hasUpdates,
  });
}
