import { NextRequest, NextResponse } from 'next/server';

const INVIDIOUS_INSTANCES = [
  'https://iv.melmac.space',
  'https://inv.in.projectsegfau.lt',
];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'No id' }, { status: 400 });

  // YouTube direct thumbnail — always reliable, no API key needed
  const thumbnail = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

  // Try Invidious for title/channel/views/duration
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${id}?fields=title,author,viewCount,lengthSeconds`, {
        headers: { 'User-Agent': 'WatchRoom/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data.title) continue;
      return NextResponse.json({
        id,
        title: data.title,
        channel: data.author || '',
        thumbnail,
        views: data.viewCount,
        duration: data.lengthSeconds,
      });
    } catch {
      continue;
    }
  }

  // Fallback: oEmbed for title/channel (free, no API key)
  try {
    const oe = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (oe.ok) {
      const info = await oe.json();
      return NextResponse.json({
        id,
        title: info.title || id,
        channel: info.author_name || '',
        thumbnail,
      });
    }
  } catch {}

  return NextResponse.json({ id, title: id, channel: '', thumbnail });
}
