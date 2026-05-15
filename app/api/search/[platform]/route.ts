import { NextRequest, NextResponse } from 'next/server';

// Instancias públicas de Invidious (YouTube sin API key, gratis)
const INVIDIOUS_INSTANCES = [
  'https://iv.melmac.space',
  'https://inv.in.projectsegfau.lt',
];

async function fetchInvidious(path: string): Promise<any> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'WatchRoom/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const { platform } = params;
  const query = req.nextUrl.searchParams.get('q') || '';
  const pageToken = req.nextUrl.searchParams.get('pageToken') || '';

  if (!query.trim()) return NextResponse.json({ results: [] });

  try {
    switch (platform) {

      // ─── YouTube via Invidious API (sin API key, completamente gratis) ───
      case 'youtube': {
        const page = pageToken ? parseInt(pageToken) : 1;
        const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${page}&sort_by=relevance`;

        const data = await fetchInvidious(path);

        if (!data) {
          return NextResponse.json(
            { error: 'Búsqueda de YouTube temporalmente no disponible, intenta de nuevo', results: [] },
            { status: 503 }
          );
        }

        const results = data
          .filter((item: any) => item.type === 'video' && item.videoId)
          .map((item: any) => {
            const thumb = item.videoThumbnails?.find((t: any) => t.quality === 'medium')
              || item.videoThumbnails?.[0];
            return {
              id: item.videoId,
              title: item.title,
              thumbnail: thumb?.url,
              channel: item.author,
              description: item.description,
              views: item.viewCount,
              duration: item.lengthSeconds,
              uploadedDate: item.publishedText,
              platform: 'youtube',
            };
          });

        return NextResponse.json({
          results,
          nextPageToken: results.length >= 15 ? String(page + 1) : '',
        });
      }

      // ─── Twitch ───
      case 'twitch': {
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return NextResponse.json({ error: 'Twitch API no configurada', results: [] }, { status: 503 });
        }

        const tokenRes = await fetch(
          `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
          { method: 'POST' }
        );
        const { access_token } = await tokenRes.json();

        const searchRes = await fetch(
          `https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=24`,
          { headers: { 'Client-ID': clientId, Authorization: `Bearer ${access_token}` } }
        );
        const searchData = await searchRes.json();

        return NextResponse.json({
          results: (searchData.data || []).map((item: any) => ({
            id: item.broadcaster_login,
            title: item.title || item.display_name,
            thumbnail: item.thumbnail_url?.replace('{width}', '320').replace('{height}', '180'),
            channel: item.display_name,
            isLive: item.is_live,
            gameName: item.game_name,
            platform: 'twitch',
          })),
        });
      }

      // ─── Kick ───
      case 'kick': {
        const res = await fetch(
          `https://kick.com/api/v2/search?searched_phrase=${encodeURIComponent(query)}`,
          { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } }
        );

        if (!res.ok) return NextResponse.json({ results: [], message: 'Kick no disponible temporalmente' });

        const data = await res.json();

        return NextResponse.json({
          results: (data.channels || []).map((item: any) => ({
            id: item.slug || item.username,
            title: item.livestream?.session_title || item.user?.username || item.slug,
            thumbnail: item.user?.profile_pic || item.banner_image?.url,
            channel: item.user?.username || item.slug,
            isLive: !!item.livestream,
            viewers: item.livestream?.viewer_count,
            category: item.category?.name,
            platform: 'kick',
          })),
        });
      }

      default:
        return NextResponse.json({ error: 'Plataforma desconocida' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Search ${platform} error:`, error);
    return NextResponse.json({ error: 'Error en la búsqueda', results: [] }, { status: 500 });
  }
}
