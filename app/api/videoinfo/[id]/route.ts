import { NextRequest, NextResponse } from 'next/server';

const INVIDIOUS_INSTANCES = [
  'https://iv.melmac.space',
  'https://inv.in.projectsegfau.lt',
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${id}?fields=title,author,videoThumbnails,viewCount,lengthSeconds`, {
        headers: { 'User-Agent': 'WatchRoom/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const thumb = data.videoThumbnails?.find((t: any) => t.quality === 'medium') || data.videoThumbnails?.[0];
      return NextResponse.json({
        id,
        title: data.title || id,
        channel: data.author || '',
        thumbnail: thumb?.url || '',
        views: data.viewCount,
        duration: data.lengthSeconds,
      });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ id, title: id, channel: '', thumbnail: '' });
}
