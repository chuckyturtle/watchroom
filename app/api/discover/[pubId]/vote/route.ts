import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { randomUUID } from 'crypto';

// POST — toggle +1 vote
export async function POST(req: NextRequest, { params }: { params: { pubId: string } }) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const pub = await prisma.publishedPlaylist.findUnique({ where: { id: params.pubId } });
  if (!pub) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  if (pub.userId === user.userId) return NextResponse.json({ error: 'No puedes votar tu propio playlist' }, { status: 400 });

  const existing = await prisma.playlistVote.findUnique({
    where: { publishedPlaylistId_userId: { publishedPlaylistId: params.pubId, userId: user.userId } },
  });

  if (existing) {
    // Remove vote
    await prisma.playlistVote.delete({ where: { id: existing.id } });
    await prisma.publishedPlaylist.update({
      where: { id: params.pubId },
      data: { rating: { decrement: 1 } },
    });
    return NextResponse.json({ voted: false });
  } else {
    // Add vote
    await prisma.playlistVote.create({
      data: { id: randomUUID(), publishedPlaylistId: params.pubId, userId: user.userId },
    });
    await prisma.publishedPlaylist.update({
      where: { id: params.pubId },
      data: { rating: { increment: 1 } },
    });
    return NextResponse.json({ voted: true });
  }
}
