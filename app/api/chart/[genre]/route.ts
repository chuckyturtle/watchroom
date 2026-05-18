import { NextRequest, NextResponse } from 'next/server';

// ── Billboard chart IDs per genre ─────────────────────────────────────────────
const BILLBOARD_CHART_IDS: Record<string, string> = {
  trap:      'hot-rap-songs',
  reggaeton: 'hot-latin-songs',
  edm:       'dance-electronic-songs',
  rock:      'hot-rock-and-alternative-songs',
  rnb:       'hot-r-b-hip-hop-songs',
  pop:       'pop-airplay',
  latinpop:  'latin-pop-airplay',
  corridos:  'regional-mexican-airplay',
  global:    'hot-100',
};

// ── YouTube search queries per genre (primary) ───────────────────────────────
const YT_QUERIES: Record<string, string> = {
  trap:         'trap hip hop official music video 2024 2025',
  reggaeton:    'reggaeton official music video 2024 2025',
  edm:          'electronic dance edm official music video 2025',
  rock:         'rock official music video 2024 2025',
  rnb:          'rnb soul official music video 2024 2025',
  pop:          'pop official music video 2024 2025',
  latinpop:     'latin pop musica oficial 2024 2025',
  corridos:     'corridos tumbados video oficial 2024 2025',
  rapenespanol: 'rap mexicano boom bap video oficial',
  global:       'top hits official music video 2025',
};

// ── Alternate queries tried when primary returns < 5 tracks ──────────────────
const YT_ALT_QUERIES: Record<string, string> = {
  rapenespanol: 'hip hop mexicano underground rap en español video oficial',
};

// ── Invidious instances (free YouTube proxy, no key needed) ──────────────────
const INVIDIOUS_INSTANCES = [
  'https://iv.melmac.space',
  'https://inv.in.projectsegfau.lt',
  'https://invidious.fdn.fr',
  'https://yt.artemislena.eu',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacydev.net',
];

interface ChartTrack { id: string; title: string; channel: string; thumbnail?: string; }

// ── Daily server-side cache: genre → { date, tracks } ────────────────────────
const chartCache = new Map<string, { date: string; tracks: ChartTrack[] }>();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Billboard charts are published weekly (Saturdays).
// Returns the most recent Saturday so the API always has a valid chart date.
function getBillboardDate(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 6 ? 0 : (dow + 1); // days since last Saturday
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 1: Billboard (RapidAPI) → artist+title list
// ─────────────────────────────────────────────────────────────────────────────
async function fetchBillboardTracks(chartId: string): Promise<{ artist: string; title: string }[]> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return [];

  const chartDate = getBillboardDate();

  // Try with the most-recent Saturday first; then without a date (API returns latest)
  const urls = [
    `https://billboard-charts-api.p.rapidapi.com/chart?id=${encodeURIComponent(chartId)}&date=${chartDate}&rankings=10`,
    `https://billboard-charts-api.p.rapidapi.com/chart?id=${encodeURIComponent(chartId)}&rankings=10`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': key,
          'x-rapidapi-host': 'billboard-charts-api.p.rapidapi.com',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();

      // Handle every known response shape from this API
      const raw = (
        data.songs ??
        data.chart?.songs ??
        data.data?.songs ??
        data.data ??
        data.entries ??
        data.chart?.entries ??
        data.results ??
        (Array.isArray(data) ? data : [])
      );
      const entries: any[] = Array.isArray(raw) ? raw.slice(0, 10) : [];

      const tracks = entries
        .map((e: any) => ({
          artist: String(e.artist ?? e.performer ?? e.artistName ?? e.name ?? '').trim(),
          title:  String(e.title  ?? e.song      ?? e.trackName  ?? e.name ?? '').trim(),
        }))
        .filter(e => e.title.length > 0);

      if (tracks.length >= 3) return tracks;
    } catch { /* try next */ }
  }
  return [];
}

async function searchYouTubeVideoId(query: string): Promise<ChartTrack | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&q=${encodeURIComponent(query)}&type=video` +
      `&videoCategoryId=10&maxResults=1&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;
    return {
      id:        item.id.videoId,
      title:     item.snippet.title,
      channel:   item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 2: YouTube Data API v3 — genre search ordered by view count
// ─────────────────────────────────────────────────────────────────────────────
async function fetchYouTubeChart(query: string): Promise<ChartTrack[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&q=${encodeURIComponent(query)}&type=video` +
      `&videoCategoryId=10&order=viewCount&maxResults=10&key=${key}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? [])
      .filter((item: any) => item.id?.videoId)
      .map((item: any): ChartTrack => ({
        id:        item.id.videoId,
        title:     item.snippet.title,
        channel:   item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
      }));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY 3: Invidious (free YouTube proxy, no key needed)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchInvidiousChart(query: string): Promise<ChartTrack[]> {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&page=1&sort_by=view_count`;
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        headers: { 'User-Agent': 'WatchRoom/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      const tracks = data
        .filter((item: any) => item.type === 'video' && item.videoId)
        .slice(0, 10)
        .map((item: any): ChartTrack => {
          const thumb = item.videoThumbnails?.find((t: any) => t.quality === 'medium')
            ?? item.videoThumbnails?.[0];
          return { id: item.videoId, title: item.title, channel: item.author, thumbnail: thumb?.url };
        });
      if (tracks.length > 0) return tracks;
    } catch { continue; }
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: { genre: string } }
) {
  const { genre } = params;
  const today = todayStr();
  const force = req.nextUrl.searchParams.get('force') === 'true';

  // Serve daily cache unless force-refresh requested
  const cached = chartCache.get(genre);
  if (!force && cached?.date === today && cached.tracks.length > 0) {
    return NextResponse.json({ genre, date: today, source: 'cache', tracks: cached.tracks });
  }

  let tracks: ChartTrack[] = [];
  let source = 'invidious';

  // ── Strategy 1: Billboard (real chart) + YouTube (find official video) ────
  const chartId = BILLBOARD_CHART_IDS[genre];
  if (chartId && process.env.RAPIDAPI_KEY && process.env.YOUTUBE_API_KEY) {
    const bbEntries = await fetchBillboardTracks(chartId);
    if (bbEntries.length >= 3) {
      const results = await Promise.all(
        bbEntries.map(e =>
          searchYouTubeVideoId(`${e.artist} ${e.title} official music video`)
        )
      );
      tracks = results.filter((t): t is ChartTrack => t !== null);
      if (tracks.length >= 5) source = 'billboard+youtube';
    }
  }

  // ── Strategy 1b: Billboard only (no YouTube key) — use title+artist as track ─
  // Skip here — we need a YouTube video ID to play; fall through to strategy 2.

  // ── Strategy 2: YouTube Data API v3 — top videos by view count for genre ──
  if (tracks.length < 5 && process.env.YOUTUBE_API_KEY) {
    const ytQuery = YT_QUERIES[genre] ?? `${genre} official music video`;
    const ytTracks = await fetchYouTubeChart(ytQuery);
    if (ytTracks.length > tracks.length) { tracks = ytTracks; source = 'youtube'; }
    // Retry with alt query if primary returned too few results
    if (tracks.length < 5 && YT_ALT_QUERIES[genre]) {
      const alt = await fetchYouTubeChart(YT_ALT_QUERIES[genre]);
      if (alt.length > tracks.length) { tracks = alt; source = 'youtube'; }
    }
  }

  // ── Strategy 3: Invidious — free YouTube proxy, no key needed ─────────────
  if (tracks.length < 5) {
    const invQuery = YT_QUERIES[genre] ?? `${genre} official music video`;
    const invTracks = await fetchInvidiousChart(invQuery);
    if (invTracks.length > tracks.length) { tracks = invTracks; source = 'invidious'; }
    // Retry with alt query if primary returned too few results
    if (tracks.length < 5 && YT_ALT_QUERIES[genre]) {
      const alt = await fetchInvidiousChart(YT_ALT_QUERIES[genre]);
      if (alt.length > tracks.length) { tracks = alt; source = 'invidious'; }
    }
  }

  // Save to daily cache (even a partial result is worth caching)
  if (tracks.length > 0) {
    chartCache.set(genre, { date: today, tracks });
  }

  const finalTracks = tracks.length > 0 ? tracks : (cached?.tracks ?? []);
  return NextResponse.json({
    genre,
    date:   today,
    source,
    tracks: finalTracks,
  }, {
    status: finalTracks.length > 0 ? 200 : 503,
  });
}
