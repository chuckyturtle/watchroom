import { NextRequest, NextResponse } from 'next/server';

// ── Piped: YouTube gratis, sin anuncios, sin API key ────────────────────────
// Funciona desde servidores cloud (Render, Railway, etc.)
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://piped-api.garudalinux.org',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.mha.fi',
  'https://piped.lunar.icu/api',
];

// ── Invidious: respaldo adicional ────────────────────────────────────────────
// Funciona bien en local; puede estar bloqueado en IPs de cloud
const INVIDIOUS_INSTANCES = [
  'https://invidious.privacydev.net',
  'https://iv.melmac.space',
  'https://invidious.fdn.fr',
  'https://yt.artemislena.eu',
  'https://inv.in.projectsegfau.lt',
  'https://invidious.nerdvpn.de',
  'https://invidious.lunar.icu',
  'https://invidious.io.lol',
];

async function searchPiped(query: string): Promise<any[] | null> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/search?q=${encodeURIComponent(query)}&filter=videos`,
        { headers: { 'User-Agent': 'WatchRoom/1.0' }, signal: AbortSignal.timeout(6000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const videos = (data?.items ?? [])
        .filter((v: any) => v.url?.startsWith('/watch') && v.title)
        .map((v: any) => ({
          id: v.url.replace('/watch?v=', ''),
          title: v.title,
          thumbnail: v.thumbnail,
          channel: v.uploaderName,
          duration: v.duration,
          views: v.views,
          platform: 'youtube',
        }));
      if (videos.length > 0) return videos;
    } catch {
      continue;
    }
  }
  return null;
}

async function searchInvidious(query: string, page: number): Promise<any[] | null> {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=${page}&sort_by=relevance`;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'WatchRoom/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      const videos = data
        .filter((item: any) => item.type === 'video' && item.videoId)
        .map((item: any) => {
          const thumb =
            item.videoThumbnails?.find((t: any) => t.quality === 'medium') ??
            item.videoThumbnails?.[0];
          return {
            id: item.videoId,
            title: item.title,
            thumbnail: thumb?.url,
            channel: item.author,
            views: item.viewCount,
            duration: item.lengthSeconds,
            platform: 'youtube',
          };
        });
      if (videos.length > 0) return videos;
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

      // ─── YouTube ────────────────────────────────────────────────────────────
      case 'youtube': {
        const page = pageToken ? parseInt(pageToken) : 1;

        // 1. Piped (funciona desde Render/cloud)
        const pipedResults = await searchPiped(query);
        if (pipedResults) {
          return NextResponse.json({
            results: pipedResults,
            nextPageToken: pipedResults.length >= 15 ? String(page + 1) : '',
          });
        }

        // 2. Invidious (funciona en local, respaldo cloud)
        const invResults = await searchInvidious(query, page);
        if (invResults) {
          return NextResponse.json({
            results: invResults,
            nextPageToken: invResults.length >= 15 ? String(page + 1) : '',
          });
        }

        return NextResponse.json(
          { error: 'Búsqueda de YouTube temporalmente no disponible, intenta de nuevo', results: [] },
          { status: 503 }
        );
      }

      // ─── Twitch ─────────────────────────────────────────────────────────────
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

      // ─── Kick ───────────────────────────────────────────────────────────────
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
