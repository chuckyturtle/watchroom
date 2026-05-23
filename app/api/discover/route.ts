import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// GET /api/discover?q=&sort=featured|recent&page=0
export async function GET(req: NextRequest) {
  const user = getUserFromRequest(req);
  const { searchParams } = new URL(req.url);
  const q    = searchParams.get('q')?.trim() || '';
  const sort = searchParams.get('sort') || 'featured';
  const page = Math.max(0, parseInt(searchParams.get('page') || '0', 10));
  const take = 18;

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { items: { some: { title: { contains: q, mode: 'insensitive' as const } } } },
          { user: { username: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const orderBy = sort === 'recent'
    ? { publishedAt: 'desc' as const }
    : { rating: 'desc' as const };

  const [items, total] = await Promise.all([
    prisma.publishedPlaylist.findMany({
      where,
      orderBy,
      skip: page * take,
      take,
      include: {
        user: { select: { username: true, avatarColor: true } },
        items: { orderBy: { position: 'asc' }, take: 4 },
        _count: { select: { items: true, saves: true } },
      },
    }),
    prisma.publishedPlaylist.count({ where }),
  ]);

  // For logged-in users, include their vote status
  let votedIds: Set<string> = new Set();
  let savedIds: Set<string> = new Set();
  if (user) {
    const [votes, saves] = await Promise.all([
      prisma.playlistVote.findMany({
        where: { userId: user.userId, publishedPlaylistId: { in: items.map(i => i.id) } },
        select: { publishedPlaylistId: true },
      }),
      prisma.savedPlaylist.findMany({
        where: { userId: user.userId, publishedPlaylistId: { in: items.map(i => i.id) } },
        select: { publishedPlaylistId: true },
      }),
    ]);
    votedIds = new Set(votes.map(v => v.publishedPlaylistId));
    savedIds = new Set(saves.map(s => s.publishedPlaylistId));
  }

  return NextResponse.json({
    playlists: items.map(p => ({
      id: p.id,
      name: p.name,
      rating: p.rating,
      publishedAt: p.publishedAt,
      updatedAt: p.updatedAt,
      owner: p.user,
      itemCount: p._count.items,
      saveCount: p._count.saves,
      preview: p.items.map(i => ({ thumbnail: i.thumbnail, title: i.title })),
      voted: votedIds.has(p.id),
      saved: savedIds.has(p.id),
    })),
    total,
    page,
    pages: Math.ceil(total / take),
  });
}
