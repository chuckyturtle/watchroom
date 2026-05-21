import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

// DELETE /api/playlists/[id]/items/[itemId] — remove item from playlist
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Verify playlist belongs to user
  const playlist = await prisma.playlist.findFirst({
    where: { id: params.id, userId: user.userId },
  });
  if (!playlist) return NextResponse.json({ error: 'Lista no encontrada' }, { status: 404 });

  await prisma.playlistItem.deleteMany({
    where: { id: params.itemId, playlistId: params.id },
  });

  return NextResponse.json({ ok: true });
}
